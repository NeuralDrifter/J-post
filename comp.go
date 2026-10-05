package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// CompPackage is one compensation scenario: a real offer, an expected offer
// (estimate), a counter-offer draft, or the user's current job (baseline).
type CompPackage struct {
	ID                    string  `json:"id"`
	JobID                 string  `json:"jobId"`
	Kind                  string  `json:"kind"` // offer, estimate, counter, current
	Label                 string  `json:"label"`
	ParentID              string  `json:"parentId"`
	BaseSalary            int64   `json:"baseSalary"`
	SigningBonus          int64   `json:"signingBonus"`
	SigningClawbackMonths int     `json:"signingClawbackMonths"`
	TargetBonusPct        float64 `json:"targetBonusPct"`
	AnnualRaisePct        float64 `json:"annualRaisePct"`
	EquityType            string  `json:"equityType"` // none, rsu, options
	RSUGrantValue         int64   `json:"rsuGrantValue"`
	OptionShares          int64   `json:"optionShares"`
	OptionStrike          float64 `json:"optionStrike"`
	ShareValue            float64 `json:"shareValue"`
	Vesting               string  `json:"vesting"` // standard, backloaded, monthly, custom
	VestingCustom         string  `json:"vestingCustom"`
	K401MatchPct          float64 `json:"k401MatchPct"`
	K401MatchCapPct       float64 `json:"k401MatchCapPct"`
	K401ContribPct        float64 `json:"k401ContribPct"`
	HealthPremiumAnnual   int64   `json:"healthPremiumAnnual"`
	StipendsAnnual        int64   `json:"stipendsAnnual"`
	OtherAnnual           int64   `json:"otherAnnual"`
	PTODays               int     `json:"ptoDays"`
	OccupationCode        string  `json:"occupationCode"`
	AreaCode              string  `json:"areaCode"`
	TaxState              string  `json:"taxState"`
	LocalTaxPct           float64 `json:"localTaxPct"`
	Notes                 string  `json:"notes"`
	CreatedAt             string  `json:"createdAt"`
	UpdatedAt             string  `json:"updatedAt"`
}

// compColumn pairs a comp_packages column with the CompPackage field it holds.
// field is a pointer (*string, *int64, *int, *float64) or an optionalString.
type compColumn struct {
	name  string
	field any
}

