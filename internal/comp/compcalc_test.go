// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package comp

import (
	"testing"

	"jobtrack/internal/marketdata"
	"jobtrack/internal/settings"
	"jobtrack/internal/taxes"
)

func mustEval(t *testing.T, p CompPackage, current *CompPackage) PackageResult {
	t.Helper()
	res, err := Evaluate(p, settings.Settings{FilingStatus: "single", HomeAreaCode: "US"}, testMarket(), current)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	return res
}

func equityByYear(r PackageResult) [4]int64 {
	var out [4]int64
	for i, y := range r.Years {
		out[i] = y.Equity
	}
	return out
}

func TestEvaluateStandardVesting(t *testing.T) {
	r := mustEval(t, basePackage("j"), nil)
	y := r.Years[0]
	// 150k base, 10% bonus, 200k RSU / 4, 50% match on 6% = 4.5k.
	if y.Base != 150000 || y.Bonus != 15000 || y.Equity != 50000 || y.Benefits != 4500 || y.Total != 219500 {
		t.Fatalf("year 1 = %+v", y)
	}
	if r.Year1Total != 219500 || r.FourYearTotal != 878000 || r.AvgPerYear != 219500 {
		t.Fatalf("totals = %d %d %d", r.Year1Total, r.FourYearTotal, r.AvgPerYear)
	}
	tax, _ := taxes.ComputeTax(taxes.TaxInput{Wages: 215000, PreTax401k: 9000, Filing: "single", State: "CO"})
	if y.Taxable != 215000 || r.Tax1.Total != tax.Total || y.TakeHome != 215000-9000-tax.Total || r.Year1TakeHome != y.TakeHome {
		t.Fatalf("take-home = %+v tax %+v", y, r.Tax1)
	}
}

func TestEvaluateBackloaded(t *testing.T) {
	p := basePackage("j")
	p.Vesting = "backloaded"
	if got := equityByYear(mustEval(t, p, nil)); got != [4]int64{10000, 30000, 80000, 80000} {
		t.Fatalf("equity = %v", got)
	}
}

func TestEvaluateCustomVesting(t *testing.T) {
	p := basePackage("j")
	p.Vesting, p.VestingCustom = "custom", "10,20,30,40"
	if got := equityByYear(mustEval(t, p, nil)); got != [4]int64{20000, 40000, 60000, 80000} {
		t.Fatalf("equity = %v", got)
	}
}

func TestEvaluateRaises(t *testing.T) {
	p := basePackage("j")
	p.AnnualRaisePct = 3
	r := mustEval(t, p, nil)
	if r.Years[1].Base != 154500 || r.Years[1].Bonus != 15450 || r.Years[3].Base != 163909 {
		t.Fatalf("years = %+v", r.Years)
	}
}

func TestEvaluateOptionsUnderwater(t *testing.T) {
	p := basePackage("j")
	p.EquityType, p.RSUGrantValue, p.OptionShares, p.OptionStrike, p.ShareValue = "options", 0, 10000, 10, 5
	r := mustEval(t, p, nil)
	if r.FourYearTotal != r.Years[0].Total*4 || equityByYear(r) != [4]int64{} {
		t.Fatalf("underwater options should be worth 0: %v", equityByYear(r))
	}
	want := map[float64]int64{0: 0, 1: 0, 3: 50000, 10: 400000}
	for _, s := range r.Scenarios {
		if s.Value != want[s.Multiplier] {
			t.Errorf("scenario %vx = %d, want %d", s.Multiplier, s.Value, want[s.Multiplier])
		}
	}
	// Options are not taxed until exercised.
	if r.Years[0].Taxable != 165000 {
		t.Fatalf("taxable = %d", r.Years[0].Taxable)
	}
}

