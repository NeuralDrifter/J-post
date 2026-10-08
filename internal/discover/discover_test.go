// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func f64(v float64) *float64 { return &v }

func i64val(p *int64) int64 {
	if p == nil {
		return -1
	}
	return *p
}

func TestNormalizeSalary(t *testing.T) {
	cases := []struct {
		name       string
		lo, hi     *float64
		interval   string
		wantLo     int64
		wantHi     int64
		annualized bool
		text       string
	}{
		{"hourly", f64(45), f64(55), "hourly", 93600, 114400, true, "$45–$55/hr"},
		{"yearly", f64(120000), f64(150000), "yearly", 120000, 150000, false, "$120,000–$150,000/yr"},
		{"monthly min only", f64(5000), nil, "monthly", 60000, -1, true, "From $5,000/mo"},
		{"max only", nil, f64(90000), "", -1, 90000, false, "Up to $90,000/yr"},
		{"zeros", f64(0), f64(0), "yearly", -1, -1, false, ""},
		{"none", nil, nil, "yearly", -1, -1, false, ""},
		{"unknown interval", f64(100000), f64(110000), "fortnightly", 100000, 110000, false, "$100,000–$110,000/yr"},
		{"cents", f64(22.5), f64(30), "hourly", 46800, 62400, true, "$22.50–$30/hr"},
	}
	for _, c := range cases {
		pay := normalizeSalary(c.lo, c.hi, c.interval)
		if i64val(pay.min) != c.wantLo || i64val(pay.max) != c.wantHi || pay.annualized != c.annualized || pay.text != c.text {
			t.Errorf("%s: got %d %d %v %q", c.name, i64val(pay.min), i64val(pay.max), pay.annualized, pay.text)
		}
	}
}

func TestParseScraperOutputUnicodeAndNoise(t *testing.T) {
	out := "INFO JobSpy: scraping\n" +
		`{"jobs": [{"title": "Engineer — Platform", "company": "Café 🚀", "min_amount": null, "is_remote": true, "site": "indeed"}]}` + "\r\n\n"
	jobs, err := parseScraperOutput([]byte(out))
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 1 || jobs[0].Title != "Engineer — Platform" || jobs[0].Company != "Café 🚀" || !jobs[0].IsRemote || jobs[0].MinAmount != nil {
		t.Fatalf("jobs = %+v", jobs)
	}
}

func TestParseScraperOutputError(t *testing.T) {
	if _, err := parseScraperOutput([]byte(`{"error": "rate limited"}`)); err == nil || err.Error() != "rate limited" {
		t.Fatalf("err = %v", err)
	}
	if _, err := parseScraperOutput([]byte("Traceback ...\n")); !errors.Is(err, errUnreadableOutput) {
		t.Fatalf("err = %v", err)
	}
	if jobs, err := parseScraperOutput([]byte(`{"jobs": []}`)); err != nil || jobs == nil {
		t.Fatalf("jobs = %#v, %v", jobs, err)
	}
}

func TestMergeResultsDedupes(t *testing.T) {
	a := FromRaw(RawJob{Title: "Go  Developer", Company: "Acme", Description: "short", Site: "indeed"}, "indeed")
	b := FromRaw(RawJob{Title: "go developer", Company: " ACME ", Description: "a much longer description", URL: "https://x.test/1",
		MinAmount: f64(100000), MaxAmount: f64(120000), Interval: "yearly", Location: "Denver, CO"}, "linkedin")
	c := FromRaw(RawJob{Title: "Other", Company: "Acme"}, "linkedin")
	merged := MergeResults([]DiscoverResult{a}, []DiscoverResult{b, c})
	if len(merged) != 2 {
		t.Fatalf("merged = %+v", merged)
	}
	m := merged[0]
	if strings.Join(m.Sources, ",") != "indeed,linkedin" || m.Description != "a much longer description" ||
		m.URL != "https://x.test/1" || i64val(m.SalaryMin) != 100000 || m.Location != "Denver, CO" || m.Title != "Go  Developer" {
		t.Fatalf("m = %+v", m)
	}
}

