// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// compColumn pairs a comp_packages column with the CompPackage field it holds.
// field is a pointer (*string, *int64, *int, *float64) or an optionalString.
type compColumn struct {
	name  string
	field any
}

// compColumnsOf is the single source of truth for how CompPackage maps to the table;
// SELECT, INSERT, UPDATE and scanning are all built from it.
func compColumnsOf(p *CompPackage) []compColumn {
	return []compColumn{
		{"id", &p.ID},
		{"job_id", optionalString{&p.JobID}},
		{"kind", &p.Kind},
		{"label", &p.Label},
		{"parent_id", optionalString{&p.ParentID}},
		{"base_salary", &p.BaseSalary},
		{"signing_bonus", &p.SigningBonus},
		{"signing_clawback_months", &p.SigningClawbackMonths},
		{"target_bonus_pct", &p.TargetBonusPct},
		{"annual_raise_pct", &p.AnnualRaisePct},
		{"equity_type", &p.EquityType},
		{"rsu_grant_value", &p.RSUGrantValue},
		{"option_shares", &p.OptionShares},
		{"option_strike", &p.OptionStrike},
		{"share_value", &p.ShareValue},
		{"vesting", &p.Vesting},
		{"vesting_custom", &p.VestingCustom},
		{"k401_match_pct", &p.K401MatchPct},
		{"k401_match_cap_pct", &p.K401MatchCapPct},
		{"k401_contrib_pct", &p.K401ContribPct},
		{"health_premium_annual", &p.HealthPremiumAnnual},
		{"stipends_annual", &p.StipendsAnnual},
		{"other_annual", &p.OtherAnnual},
		{"pto_days", &p.PTODays},
		{"occupation_code", &p.OccupationCode},
		{"area_code", &p.AreaCode},
		{"tax_state", &p.TaxState},
		{"local_tax_pct", &p.LocalTaxPct},
		{"notes", &p.Notes},
		{"created_at", &p.CreatedAt},
		{"updated_at", &p.UpdatedAt},
	}
}

// Columns an UPDATE never changes.
var compImmutableColumns = map[string]bool{"id": true, "created_at": true}

var compColumns = strings.Join(columnNames(compColumnsOf(&CompPackage{})), ", ")

func columnNames(cols []compColumn) []string {
	names := make([]string, len(cols))
	for i, c := range cols {
		names[i] = c.name
	}
	return names
}

func columnValues(cols []compColumn) []any {
	values := make([]any, len(cols))
	for i, c := range cols {
		values[i] = columnValue(c.field)
	}
	return values
}

func columnValue(field any) any {
	switch f := field.(type) {
	case optionalString:
		return nullStr(*f.s)
	case *string:
		return *f
	case *int64:
		return *f
	case *int:
		return *f
	case *float64:
		return *f
	}
	panic(fmt.Sprintf("unsupported column field type %T", field))
}

func columnDests(cols []compColumn) []any {
	dests := make([]any, len(cols))
	for i, c := range cols {
		dests[i] = c.field
	}
	return dests
}

func insertCompSQL(cols []compColumn) string {
	placeholders := strings.TrimSuffix(strings.Repeat("?, ", len(cols)), ", ")
	return `INSERT INTO comp_packages (` + strings.Join(columnNames(cols), ", ") + `) VALUES (` + placeholders + `)`
}

// updateComp returns the UPDATE statement and its arguments for every mutable column.
func updateComp(p *CompPackage) (string, []any) {
	var sets []string
	var args []any
	for _, c := range compColumnsOf(p) {
		if compImmutableColumns[c.name] {
			continue
		}
		sets = append(sets, c.name+" = ?")
		args = append(args, columnValue(c.field))
	}
	return `UPDATE comp_packages SET ` + strings.Join(sets, ", ") + ` WHERE id = ?`, append(args, p.ID)
}

// optionalString stores "" as SQL NULL and reads NULL back as "".
type optionalString struct{ s *string }