func TestEvaluateBenefitsEdgeCases(t *testing.T) {
	p := basePackage("j")
	p.K401ContribPct, p.K401MatchCapPct, p.K401MatchPct = 10, 6, 100
	p.HealthPremiumAnnual, p.StipendsAnnual = 3000, 1200
	r := mustEval(t, p, nil)
	if r.Years[0].Benefits != 9000+1200-3000 {
		t.Fatalf("benefits = %d", r.Years[0].Benefits)
	}
	// 10% of 150k is over the 2026 limit? No (15k < 24.5k); 20% of 150k would be capped.
	p.K401ContribPct = 20
	r = mustEval(t, p, nil)
	tax, _ := taxes.ComputeTax(taxes.TaxInput{Wages: 215000, PreTax401k: 24500, Filing: "single", State: "CO"})
	if r.Tax1.Total != tax.Total {
		t.Fatalf("401k contribution should be capped at the IRS limit: %+v vs %+v", r.Tax1, tax)
	}
	zero := CompPackage{JobID: "j", Kind: "offer", EquityType: "none", Vesting: "standard", K401MatchPct: 50, K401MatchCapPct: 6, K401ContribPct: 6}
	if z := mustEval(t, zero, nil); z.Year1Total != 0 || z.Year1TakeHome != 0 || z.PTOValue != 0 {
		t.Fatalf("zero package = %+v", z)
	}
}

func TestEvaluateDeltaVsCurrent(t *testing.T) {
	cur := CompPackage{ID: "cur", Kind: "current", BaseSalary: 120000, EquityType: "none", Vesting: "standard", TaxState: "CO"}
	r := mustEval(t, basePackage("j"), &cur)
	if r.DeltaVsCurrent == nil || r.DeltaVsCurrent.Year1Total != 219500-120000 || r.DeltaVsCurrent.AvgPerYear != 219500-120000 {
		t.Fatalf("delta = %+v", r.DeltaVsCurrent)
	}
	if self := mustEval(t, cur, &cur); self.DeltaVsCurrent != nil {
		t.Fatal("the current package should not be compared with itself")
	}
}

func TestEvaluateCOLAndMarket(t *testing.T) {
	r := mustEval(t, basePackage("j"), nil)
	if r.COLIndex != 108.5 || r.HomeCOLIndex != 100 || r.COLLevel != "metro" || r.Year1COLAdjusted != 202304 {
		t.Fatalf("col = %v %v %v %d", r.COLIndex, r.HomeCOLIndex, r.COLLevel, r.Year1COLAdjusted)
	}
	if r.Market == nil || r.Market.Percentile != 50 || r.Market.Level != "area" {
		t.Fatalf("market = %+v", r.Market)
	}
	p := basePackage("j")
	p.OccupationCode = ""
	if mustEval(t, p, nil).Market != nil {
		t.Fatal("no occupation → no market position")
	}
}

func TestScenarios(t *testing.T) {
	r := mustEval(t, basePackage("j"), nil)
	want := map[float64]int64{0: 0, 1: 200000, 3: 600000, 10: 2000000}
	if len(r.Scenarios) != 4 {
		t.Fatalf("scenarios = %+v", r.Scenarios)
	}
	for _, s := range r.Scenarios {
		if s.Value != want[s.Multiplier] {
			t.Errorf("%vx = %d", s.Multiplier, s.Value)
		}
	}
	none := basePackage("j")
	none.EquityType = "none"
	if len(mustEval(t, none, nil).Scenarios) != 0 {
		t.Fatal("no equity → no scenarios")
	}
}

func TestEvaluateWarningsAndNoState(t *testing.T) {
	p := basePackage("j")
	p.SigningBonus, p.SigningClawbackMonths, p.TaxState = 20000, 12, ""
	r := mustEval(t, p, nil)
	if r.Tax1.State != 0 || len(r.Warnings) < 2 {
		t.Fatalf("warnings = %v tax = %+v", r.Warnings, r.Tax1)
	}
}

