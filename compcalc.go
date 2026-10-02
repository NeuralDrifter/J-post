package main

import (
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
	Years            [4]YearBreakdown `json:"years"`
	Year1Total       int64            `json:"year1Total"`
	FourYearTotal    int64            `json:"fourYearTotal"`
	AvgPerYear       int64            `json:"avgPerYear"`
	Year1TakeHome    int64            `json:"year1TakeHome"`
	Tax1             TaxResult        `json:"tax1"`
	DeltaVsCurrent   *Deltas          `json:"deltaVsCurrent,omitempty"`
	MarketBaseline   *MarketBaseline  `json:"marketBaseline,omitempty"`
	PTOValue         int64            `json:"ptoValue"`
	Scenarios        []Scenario       `json:"scenarios"`
	Market           *MarketResult    `json:"market,omitempty"`
	COLIndex         float64          `json:"colIndex"`
	HomeCOLIndex     float64          `json:"homeColIndex"`
	COLLevel         string           `json:"colLevel"`
	COLAreaTitle     string           `json:"colAreaTitle"`
	HomeAreaTitle    string           `json:"homeAreaTitle"`
	Year1COLAdjusted int64            `json:"year1ColAdjusted"`
	Warnings         []string         `json:"warnings"`
}

var scenarioMultipliers = []float64{0, 1, 3, 10}

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
	var res PackageResult
	// Save-time rules (job link, parent offer) live in ValidateCompPackage; Evaluate
	// also runs on unsaved drafts for the editor's live preview.
	vest, err := vestingPercents(p)
	if err != nil {
		return res, err
	}
	td, err := loadTaxData()
	if err != nil {
		return res, err
	}
	filing := s.FilingStatus
	if filing == "" {
		filing = "single"
	}
	grant := equityValue(p, 1)

	for y := 0; y < 4; y++ {
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
			return res, err
		}
		yb.TakeHome = yb.Taxable - contrib - tax.Total
		if y == 0 {
			res.Tax1 = tax
		}
		res.Years[y] = yb
		res.FourYearTotal += yb.Total
	}
	res.Year1Total = res.Years[0].Total
	res.AvgPerYear = res.FourYearTotal / 4
	res.Year1TakeHome = res.Years[0].TakeHome
	res.PTOValue = roundDollars(float64(p.BaseSalary) / 260 * float64(p.PTODays))

	res.Scenarios = []Scenario{}
	if p.EquityType != "none" {
		for _, m := range scenarioMultipliers {
			res.Scenarios = append(res.Scenarios, Scenario{Multiplier: m, Value: roundDollars(equityValue(p, m))})
		}
	}

	area := p.AreaCode
	if area == "" {
		area = "US"
	}
	if md != nil {
		if p.OccupationCode != "" {
			m := md.MarketPosition(p.OccupationCode, area, p.BaseSalary)
			if m.Found {
				res.Market = &m
			}
		}
		home := s.HomeAreaCode
		if home == "" {
			home = "US"
		}
		res.COLIndex, res.COLLevel = md.CostOfLiving(area)
		res.HomeCOLIndex, _ = md.CostOfLiving(home)
		res.COLAreaTitle, res.HomeAreaTitle = md.Areas[area].Title, md.Areas[home].Title
		res.Year1COLAdjusted = roundDollars(float64(res.Year1Total) * res.HomeCOLIndex / res.COLIndex)
	}

	res.Warnings = []string{}
	if p.SigningBonus > 0 && p.SigningClawbackMonths > 0 {
		res.Warnings = append(res.Warnings, fmt.Sprintf("The signing bonus must be paid back if you leave within %d months.", p.SigningClawbackMonths))
	}
	if p.EquityType == "options" {
		res.Warnings = append(res.Warnings, "Options are valued at today's spread and assumed unexercised, so they aren't taxed here.")
	}
	if p.TaxState == "" {
		res.Warnings = append(res.Warnings, "No state chosen, so state income tax isn't included.")
	}

	// No current job: compare base pay with the typical (median) pay for the
	// user's occupation at home. OEWS wages exclude stock and most bonuses, so base only.
	if current == nil && md != nil && s.DefaultOccupation != "" && p.Kind != "current" {
		home := s.HomeAreaCode
		if home == "" {
			home = "US"
		}
		if m := md.MarketPosition(s.DefaultOccupation, home, p.BaseSalary); m.Found && m.Points[2] > 0 {
			res.MarketBaseline = &MarketBaseline{
				OccTitle: m.OccTitle, AreaTitle: m.AreaTitle, Level: m.Level,
				Median: m.Points[2], BaseDelta: p.BaseSalary - m.Points[2],
			}
		}
	}

	if current != nil && current.ID != p.ID {
		cur, err := Evaluate(*current, s, md, nil)
		if err == nil {
			res.DeltaVsCurrent = &Deltas{
				Year1Total:    res.Year1Total - cur.Year1Total,
				AvgPerYear:    res.AvgPerYear - cur.AvgPerYear,
				Year1TakeHome: res.Year1TakeHome - cur.Year1TakeHome,
			}
		}
	}
	return res, nil
}