func TestResolvePythonOrder(t *testing.T) {
	exeDir, cwd := t.TempDir(), t.TempDir()
	makePy := func(dir string) string {
		p := filepath.Join(dir, "venv", "Scripts", "python.exe")
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, nil, 0o755)
		return p
	}
	if _, err := resolvePython("", exeDir, cwd); err == nil || !strings.Contains(err.Error(), exeDir) || !strings.Contains(err.Error(), cwd) {
		t.Fatalf("err should list checked paths: %v", err)
	}
	cwdPy := makePy(cwd)
	if got, _ := resolvePython(filepath.Join(exeDir, "missing.exe"), exeDir, cwd); got != cwdPy {
		t.Fatalf("got %q, want cwd python", got)
	}
	exePy := makePy(exeDir)
	if got, _ := resolvePython("", exeDir, cwd); got != exePy {
		t.Fatalf("got %q, want exe-dir python", got)
	}
	override := filepath.Join(t.TempDir(), "py.exe")
	os.WriteFile(override, nil, 0o755)
	if got, _ := resolvePython(override, exeDir, cwd); got != override {
		t.Fatalf("got %q, want override", got)
	}
}

func withAdzunaURL(t *testing.T, u string) {
	old := adzunaBaseURL
	adzunaBaseURL = u
	t.Cleanup(func() { adzunaBaseURL = old })
}

func TestAdzunaSearchMapsFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		q := req.URL.Query()
		if q.Get("what") != "go developer remote" || q.Get("where") != "Denver" || q.Get("app_id") != "id" || q.Get("results_per_page") != "20" {
			t.Errorf("query = %v", q)
		}
		w.Write([]byte(`{"results":[{"title":"Go Dev","description":"Build things","created":"2026-09-30T10:00:00Z",
			"redirect_url":"https://x.test/1","salary_min":120000,"salary_max":150000,
			"company":{"display_name":"Acme"},"location":{"display_name":"Denver, CO"}}]}`))
	}))
	defer srv.Close()
	withAdzunaURL(t, srv.URL)
	jobs, err := AdzunaSearch(context.Background(), "id", "key", DiscoverQuery{Term: "go developer", Location: "Denver", RemoteOnly: true}, FetchOptions{Results: 20})
	if err != nil || len(jobs) != 1 {
		t.Fatalf("jobs=%+v err=%v", jobs, err)
	}
	j := jobs[0]
	if j.Title != "Go Dev" || j.Company != "Acme" || j.DatePosted != "2026-09-30" || *j.MinAmount != 120000 || j.Interval != "yearly" || j.Site != "adzuna" {
		t.Fatalf("job = %+v", j)
	}
}

func TestAdzunaErrorDoesNotLeakKey(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		http.Error(w, "bad credentials", http.StatusUnauthorized)
	}))
	defer srv.Close()
	withAdzunaURL(t, srv.URL)
	_, err := AdzunaSearch(context.Background(), "id", "s3cretkey", DiscoverQuery{Term: "x"}, FetchOptions{})
	if err == nil || strings.Contains(err.Error(), "s3cretkey") || !strings.Contains(err.Error(), "401") {
		t.Fatalf("err = %v", err)
	}
	withAdzunaURL(t, "http://127.0.0.1:1/unreachable")
	_, err = AdzunaSearch(context.Background(), "id", "s3cretkey", DiscoverQuery{Term: "x"}, FetchOptions{})
	if err == nil || strings.Contains(err.Error(), "s3cretkey") {
		t.Fatalf("err = %v", err)
	}
}

func TestScraperSelfTest(t *testing.T) {
	if !strings.Contains(string(scraperScript), "--self-test") {
		t.Fatal("embedded scraper is missing --self-test")
	}
	python, err := resolvePython("", "", "../..") // the repo root, where the dev venv lives
	if err != nil {
		t.Skip("no venv python; skipping live scraper check")
	}
	if err := CheckScraper(context.Background(), python); err != nil {
		t.Fatalf("self-test failed: %v", err)
	}
}

func TestMaxDaysOldRoundsUp(t *testing.T) {
	for hours, want := range map[int]int{0: 0, 1: 1, 24: 1, 25: 2, 48: 2} {
		if got := (FetchOptions{HoursOld: hours}).maxDaysOld(); got != want {
			t.Errorf("%d hours = %d days, want %d", hours, got, want)
		}
	}
}
