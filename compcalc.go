package main

import (
	"cmp"
	"fmt"
	"math"
)

// YearBreakdown is one year of a package. Total includes equity and benefits;
// Taxable is the cash-like income the tax engine sees; TakeHome is after taxes
// and the employee's own 401(k) contribution.
type YearBreakdown struct {
	Year     int   `json:"year"`
	Base     int64 `json:"base"`
	Bonus    int64 `json:"bonus"`
	Signing  int64 `json:"signing"`
	Equity   int64 `json:"equity"`
	Benefits int64 `json:"benefits"`
	Total    int64 `json:"total"`
	Taxable  int64 `json:"taxable"`
	TakeHome int64 `json:"takeHome"`
}

type Deltas struct {
	Year1Total    int64 `json:"year1Total"`
	AvgPerYear    int64 `json:"avgPerYear"`
	Year1TakeHome int64 `json:"year1TakeHome"`
}

// MarketBaseline compares base salary with the BLS median for the user's usual
// occupation where they live. Used when there's no current job to compare with.
type MarketBaseline struct {
	OccTitle  string `json:"occTitle"`
	AreaTitle string `json:"areaTitle"`
	Level     string `json:"level"`
	Median    int64  `json:"median"`
	BaseDelta int64  `json:"baseDelta"`
}

type Scenario struct {
	Multiplier float64 `json:"multiplier"`
	Value      int64   `json:"value"` // 4-year equity value at this multiple of today's share value
}

type PackageResult struct {
	Years            [compYears]YearBreakdown `json:"years"`
	Year1Total       int64                    `json:"year1Total"`
	FourYearTotal    int64                    `json:"fourYearTotal"`
	AvgPerYear       int64                    `json:"avgPerYear"`
	Year1TakeHome    int64                    `json:"year1TakeHome"`
	Tax1             TaxResult                `json:"tax1"`
	DeltaVsCurrent   *Deltas                  `json:"deltaVsCurrent,omitempty"`
	MarketBaseline   *MarketBaseline          `json:"marketBaseline,omitempty"`
	PTOValue         int64                    `json:"ptoValue"`
	Scenarios        []Scenario               `json:"scenarios"`
	Market           *MarketResult            `json:"market,omitempty"`
	COLIndex         float64                  `json:"colIndex"`
	HomeCOLIndex     float64                  `json:"homeColIndex"`
	COLLevel         string                   `json:"colLevel"`
	COLAreaTitle     string                   `json:"colAreaTitle"`
	HomeAreaTitle    string                   `json:"homeAreaTitle"`
	Year1COLAdjusted int64                    `json:"year1ColAdjusted"`
	Warnings         []string                 `json:"warnings"`
}

var scenarioMultipliers = []float64{0, 1, 3, 10}

const (
	compYears       = 4   // packages are compared over a four-year vesting horizon
	workDaysPerYear = 260 // for valuing PTO days
)

func pct(v float64) float64 { return v / 100 }

// equityValue is the full 4-year grant value at a multiple of today's share value.
func equityValue(p CompPackage, multiplier float64) float64 {
	switch p.EquityType {
	case "rsu":
		return float64(p.RSUGrantValue) * multiplier
	case "options":
		return math.Max(0, p.ShareValue*multiplier-p.OptionStrike) * float64(p.OptionShares)
	}
	return 0
}

// Evaluate computes the 4-year breakdown, take-home, scenarios, market position
// and cost-of-living figures for a package. current (optional) is the baseline
// the deltas are measured against.
func Evaluate(p CompPackage, s Settings, md *MarketData, current *CompPackage) (PackageResult, error) {
	// Save-time rules (job link, parent offer) live in ValidateCompPackage; Evaluate
	// also runs on unsaved drafts for the editor's live preview.
	applySettingsDefaults(&s)
	years, tax1, err := yearBreakdowns(p, s.FilingStatus)
	if err != nil {
		return PackageResult{}, err
	}
	res := PackageResult{Years: years, Tax1: tax1, Scenarios: equityScenarios(p), Warnings: packageWarnings(p)}
	for _, y := range years {
		res.FourYearTotal += y.Total
	}
	res.Year1Total = years[0].Total
	res.AvgPerYear = res.FourYearTotal / compYears
	res.Year1TakeHome = years[0].TakeHome
	res.PTOValue = roundDollars(float64(p.BaseSalary) / workDaysPerYear * float64(p.PTODays))

	if md != nil {
		addMarketFigures(&res, p, s.HomeAreaCode, md)
		if current == nil && p.Kind != "current" {
			res.MarketBaseline = marketBaseline(p, s, md)
		}
	}
	if current != nil && current.ID != p.ID {
		res.DeltaVsCurrent = deltasVsCurrent(res, *current, s, md)
	}
	return res, nil
}

