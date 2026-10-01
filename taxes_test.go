package main

import "testing"

// Expected values below were worked by hand from the 2026 tables in taxdata/us_2026.json.

func mustTax(t *testing.T, in TaxInput) TaxResult {
	t.Helper()
	res, err := ComputeTax(in)
	if err != nil {
		t.Fatalf("ComputeTax(%+v): %v", in, err)
	}
	return res
}

func TestComputeTaxFederalSingle(t *testing.T) {
	// Taxable 83,900: 1,240 + 4,560 + 7,370.
	r := mustTax(t, TaxInput{Wages: 100000, Filing: "single", State: "TX"})
	if r.Federal != 13170 || r.SocialSecurity != 6200 || r.Medicare != 1450 || r.State != 0 || r.Total != 20820 {
		t.Fatalf("got %+v", r)
	}
	if r.EffectiveRate < 0.2081 || r.EffectiveRate > 0.2083 {
		t.Fatalf("effective rate = %v", r.EffectiveRate)
	}
}

func TestComputeTaxMarriedCA(t *testing.T) {
	r := mustTax(t, TaxInput{Wages: 250000, Filing: "married", State: "CA"})
	// Federal taxable 217,800 → 2,480 + 9,120 + 24,332 + 1,536.
	if r.Federal != 37468 {
		t.Errorf("federal = %d", r.Federal)
	}
	// SS capped at the 2026 wage base; Medicare threshold for married is 250k → no extra.
	if r.SocialSecurity != 11439 || r.Medicare != 3625 {
		t.Errorf("fica = %d %d", r.SocialSecurity, r.Medicare)
	}
	// CA taxable 238,920 through the 9.3% bracket = 15,096.84, minus the $306 exemption credit.
	if r.State != 14791 {
		t.Errorf("state = %d", r.State)
	}
}

func TestComputeTaxNoIncomeTaxState(t *testing.T) {
	for _, st := range []string{"TX", "FL", "WA", "NV"} {
		if r := mustTax(t, TaxInput{Wages: 150000, Filing: "single", State: st}); r.State != 0 {
			t.Errorf("%s state tax = %d", st, r.State)
		}
	}
}

func TestComputeTaxFlatState(t *testing.T) {
	// Colorado: 4.4% of (80,000 - 16,100).
	if r := mustTax(t, TaxInput{Wages: 80000, Filing: "single", State: "CO"}); r.State != 2812 {
		t.Fatalf("CO = %d", r.State)
	}
	// Ohio taxes nothing below its first threshold.
	if r := mustTax(t, TaxInput{Wages: 20000, Filing: "single", State: "OH"}); r.State != 0 {
		t.Fatalf("OH = %d", r.State)
	}
}

func TestComputeTaxFICA(t *testing.T) {
	r := mustTax(t, TaxInput{Wages: 300000, Filing: "single", State: "TX"})
	// SS stops at 184,500; Medicare 1.45% + 0.9% over 200k.
	if r.SocialSecurity != 11439 || r.Medicare != 5250 {
		t.Fatalf("got %+v", r)
	}
}

func Test401kReducesIncomeTaxNotFICA(t *testing.T) {
	r := mustTax(t, TaxInput{Wages: 100000, PreTax401k: 10000, Filing: "single", State: "TX"})
	if r.Federal != 10970 || r.SocialSecurity != 6200 || r.Medicare != 1450 {
		t.Fatalf("got %+v", r)
	}
}

func TestLocalTaxAndHeadOfHousehold(t *testing.T) {
	r := mustTax(t, TaxInput{Wages: 100000, Filing: "head", State: "TX", LocalPct: 3})
	// HoH taxable 75,850: 1,770 + 5,970 + 22% of 8,400.
	if r.Federal != 9588 || r.Local != 3000 {
		t.Fatalf("got %+v", r)
	}
}

func TestComputeTaxErrors(t *testing.T) {
	if _, err := ComputeTax(TaxInput{Wages: 1, Filing: "single", State: "ZZ"}); err == nil {
		t.Error("unknown state should error")
	}
	if _, err := ComputeTax(TaxInput{Wages: 1, Filing: "widowed", State: "TX"}); err == nil {
		t.Error("unknown filing status should error")
	}
	if r := mustTax(t, TaxInput{Wages: 0, Filing: "single", State: "CA"}); r.Total != 0 || r.EffectiveRate != 0 {
		t.Errorf("zero wages = %+v", r)
	}
}

func TestAllStatesPresentAndWellFormed(t *testing.T) {
	td := mustTaxData(t)
	if len(td.States) != 51 {
		t.Fatalf("want 50 states + DC, got %d", len(td.States))
	}
	for code, s := range td.States {
		if s.Source == "" || s.Year == 0 {
			t.Errorf("%s: missing source/year", code)
		}
		if s.Type == "none" {
			continue
		}
		for _, status := range []string{"single", "married"} {
			b := s.Brackets[status]
			if len(b) == 0 {
				t.Errorf("%s %s: no brackets", code, status)
			}
			for i, br := range b {
				if br.Rate < 0 || br.Rate > 0.15 || (br.Rate == 0 && i > 0) || (i > 0 && br.From <= b[i-1].From) {
					t.Errorf("%s %s: bad bracket %d %+v", code, status, i, br)
				}
			}
		}
	}
}

func mustTaxData(t *testing.T) *TaxData {
	t.Helper()
	td, err := loadTaxData()
	if err != nil {
		t.Fatal(err)
	}
	return td
}