func TestMarketBaselinePresent(t *testing.T) {
	p := basePackage("j")
	p.BaseSalary = 160000
	s := settings.Settings{FilingStatus: "single", HomeAreaCode: "19740", DefaultOccupation: "15-1252"}
	r, err := Evaluate(p, s, testMarket(), nil)
	if err != nil {
		t.Fatal(err)
	}
	b := r.MarketBaseline
	// Denver Software Developers median is 150k in the test data.
	if b == nil || b.Median != 150000 || b.BaseDelta != 10000 || b.Level != "area" || b.OccTitle != "Software Developers" {
		t.Fatalf("baseline = %+v", b)
	}
	// Falls back to national figures when the home area has none for this occupation.
	s.DefaultOccupation = "99-9999"
	r, _ = Evaluate(p, s, testMarket(), nil)
	if r.MarketBaseline == nil || r.MarketBaseline.Level != "national" || r.MarketBaseline.Median != 70000 {
		t.Fatalf("fallback baseline = %+v", r.MarketBaseline)
	}
}

func TestMarketBaselineAbsent(t *testing.T) {
	p := basePackage("j")
	cur := CompPackage{ID: "cur", Kind: "current", BaseSalary: 120000, EquityType: "none", Vesting: "standard"}
	withOcc := settings.Settings{FilingStatus: "single", HomeAreaCode: "19740", DefaultOccupation: "15-1252"}
	if r, _ := Evaluate(p, withOcc, testMarket(), &cur); r.MarketBaseline != nil {
		t.Error("a current job is the baseline when it exists")
	}
	if r, _ := Evaluate(p, settings.Settings{FilingStatus: "single"}, testMarket(), nil); r.MarketBaseline != nil {
		t.Error("no default occupation → no market baseline")
	}
	// The Denver p90 is top-coded in the test data, but the median is not; a fully top-coded median gives no baseline.
	md := testMarket()
	top := int64(-1)
	md.Wages["19740"]["15-1252"][2] = &top
	if r, _ := Evaluate(p, withOcc, md, nil); r.MarketBaseline != nil {
		t.Errorf("top-coded median should give no baseline: %+v", r.MarketBaseline)
	}
}

// testMarket builds a tiny in-memory dataset so percentile math is checked exactly.
func testMarket() *marketdata.MarketData {
	p := func(v ...int64) []*int64 {
		out := make([]*int64, len(v))
		for i := range v {
			if v[i] != 0 {
				x := v[i]
				out[i] = &x
			}
		}
		return out
	}
	return &marketdata.MarketData{
		Occupations: map[string]string{"15-1252": "Software Developers", "99-9999": "Rare Job"},
		Areas: map[string]marketdata.MarketArea{
			"US":    {Title: "U.S.", Type: "national", State: "US", RPP: 100},
			"08":    {Title: "Colorado", Type: "state", State: "CO", RPP: 103},
			"19740": {Title: "Denver-Aurora-Centennial, CO", Type: "metro", State: "CO", RPP: 108.5, RPPLevel: "metro"},
			"99999": {Title: "Tiny, CO", Type: "metro", State: "CO", RPP: 95},
		},
		Wages: map[string]map[string][]*int64{
			"US":    {"15-1252": p(80000, 100000, 140000, 180000, 220000), "99-9999": p(50000, 60000, 70000, 80000, 90000)},
			"08":    {"15-1252": p(85000, 105000, 145000, 185000, 225000)},
			"19740": {"15-1252": p(90000, 110000, 150000, 200000, -1)},
		},
	}
}

func basePackage(jobID string) CompPackage {
	return CompPackage{
		JobID: jobID, Kind: "offer", Label: "Offer", BaseSalary: 150000, TargetBonusPct: 10,
		EquityType: "rsu", RSUGrantValue: 200000, Vesting: "standard", TaxState: "CO", AreaCode: "19740",
		OccupationCode: "15-1252", K401MatchPct: 50, K401MatchCapPct: 6, K401ContribPct: 6,
	}
}