// yearBreakdowns computes each year's pay and take-home; it also returns year 1's tax detail.
func yearBreakdowns(p CompPackage, filing string) ([compYears]YearBreakdown, TaxResult, error) {
	var years [compYears]YearBreakdown
	var tax1 TaxResult
	vest, err := vestingPercents(p)
	if err != nil {
		return years, tax1, err
	}
	td, err := loadTaxData()
	if err != nil {
		return years, tax1, err
	}
	grant := equityValue(p, 1)
	for y := range compYears {
		base := float64(p.BaseSalary) * math.Pow(1+pct(p.AnnualRaisePct), float64(y))
		yb := YearBreakdown{Year: y + 1, Base: roundDollars(base), Bonus: roundDollars(base * pct(p.TargetBonusPct))}
		if y == 0 {
			yb.Signing = p.SigningBonus
		}
		yb.Equity = roundDollars(grant * pct(vest[y]))
		match := base * math.Min(pct(p.K401ContribPct), pct(p.K401MatchCapPct)) * pct(p.K401MatchPct)
		yb.Benefits = roundDollars(match) + p.StipendsAnnual + p.OtherAnnual - p.HealthPremiumAnnual
		yb.Total = yb.Base + yb.Bonus + yb.Signing + yb.Equity + yb.Benefits

		// RSUs are taxed as wages when they vest; options are assumed unexercised.
		yb.Taxable = yb.Base + yb.Bonus + yb.Signing
		if p.EquityType == "rsu" {
			yb.Taxable += yb.Equity
		}
		contrib := min(roundDollars(base*pct(p.K401ContribPct)), td.Federal.K401Limit)
		tax, err := ComputeTax(TaxInput{Wages: yb.Taxable, PreTax401k: contrib, Filing: filing, State: p.TaxState, LocalPct: p.LocalTaxPct})
		if err != nil {
			return years, tax1, err
		}
		yb.TakeHome = yb.Taxable - contrib - tax.Total
		if y == 0 {
			tax1 = tax
		}
		years[y] = yb
	}
	return years, tax1, nil
}

// equityScenarios values the grant at several multiples of today's share value.
func equityScenarios(p CompPackage) []Scenario {
	out := []Scenario{}
	if p.EquityType == "none" {
		return out
	}
	for _, m := range scenarioMultipliers {
		out = append(out, Scenario{Multiplier: m, Value: roundDollars(equityValue(p, m))})
	}
	return out
}

// addMarketFigures fills in the market position and cost-of-living comparison.
func addMarketFigures(res *PackageResult, p CompPackage, homeArea string, md *MarketData) {
	area := cmp.Or(p.AreaCode, nationalArea)
	if p.OccupationCode != "" {
		if m := md.MarketPosition(p.OccupationCode, area, p.BaseSalary); m.Found {
			res.Market = &m
		}
	}
	res.COLIndex, res.COLLevel = md.CostOfLiving(area)
	res.HomeCOLIndex, _ = md.CostOfLiving(homeArea)
	res.COLAreaTitle, res.HomeAreaTitle = md.Areas[area].Title, md.Areas[homeArea].Title
	res.Year1COLAdjusted = roundDollars(float64(res.Year1Total) * res.HomeCOLIndex / res.COLIndex)
}

// marketBaseline compares base pay with the typical (median) pay for the user's
// occupation at home, for users with no current job to compare against. OEWS
// wages exclude stock and most bonuses, so it compares base salary only.
func marketBaseline(p CompPackage, s Settings, md *MarketData) *MarketBaseline {
	if s.DefaultOccupation == "" {
		return nil
	}
	m := md.MarketPosition(s.DefaultOccupation, s.HomeAreaCode, p.BaseSalary)
	if !m.Found || m.Median() <= 0 {
		return nil
	}
	return &MarketBaseline{
		OccTitle: m.OccTitle, AreaTitle: m.AreaTitle, Level: m.Level,
		Median: m.Median(), BaseDelta: p.BaseSalary - m.Median(),
	}
}

// deltasVsCurrent is nil when the current package can't be evaluated.
func deltasVsCurrent(res PackageResult, current CompPackage, s Settings, md *MarketData) *Deltas {
	cur, err := Evaluate(current, s, md, nil)
	if err != nil {
		return nil
	}
	return &Deltas{
		Year1Total:    res.Year1Total - cur.Year1Total,
		AvgPerYear:    res.AvgPerYear - cur.AvgPerYear,
		Year1TakeHome: res.Year1TakeHome - cur.Year1TakeHome,
	}
}

func packageWarnings(p CompPackage) []string {
	warnings := []string{}
	if p.SigningBonus > 0 && p.SigningClawbackMonths > 0 {
		warnings = append(warnings, fmt.Sprintf("The signing bonus must be paid back if you leave within %d months.", p.SigningClawbackMonths))
	}
	if p.EquityType == "options" {
		warnings = append(warnings, "Options are valued at today's spread and assumed unexercised, so they aren't taxed here.")
	}
	if p.TaxState == "" {
		warnings = append(warnings, "No state chosen, so state income tax isn't included.")
	}
	return warnings
}