func (o optionalString) Scan(src any) error {
	var ns sql.NullString
	if err := ns.Scan(src); err != nil {
		return err
	}
	*o.s = ns.String
	return nil
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func scanComp(s rowScanner) (CompPackage, error) {
	var p CompPackage
	err := s.Scan(columnDests(compColumnsOf(&p))...)
	return p, err
}

func (r *Repo) SaveCompPackage(p CompPackage) (CompPackage, error) {
	if p.EquityType == "" {
		p.EquityType = EquityNone
	}
	if p.Vesting == "" {
		p.Vesting = VestingStandard
	}
	p.Label = strings.TrimSpace(p.Label)
	if err := ValidateCompPackage(p); err != nil {
		return p, err
	}
	if p.JobID != "" {
		if _, err := r.GetJob(p.JobID); err != nil {
			return p, err
		}
	}
	if p.Kind == PackageCurrent {
		var existing string
		err := r.db.QueryRow(`SELECT id FROM comp_packages WHERE kind = ?`, PackageCurrent).Scan(&existing)
		switch {
		case errors.Is(err, sql.ErrNoRows):
		case err != nil:
			return p, err
		case existing != p.ID:
			return p, errors.New("you already have a current job baseline; edit that one instead")
		}
		p.JobID = ""
	}
	now := ts(r.now())
	p.UpdatedAt = now
	if p.ID == "" {
		p.ID, p.CreatedAt = newID(), now
		cols := compColumnsOf(&p)
		_, err := r.db.Exec(insertCompSQL(cols), columnValues(cols)...)
		return p, err
	}
	existing, err := r.GetCompPackage(p.ID)
	if err != nil {
		return p, err
	}
	p.CreatedAt = existing.CreatedAt
	query, args := updateComp(&p)
	res, err := r.db.Exec(query, args...)
	return p, expectOneRow(res, err, "package", p.ID)
}

func (r *Repo) GetCompPackage(id string) (CompPackage, error) {
	p, err := scanComp(r.db.QueryRow(`SELECT `+compColumns+` FROM comp_packages WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return p, fmt.Errorf("package %s: %w", id, ErrNotFound)
	}
	return p, err
}

func (r *Repo) listComp(where string, args ...any) ([]CompPackage, error) {
	return queryAll(r.db, scanComp, `SELECT `+compColumns+` FROM comp_packages `+where+` ORDER BY kind = ? DESC, created_at, rowid`, append(args, PackageCurrent)...)
}

func (r *Repo) ListCompPackages() ([]CompPackage, error) { return r.listComp("") }

func (r *Repo) ListCompPackagesForJob(jobID string) ([]CompPackage, error) {
	return r.listComp("WHERE job_id = ?", jobID)
}

func (r *Repo) CurrentCompPackage() (*CompPackage, error) {
	list, err := r.listComp("WHERE kind = ?", PackageCurrent)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

func (r *Repo) DeleteCompPackage(id string) error {
	res, err := r.db.Exec(`DELETE FROM comp_packages WHERE id = ?`, id)
	return expectOneRow(res, err, "package", id)
}

// withOfferTotals sets each summary's year-1 value from the job's latest offer
// (packages are in creation order). Offers that can't be evaluated are skipped.
func withOfferTotals(summaries []JobSummary, packages []CompPackage, evaluate func(CompPackage) (PackageResult, error)) {
	latestOffer := map[string]CompPackage{}
	for _, p := range packages {
		if p.Kind == PackageOffer {
			latestOffer[p.JobID] = p
		}
	}
	for i := range summaries {
		offer, ok := latestOffer[summaries[i].Job.ID]
		if !ok {
			continue
		}
		if res, err := evaluate(offer); err == nil {
			total := res.Year1Total
			summaries[i].OfferYear1Total = &total
		}
	}
}

// DraftCounter copies an offer (or estimate) as a "what if they meet my counter" package.
func (r *Repo) DraftCounter(offerID string) (CompPackage, error) {
	src, err := r.GetCompPackage(offerID)
	if err != nil {
		return CompPackage{}, err
	}
	if src.Kind != PackageOffer && src.Kind != PackageEstimate {
		return CompPackage{}, errors.New("only offers and estimates can be countered")
	}
	c := src
	c.ID, c.Kind, c.ParentID = "", PackageCounter, src.ID
	label := src.Label
	if label == "" {
		label = "Offer"
	}
	c.Label = "Counter: " + label
	return r.SaveCompPackage(c)
}

// NewEstimateForJob prefills (but doesn't save) an expected-offer package from a job's posted range.
func NewEstimateForJob(j Job, occ, area, state string) CompPackage {
	p := CompPackage{
		JobID: j.ID, Kind: PackageEstimate, Label: "Estimate", EquityType: EquityNone, Vesting: VestingStandard,
		OccupationCode: occ, AreaCode: area, TaxState: state,
	}
	switch {
	case j.SalaryMin != nil && j.SalaryMax != nil:
		p.BaseSalary = (*j.SalaryMin + *j.SalaryMax) / 2
	case j.SalaryMin != nil:
		p.BaseSalary = *j.SalaryMin
	case j.SalaryMax != nil:
		p.BaseSalary = *j.SalaryMax
	}
	return p
}
