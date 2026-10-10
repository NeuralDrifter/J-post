// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

import (
	"math"
	"slices"
	"strconv"
	"strings"

	"jobtrack/internal/textproc"
)

// Normalization: every source's RawJob becomes a DiscoverResult with an annual
// salary and a dedupe key, and the same posting from several sources is merged.

var intervalFactor = map[string]float64{"yearly": 1, "monthly": 12, "biweekly": 26, "weekly": 52, "daily": 260, "hourly": 2080}
var intervalUnit = map[string]string{"yearly": "yr", "monthly": "mo", "biweekly": "2 wk", "weekly": "wk", "daily": "day", "hourly": "hr"}

// moneyText formats 120000 as "$120,000" and 22.5 as "$22.50".
func moneyText(v float64) string {
	if v != math.Trunc(v) {
		return "$" + strconv.FormatFloat(v, 'f', 2, 64)
	}
	digits := strconv.FormatInt(int64(v), 10)
	var b strings.Builder
	for i, d := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(d)
	}
	return "$" + b.String()
}

// annualSalary is a posted pay range in whole dollars a year.
type annualSalary struct {
	min, max   *int64 // nil = not posted
	annualized bool   // converted from an hourly, monthly, ... rate
	text       string // the range as posted, e.g. "$22.50–$30/hr"
}

// normalizeSalary converts a posted range to annual integers. Missing or
// non-positive amounts count as absent; unknown intervals are treated as yearly.
func normalizeSalary(minAmount, maxAmount *float64, interval string) annualSalary {
	if minAmount != nil && *minAmount <= 0 {
		minAmount = nil
	}
	if maxAmount != nil && *maxAmount <= 0 {
		maxAmount = nil
	}
	if minAmount == nil && maxAmount == nil {
		return annualSalary{}
	}
	interval = strings.ToLower(strings.TrimSpace(interval))
	factor, ok := intervalFactor[interval]
	if !ok {
		interval, factor = "yearly", 1
	}
	annualize := func(v *float64) *int64 {
		if v == nil {
			return nil
		}
		x := int64(math.Round(*v * factor))
		return &x
	}
	unit := "/" + intervalUnit[interval]
	var text string
	switch {
	case minAmount != nil && maxAmount != nil:
		text = moneyText(*minAmount) + "–" + moneyText(*maxAmount) + unit
	case minAmount != nil:
		text = "From " + moneyText(*minAmount) + unit
	default:
		text = "Up to " + moneyText(*maxAmount) + unit
	}
	return annualSalary{min: annualize(minAmount), max: annualize(maxAmount), annualized: interval != "yearly", text: text}
}

func DedupeKey(company, title string) string {
	return textproc.NormalizeForMatch(company) + "|" + textproc.NormalizeForMatch(title)
}

func FromRaw(r RawJob, source string) DiscoverResult {
	res := DiscoverResult{
		Title:       strings.TrimSpace(r.Title),
		Company:     strings.TrimSpace(r.Company),
		Location:    strings.TrimSpace(r.Location),
		Description: strings.TrimSpace(r.Description),
		DatePosted:  strings.TrimSpace(r.DatePosted),
		URL:         strings.TrimSpace(r.URL),
		Sources:     []string{source},
	}
	if r.IsRemote {
		res.WorkMode = "remote"
	}
	pay := normalizeSalary(r.MinAmount, r.MaxAmount, r.Interval)
	res.SalaryMin, res.SalaryMax, res.Annualized, res.SalaryText = pay.min, pay.max, pay.annualized, pay.text
	res.Key = DedupeKey(res.Company, res.Title)
	return res
}

func MergeInto(a, b DiscoverResult) DiscoverResult {
	for _, s := range b.Sources {
		if !slices.Contains(a.Sources, s) {
			a.Sources = append(a.Sources, s)
		}
	}
	fill := func(dst *string, src string) {
		if *dst == "" {
			*dst = src
		}
	}
	fill(&a.Location, b.Location)
	fill(&a.URL, b.URL)
	fill(&a.DatePosted, b.DatePosted)
	fill(&a.WorkMode, b.WorkMode)
	if len(b.Description) > len(a.Description) {
		a.Description = b.Description
	}
	if a.SalaryMin == nil && a.SalaryMax == nil {
		a.SalaryMin, a.SalaryMax, a.Annualized, a.SalaryText = b.SalaryMin, b.SalaryMax, b.Annualized, b.SalaryText
	}
	return a
}

// MergeResults de-duplicates by company+title, keeping first-seen order.
func MergeResults(lists ...[]DiscoverResult) []DiscoverResult {
	index := map[string]int{}
	out := []DiscoverResult{}
	for _, list := range lists {
		for _, r := range list {
			if i, ok := index[r.Key]; ok {
				out[i] = MergeInto(out[i], r)
				continue
			}
			index[r.Key] = len(out)
			out = append(out, r)
		}
	}
	return out
}
