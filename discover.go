// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"jobtrack/internal/httpapi"
	"jobtrack/internal/osproc"
	"jobtrack/internal/textproc"
)

//go:embed scripts/scraper.py
var scraperScript []byte

var (
	jobspyTimeout   = 90 * time.Second
	selfTestTimeout = 30 * time.Second
	adzunaTimeout   = 20 * time.Second
	adzunaBaseURL   = "https://api.adzuna.com/v1/api/jobs/us/search/1"
)

type DiscoverQuery struct {
	Term       string   `json:"term"`
	Location   string   `json:"location"`
	RemoteOnly bool     `json:"remoteOnly"`
	Sources    []string `json:"sources"`
}

type DiscoverResult struct {
	Key           string   `json:"key"`
	Title         string   `json:"title"`
	Company       string   `json:"company"`
	Location      string   `json:"location"`
	WorkMode      string   `json:"workMode"`
	SalaryMin     *int64   `json:"salaryMin,omitempty"`
	SalaryMax     *int64   `json:"salaryMax,omitempty"`
	SalaryText    string   `json:"salaryText"`
	Annualized    bool     `json:"annualized"`
	Description   string   `json:"description"`
	DatePosted    string   `json:"datePosted"`
	URL           string   `json:"url"`
	Sources       []string `json:"sources"`
	TrackedJobID  string   `json:"trackedJobId"`
	TrackedStatus string   `json:"trackedStatus"`
}

type DiscoverResponse struct {
	Results []DiscoverResult  `json:"results"`
	Errors  map[string]string `json:"errors"`
}

// rawJob is one posting as reported by a single source, before normalization.
type rawJob struct {
	Title       string   `json:"title"`
	Company     string   `json:"company"`
	Location    string   `json:"location"`
	IsRemote    bool     `json:"is_remote"`
	MinAmount   *float64 `json:"min_amount"`
	MaxAmount   *float64 `json:"max_amount"`
	Interval    string   `json:"interval"`
	Description string   `json:"description"`
	DatePosted  string   `json:"date_posted"`
	URL         string   `json:"job_url"`
	Site        string   `json:"site"`
}

// sourceFunc fetches raw postings from one source; injected so tests can fake it.
type sourceFunc func(ctx context.Context, source string, q DiscoverQuery, opts fetchOptions) ([]rawJob, error)

// ---- Python / JobSpy ----

func resolvePython(override, exeDir, cwd string) (string, error) {
	var candidates []string
	if override != "" {
		candidates = append(candidates, override)
	}
	candidates = append(candidates,
		filepath.Join(exeDir, "venv", "Scripts", "python.exe"),
		filepath.Join(cwd, "venv", "Scripts", "python.exe"))
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("Python with JobSpy not found (checked %s). Set the Python path in Settings", strings.Join(candidates, ", "))
}

// findPython locates the Python that has JobSpy: the Settings override, else a
// venv next to the app or in the working directory.
func findPython(override string) (string, error) {
	cwd, _ := os.Getwd() // "" just drops that candidate's directory
	return resolvePython(strings.TrimSpace(override), exeDir(), cwd)
}

func exeDir() string {
	p, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(p)
}

var errUnreadableOutput = errors.New("unreadable scraper output")

// parseScraperOutput reads the JSON payload from the last non-empty stdout
// line, ignoring any log noise printed before it.
func parseScraperOutput(out []byte) ([]rawJob, error) {
	line := textproc.LastLine(string(out), "")
	var payload struct {
		Jobs  []rawJob `json:"jobs"`
		Error string   `json:"error"`
	}
	if line == "" || json.Unmarshal([]byte(line), &payload) != nil {
		return nil, fmt.Errorf("%w: %q", errUnreadableOutput, textproc.Truncate(line, 200))
	}
	if payload.Error != "" {
		return nil, errors.New(payload.Error)
	}
	if payload.Jobs == nil {
		payload.Jobs = []rawJob{}
	}
	return payload.Jobs, nil
}

func runScraperScript(ctx context.Context, python string, timeout time.Duration, args ...string) ([]rawJob, error) {
	f, err := os.CreateTemp("", "jobtrack_scraper_*.py")
	if err != nil {
		return nil, err
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(scraperScript); err != nil {
		f.Close()
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, append([]string{f.Name()}, args...)...)
	osproc.HideConsole(cmd)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	runErr := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return nil, fmt.Errorf("timed out after %s", timeout)
	}
	jobs, err := parseScraperOutput(stdout.Bytes())
	if err != nil && runErr != nil && errors.Is(err, errUnreadableOutput) {
		return nil, fmt.Errorf("scraper failed: %s", textproc.LastLine(stderr.String(), runErr.Error()))
	}
	return jobs, err
}

func runJobSpy(ctx context.Context, python, site string, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	args := []string{"--site", site, "--term", q.Term, "--location", q.Location}
	if q.RemoteOnly {
		args = append(args, "--remote")
	}
	if opts.Results > 0 {
		args = append(args, "--results", strconv.Itoa(opts.Results))
	}
	if opts.HoursOld > 0 {
		args = append(args, "--hours-old", strconv.Itoa(opts.HoursOld))
	}
	return runScraperScript(ctx, python, jobspyTimeout, args...)
}