// columns is the single source of truth for how CompPackage maps to the table;
// SELECT, INSERT, UPDATE and scanning are all built from it.
func (p *CompPackage) columns() []compColumn {
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

var compColumns = strings.Join(columnNames((&CompPackage{}).columns()), ", ")

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
	for _, c := range p.columns() {
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
	err := s.Scan(columnDests(p.columns())...)
	return p, err
}

var (
	validKinds      = map[string]bool{"offer": true, "estimate": true, "counter": true, "current": true}
	validEquity     = map[string]bool{"none": true, "rsu": true, "options": true}
	validVesting    = map[string]bool{"standard": true, "backloaded": true, "monthly": true, "custom": true}
	vestingSchedule = map[string][compYears]float64{
		"standard":   {25, 25, 25, 25},
		"monthly":    {25, 25, 25, 25},
		"backloaded": {5, 15, 40, 40},
	}
)

// vestingPercents returns the % of the grant vesting in each of years 1-4.
func vestingPercents(p CompPackage) ([compYears]float64, error) {
	if p.Vesting != "custom" {
		s, ok := vestingSchedule[p.Vesting]
		if !ok {
			return s, fmt.Errorf("unknown vesting schedule %q", p.Vesting)
		}
		return s, nil
	}
	var out [compYears]float64
	parts := strings.Split(p.VestingCustom, ",")
	if len(parts) != compYears {
		return out, errors.New("custom vesting needs four yearly percentages, e.g. 10,20,30,40")
	}
	sum := 0.0
	for i, part := range parts {
		v, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil || v < 0 {
			return out, fmt.Errorf("invalid vesting percentage %q", part)
		}
		out[i] = v
		sum += v
	}
	if sum < 99.99 || sum > 100.01 {
		return out, fmt.Errorf("custom vesting adds up to %.0f%%, not 100%%", sum)
	}
	return out, nil
}

// ValidateCompPackage checks the rules that don't need the database.
func ValidateCompPackage(p CompPackage) error {
	if !validKinds[p.Kind] {
		return fmt.Errorf("invalid package kind %q", p.Kind)
	}
	if p.Kind != "current" && p.JobID == "" {
		return errors.New("this package must belong to a job")
	}
	if p.Kind == "counter" && p.ParentID == "" {
		return errors.New("a counter must be based on an offer")
	}
	if !validEquity[p.EquityType] {
		return fmt.Errorf("invalid equity type %q", p.EquityType)
	}
	if !validVesting[p.Vesting] {
		return fmt.Errorf("invalid vesting schedule %q", p.Vesting)
	}
	if _, err := vestingPercents(p); err != nil {
		return err
	}
	for name, v := range map[string]int64{
		"base salary": p.BaseSalary, "signing bonus": p.SigningBonus, "RSU grant": p.RSUGrantValue,
		"option shares": p.OptionShares, "health premium": p.HealthPremiumAnnual, "stipends": p.StipendsAnnual,
		"other benefits": p.OtherAnnual, "PTO days": int64(p.PTODays), "clawback months": int64(p.SigningClawbackMonths),
	} {
		if v < 0 {
			return fmt.Errorf("%s can't be negative", name)
		}
	}
	if p.OptionStrike < 0 || p.ShareValue < 0 {
		return errors.New("share prices can't be negative")
	}
	for name, v := range map[string]float64{
		"bonus %": p.TargetBonusPct, "raise %": p.AnnualRaisePct, "401k match %": p.K401MatchPct,
		"401k match cap %": p.K401MatchCapPct, "401k contribution %": p.K401ContribPct, "local tax %": p.LocalTaxPct,
	} {
		if v < 0 || v > 100 {
			return fmt.Errorf("%s must be between 0 and 100", name)
		}
	}
	return nil
}

func (r *Repo) SaveCompPackage(p CompPackage) (CompPackage, error) {
	if p.EquityType == "" {
		p.EquityType = "none"
	}
	if p.Vesting == "" {
		p.Vesting = "standard"
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
	if p.Kind == "current" {
		var existing string
		err := r.db.QueryRow(`SELECT id FROM comp_packages WHERE kind = 'current'`).Scan(&existing)
		if err == nil && existing != p.ID {
			return p, errors.New("you already have a current job baseline; edit that one instead")
		}
		p.JobID = ""
	}
	now := ts(r.now())
	p.UpdatedAt = now
	if p.ID == "" {
		p.ID, p.CreatedAt = newID(), now
		cols := p.columns()
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
	rows, err := r.db.Query(`SELECT `+compColumns+` FROM comp_packages `+where+` ORDER BY kind = 'current' DESC, created_at, rowid`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CompPackage{}
	for rows.Next() {
		p, err := scanComp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repo) ListCompPackages() ([]CompPackage, error) { return r.listComp("") }

func (r *Repo) ListCompPackagesForJob(jobID string) ([]CompPackage, error) {
	return r.listComp("WHERE job_id = ?", jobID)
}

func (r *Repo) CurrentCompPackage() (*CompPackage, error) {
	list, err := r.listComp("WHERE kind = 'current'")
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

func (r *Repo) DeleteCompPackage(id string) error {
	res, err := r.db.Exec(`DELETE FROM comp_packages WHERE id = ?`, id)
	return expectOneRow(res, err, "package", id)
}

// DraftCounter copies an offer (or estimate) as a "what if they meet my counter" package.
func (r *Repo) DraftCounter(offerID string) (CompPackage, error) {
	src, err := r.GetCompPackage(offerID)
	if err != nil {
		return CompPackage{}, err
	}
	if src.Kind != "offer" && src.Kind != "estimate" {
		return CompPackage{}, errors.New("only offers and estimates can be countered")
	}
	c := src
	c.ID, c.Kind, c.ParentID = "", "counter", src.ID
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
		JobID: j.ID, Kind: "estimate", Label: "Estimate", EquityType: "none", Vesting: "standard",
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
