package main

import (
	"math"
	"testing"
)

func mustMarket(t *testing.T) *MarketData {
	t.Helper()
	md, err := loadMarketData()
	if err != nil {
		t.Fatalf("loadMarketData: %v", err)
	}
	return md
}

// testMarket builds a tiny in-memory dataset so percentile math is checked exactly.
func testMarket() *MarketData {
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
	return &MarketData{
		Occupations: map[string]string{"15-1252": "Software Developers", "99-9999": "Rare Job"},
		Areas: map[string]MarketArea{
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

func TestMarketPositionInterpolates(t *testing.T) {
	md := testMarket()
	cases := []struct {
		base int64
		want float64
		qual string
	}{
		{150000, 50, ""},
		{130000, 37.5, ""}, // halfway between p25 (110k) and p50 (150k)
		{175000, 62.5, ""},
		{80000, 10, "below"},
		{210000, 75, "above"}, // p90 is top-coded, so the best we can say is "≥ 75th"
	}
	for _, c := range cases {
		got := md.MarketPosition("15-1252", "19740", c.base)
		if !got.Found || math.Abs(got.Percentile-c.want) > 1e-9 || got.Qualifier != c.qual || got.Level != "area" {
			t.Errorf("base %d: got %+v, want %v %q", c.base, got, c.want, c.qual)
		}
	}
}

func TestMarketPositionTopCoded(t *testing.T) {
	got := testMarket().MarketPosition("15-1252", "19740", 300000)
	if got.Points[4] != -1 || got.Qualifier != "above" || got.Percentile != 75 {
		t.Fatalf("got %+v", got)
	}
}

func TestMarketPositionFallbacks(t *testing.T) {
	md := testMarket()
	if got := md.MarketPosition("15-1252", "99999", 145000); got.Level != "state" || got.Percentile != 50 || got.AreaTitle != "Colorado" {
		t.Errorf("metro without data should use state: %+v", got)
	}
	if got := md.MarketPosition("99-9999", "19740", 70000); got.Level != "national" || got.Percentile != 50 {
		t.Errorf("missing state data should use national: %+v", got)
	}
	if got := md.MarketPosition("00-0000", "19740", 70000); got.Found {
		t.Errorf("unknown occupation should not be found: %+v", got)
	}
	if got := md.MarketPosition("15-1252", "nope", 140000); got.Level != "national" || !got.Found {
		t.Errorf("unknown area should use national: %+v", got)
	}
}

func TestCostOfLivingFallbackChain(t *testing.T) {
	md := testMarket()
	if idx, level := md.CostOfLiving("19740"); idx != 108.5 || level != "metro" {
		t.Errorf("got %v %v", idx, level)
	}
	if idx, level := md.CostOfLiving("nowhere"); idx != 100 || level != "national" {
		t.Errorf("got %v %v", idx, level)
	}
}

func TestGuessArea(t *testing.T) {
	md := mustMarket(t)
	cases := map[string]string{
		"Denver, CO":           "19740",
		"Aurora, CO":           "19740",
		"Remote":               "US",
		"Remote (US)":          "US",
		"Smallville, CO":       "08",
		"somewhere unknowable": "",
		"":                     "",
	}
	for in, want := range cases {
		if got := md.GuessArea(in); got != want {
			t.Errorf("GuessArea(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSearch(t *testing.T) {
	md := mustMarket(t)
	occ := md.SearchOccupations("software dev")
	if len(occ) == 0 || occ[0].Code != "15-1252" {
		t.Fatalf("occupations = %+v", occ)
	}
	areas := md.SearchAreas("denver")
	if len(areas) == 0 || areas[0].Code != "19740" {
		t.Fatalf("areas = %+v", areas)
	}
	if len(md.SearchAreas("a")) > 30 {
		t.Fatal("results should be capped at 30")
	}
}

func TestRealMarketDataLoads(t *testing.T) {
	md := mustMarket(t)
	got := md.MarketPosition("15-1252", "US", 135980)
	if !got.Found || got.Percentile != 50 || got.OccTitle != "Software Developers" {
		t.Fatalf("got %+v", got)
	}
	if md.Sources["bls"].Release != "May 2025" {
		t.Fatalf("sources = %+v", md.Sources)
	}
}
