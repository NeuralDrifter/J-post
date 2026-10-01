package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func basePackage(jobID string) CompPackage {
	return CompPackage{
		JobID: jobID, Kind: "offer", Label: "Offer", BaseSalary: 150000, TargetBonusPct: 10,
		EquityType: "rsu", RSUGrantValue: 200000, Vesting: "standard", TaxState: "CO", AreaCode: "19740",
		OccupationCode: "15-1252", K401MatchPct: 50, K401MatchCapPct: 6, K401ContribPct: 6,
	}
}

func mustSavePkg(t *testing.T, r *Repo, p CompPackage) CompPackage {
	t.Helper()
	saved, err := r.SaveCompPackage(p)
	if err != nil {
		t.Fatalf("SaveCompPackage: %v", err)
	}
	return saved
}

func TestCompPackageCRUD(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusOffer})
	p := mustSavePkg(t, r, basePackage(j.ID))
	if p.ID == "" || p.CreatedAt == "" {
		t.Fatalf("p = %+v", p)
	}
	p.BaseSalary = 160000
	mustSavePkg(t, r, p)
	got, err := r.GetCompPackage(p.ID)
	if err != nil || got.BaseSalary != 160000 || got.RSUGrantValue != 200000 || got.K401MatchCapPct != 6 {
		t.Fatalf("got %+v, %v", got, err)
	}
	forJob, _ := r.ListCompPackagesForJob(j.ID)
	all, _ := r.ListCompPackages()
	if len(forJob) != 1 || len(all) != 1 {
		t.Fatalf("forJob=%d all=%d", len(forJob), len(all))
	}
	if err := r.DeleteCompPackage(p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetCompPackage(p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestOnlyOneCurrent(t *testing.T) {
	r := newTestRepo(t)
	cur := CompPackage{Kind: "current", Label: "Current job", BaseSalary: 120000, Vesting: "standard", EquityType: "none", TaxState: "CO"}
	first := mustSavePkg(t, r, cur)
	if _, err := r.SaveCompPackage(cur); err == nil {
		t.Fatal("a second current package should be rejected")
	}
	first.BaseSalary = 125000
	mustSavePkg(t, r, first) // updating the existing one is fine
}

func TestDeleteJobCascadesPackages(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	mustSavePkg(t, r, basePackage(j.ID))
	if err := r.DeleteJob(j.ID); err != nil {
		t.Fatal(err)
	}
	if all, _ := r.ListCompPackages(); len(all) != 0 {
		t.Fatalf("packages survived job delete: %+v", all)
	}
}

func TestDeleteOfferKeepsCounter(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	offer := mustSavePkg(t, r, basePackage(j.ID))
	counter, err := r.DraftCounter(offer.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.DeleteCompPackage(offer.ID); err != nil {
		t.Fatal(err)
	}
	got, err := r.GetCompPackage(counter.ID)
	if err != nil || got.ParentID != "" {
		t.Fatalf("counter = %+v, %v", got, err)
	}
}

func TestDraftCounter(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	offer := mustSavePkg(t, r, basePackage(j.ID))
	c, err := r.DraftCounter(offer.ID)
	if err != nil {
		t.Fatal(err)
	}
	if c.ID == offer.ID || c.Kind != "counter" || c.ParentID != offer.ID || c.Label != "Counter: Offer" || c.BaseSalary != offer.BaseSalary || c.JobID != j.ID {
		t.Fatalf("counter = %+v", c)
	}
	cur := mustSavePkg(t, r, CompPackage{Kind: "current", Vesting: "standard", EquityType: "none", TaxState: "CO"})
	if _, err := r.DraftCounter(cur.ID); err == nil {
		t.Fatal("only offers and estimates can be countered")
	}
}

func TestCompValidation(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	bad := map[string]func(p *CompPackage){
		"bad kind":          func(p *CompPackage) { p.Kind = "dream" },
		"offer without job": func(p *CompPackage) { p.JobID = "" },
		"counter no parent": func(p *CompPackage) { p.Kind = "counter" },
		"negative base":     func(p *CompPackage) { p.BaseSalary = -1 },
		"bonus over 100":    func(p *CompPackage) { p.TargetBonusPct = 101 },
		"bad vesting":       func(p *CompPackage) { p.Vesting = "whenever" },
		"custom not 100":    func(p *CompPackage) { p.Vesting = "custom"; p.VestingCustom = "25,25,25,20" },
		"custom malformed":  func(p *CompPackage) { p.Vesting = "custom"; p.VestingCustom = "50,50" },
		"bad equity type":   func(p *CompPackage) { p.EquityType = "crypto" },
		"unknown job":       func(p *CompPackage) { p.JobID = "nope" },
	}
	for name, mutate := range bad {
		p := basePackage(j.ID)
		mutate(&p)
		if _, err := r.SaveCompPackage(p); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
	ok := basePackage(j.ID)
	ok.Vesting, ok.VestingCustom = "custom", "10, 20, 30, 40"
	mustSavePkg(t, r, ok)
}

func TestEstimatePrefill(t *testing.T) {
	lo, hi := int64(120000), int64(160000)
	e := NewEstimateForJob(Job{ID: "j", SalaryMin: &lo, SalaryMax: &hi}, "15-1252", "19740", "CO")
	if e.Kind != "estimate" || e.BaseSalary != 140000 || e.JobID != "j" || e.AreaCode != "19740" || e.TaxState != "CO" || e.Vesting != "standard" {
		t.Fatalf("e = %+v", e)
	}
	if e := NewEstimateForJob(Job{ID: "j", SalaryMax: &hi}, "", "", ""); e.BaseSalary != 160000 {
		t.Fatalf("max only: %+v", e)
	}
}

func TestMigration2OnPhase1DB(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := openDBWith(path, migrations[:1])
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := os.Stat(path + ".bak-v2"); err != nil {
		t.Fatalf("no backup before migration 2: %v", err)
	}
	if v, _ := schemaVersion(db); v != len(migrations) {
		t.Fatalf("version = %d", v)
	}
}