// checkScraper verifies that python can import JobSpy (Settings "Test" button).
func checkScraper(ctx context.Context, python string) error {
	_, err := runScraperScript(ctx, python, selfTestTimeout, "--self-test")
	return err
}

// ---- Adzuna ----

type adzunaResponse struct {
	Results []struct {
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Created     string   `json:"created"`
		RedirectURL string   `json:"redirect_url"`
		SalaryMin   *float64 `json:"salary_min"`
		SalaryMax   *float64 `json:"salary_max"`
		Company     struct {
			DisplayName string `json:"display_name"`
		} `json:"company"`
		Location struct {
			DisplayName string `json:"display_name"`
		} `json:"location"`
	} `json:"results"`
}

func adzunaSearch(ctx context.Context, appID, appKey string, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	what := q.Term
	if q.RemoteOnly {
		what += " remote"
	}
	results := opts.Results
	if results <= 0 {
		results = defaultPerSource
	}
	params := url.Values{"app_id": {appID}, "app_key": {appKey}, "results_per_page": {strconv.Itoa(min(results, maxAdzunaResults))}, "what": {what}}
	if q.Location != "" {
		params.Set("where", q.Location)
	}
	if opts.HoursOld > 0 {
		params.Set("max_days_old", strconv.Itoa(opts.maxDaysOld()))
	}
	var parsed adzunaResponse
	req := httpapi.Request{Source: "Adzuna", URL: adzunaBaseURL + "?" + params.Encode(), Timeout: adzunaTimeout}
	if _, err := httpapi.GetJSON(ctx, req, &parsed); err != nil {
		return nil, err
	}
	out := make([]rawJob, 0, len(parsed.Results))
	for _, it := range parsed.Results {
		out = append(out, rawJob{
			Title: it.Title, Company: it.Company.DisplayName, Location: it.Location.DisplayName,
			MinAmount: it.SalaryMin, MaxAmount: it.SalaryMax, Interval: "yearly",
			Description: it.Description, DatePosted: textproc.DatePart(it.Created), URL: it.RedirectURL, Site: "adzuna",
		})
	}
	return out, nil
}

// ---- Normalization ----

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

func dedupeKey(company, title string) string {
	return textproc.NormalizeForMatch(company) + "|" + textproc.NormalizeForMatch(title)
}

func fromRaw(r rawJob, source string) DiscoverResult {
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
	res.Key = dedupeKey(res.Company, res.Title)
	return res
}

func mergeInto(a, b DiscoverResult) DiscoverResult {
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

// mergeResults de-duplicates by company+title, keeping first-seen order.
func mergeResults(lists ...[]DiscoverResult) []DiscoverResult {
	index := map[string]int{}
	out := []DiscoverResult{}
	for _, list := range lists {
		for _, r := range list {
			if i, ok := index[r.Key]; ok {
				out[i] = mergeInto(out[i], r)
				continue
			}
			index[r.Key] = len(out)
			out = append(out, r)
		}
	}
	return out
}

// markTracked flags results that are already on the board, by company+title or URL.
func markTracked(results []DiscoverResult, jobs []Job) {
	byKey := map[string]Job{}
	byURL := map[string]Job{}
	for _, j := range jobs {
		byKey[dedupeKey(j.Company, j.Position)] = j
		if j.URL != "" {
			byURL[j.URL] = j
		}
	}
	for i := range results {
		j, ok := byKey[results[i].Key]
		if !ok && results[i].URL != "" {
			j, ok = byURL[results[i].URL]
		}
		if ok {
			results[i].TrackedJobID, results[i].TrackedStatus = j.ID, j.Status
		}
	}
}

// runDiscover queries every requested source concurrently; one failing source
// only adds an entry to Errors.
func runDiscover(ctx context.Context, q DiscoverQuery, fetch sourceFunc, optsFor func(source string) fetchOptions) DiscoverResponse {
	var sources []string
	for _, s := range q.Sources {
		if isKnownSource(s) && !slices.Contains(sources, s) {
			sources = append(sources, s)
		}
	}
	type outcome struct {
		source string
		jobs   []rawJob
		err    error
	}
	ch := make(chan outcome, len(sources))
	for _, s := range sources {
		go func(s string) {
			jobs, err := fetch(ctx, s, q, optsFor(s))
			ch <- outcome{s, jobs, err}
		}(s)
	}
	resp := DiscoverResponse{Results: []DiscoverResult{}, Errors: map[string]string{}}
	perSource := map[string][]DiscoverResult{}
	for range sources {
		o := <-ch
		if o.err != nil {
			resp.Errors[o.source] = o.err.Error()
			continue
		}
		for _, rj := range o.jobs {
			if strings.TrimSpace(rj.Title) == "" {
				continue
			}
			perSource[o.source] = append(perSource[o.source], fromRaw(rj, o.source))
		}
	}
	lists := make([][]DiscoverResult, 0, len(sources))
	for _, s := range sources {
		lists = append(lists, perSource[s])
	}
	resp.Results = mergeResults(lists...)
	return resp
}
