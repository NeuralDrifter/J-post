// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package comp

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Package kinds.
const (
	PackageOffer    = "offer"
	PackageEstimate = "estimate" // an expected offer
	PackageCounter  = "counter"  // "what if they meet my counter"
	PackageCurrent  = "current"  // the user's current job (baseline); at most one
)

// Equity types.
const (
	EquityNone    = "none"
	EquityRSU     = "rsu"
	EquityOptions = "options"
)

// Vesting schedules.
const (
	VestingStandard   = "standard"
	VestingBackloaded = "backloaded"
	VestingMonthly    = "monthly"
	VestingCustom     = "custom"
)

// CompPackage is one compensation scenario: a real offer, an expected offer
// (estimate), a counter-offer draft, or the user's current job (baseline).
type CompPackage struct {
	ID                    string  `json:"id"`
	JobID                 string  `json:"jobId"`
	Kind                  string  `json:"kind"` // a Package* constant
	Label                 string  `json:"label"`
	ParentID              string  `json:"parentId"`
	BaseSalary            int64   `json:"baseSalary"`
	SigningBonus          int64   `json:"signingBonus"`
	SigningClawbackMonths int     `json:"signingClawbackMonths"`
	TargetBonusPct        float64 `json:"targetBonusPct"`
	AnnualRaisePct        float64 `json:"annualRaisePct"`
	EquityType            string  `json:"equityType"` // an Equity* constant
	RSUGrantValue         int64   `json:"rsuGrantValue"`
	OptionShares          int64   `json:"optionShares"`
	OptionStrike          float64 `json:"optionStrike"`
	ShareValue            float64 `json:"shareValue"`
	Vesting               string  `json:"vesting"` // a Vesting* constant
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

var (
	validKinds      = map[string]bool{PackageOffer: true, PackageEstimate: true, PackageCounter: true, PackageCurrent: true}
	validEquity     = map[string]bool{EquityNone: true, EquityRSU: true, EquityOptions: true}
	validVesting    = map[string]bool{VestingStandard: true, VestingBackloaded: true, VestingMonthly: true, VestingCustom: true}
	vestingSchedule = map[string][compYears]float64{
		VestingStandard:   {25, 25, 25, 25},
		VestingMonthly:    {25, 25, 25, 25},
		VestingBackloaded: {5, 15, 40, 40},
	}
)

// vestingPercents returns the % of the grant vesting in each of years 1-4.
func vestingPercents(p CompPackage) ([compYears]float64, error) {
	if p.Vesting != VestingCustom {
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
	if p.Kind != PackageCurrent && p.JobID == "" {
		return errors.New("this package must belong to a job")
	}
	if p.Kind == PackageCounter && p.ParentID == "" {
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
