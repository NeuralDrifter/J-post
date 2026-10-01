package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

//go:embed scraper.py
var scraperScript []byte

var (
	jobspyTimeout   = 90 * time.Second
	selfTestTimeout = 30 * time.Second
	adzunaTimeout   = 20 * time.Second
	adzunaBaseURL   = "https://api.adzuna.com/v1/api/jobs/us/search/1"
)

// knownSources are the values DiscoverQuery.Sources may contain.
var knownSources = map[string]bool{"indeed": true, "linkedin": true, "zip_recruiter": true, "adzuna": true}

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
type sourceFunc func(ctx context.Context, source string, q DiscoverQuery) ([]rawJob, error)

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

var errUnreadableOutput = errors.New("unreadable scraper output")

func lastLine(s, fallback string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			return l
		}
	}
	return fallback
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// parseScraperOutput reads the JSON payload from the last non-empty stdout
// line, ignoring any log noise printed before it.
func parseScraperOutput(out []byte) ([]rawJob, error) {
	line := lastLine(string(out), "")
	var payload struct {
		Jobs  []rawJob `json:"jobs"`
		Error string   `json:"error"`
	}
	if line == "" || json.Unmarshal([]byte(line), &payload) != nil {
		return nil, fmt.Errorf("%w: %q", errUnreadableOutput, truncate(line, 200))
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
	hideConsole(cmd)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	runErr := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return nil, fmt.Errorf("timed out after %s", timeout)
	}
	jobs, err := parseScraperOutput(stdout.Bytes())
	if err != nil && runErr != nil && errors.Is(err, errUnreadableOutput) {
		return nil, fmt.Errorf("scraper failed: %s", lastLine(stderr.String(), runErr.Error()))
	}
	return jobs, err
}

func runJobSpy(ctx context.Context, python, site string, q DiscoverQuery) ([]rawJob, error) {
	args := []string{"--site", site, "--term", q.Term, "--location", q.Location}
	if q.RemoteOnly {
		args = append(args, "--remote")
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

func adzunaSearch(ctx context.Context, appID, appKey string, q DiscoverQuery) ([]rawJob, error) {
	if appID == "" || appKey == "" {
		return nil, errors.New("Adzuna keys are not set (add them in Settings)")
	}
	what := q.Term
	if q.RemoteOnly {
		what += " remote"
	}
	params := url.Values{"app_id": {appID}, "app_key": {appKey}, "results_per_page": {"20"}, "what": {what}}
	if q.Location != "" {
		params.Set("where", q.Location)
	}
	ctx, cancel := context.WithTimeout(ctx, adzunaTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, adzunaBaseURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, errors.New("could not build Adzuna request")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("timed out after %s", adzunaTimeout)
		}
		// *url.Error includes the request URL, which contains the app key.
		var uerr *url.Error
		if errors.As(err, &uerr) {
			err = uerr.Err
		}
		return nil, fmt.Errorf("could not reach Adzuna: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, fmt.Errorf("Adzuna error %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var parsed adzunaResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("unexpected Adzuna response: %v", err)
	}
	out := make([]rawJob, 0, len(parsed.Results))
	for _, it := range parsed.Results {
		date := it.Created
		if len(date) >= 10 {
			date = date[:10]
		}
		out = append(out, rawJob{
			Title: it.Title, Company: it.Company.DisplayName, Location: it.Location.DisplayName,
			MinAmount: it.SalaryMin, MaxAmount: it.SalaryMax, Interval: "yearly",
			Description: it.Description, DatePosted: date, URL: it.RedirectURL, Site: "adzuna",
		})
	}
	return out, nil
}

// ---- Normalization ----

var intervalFactor = map[string]float64{"yearly": 1, "monthly": 12, "weekly": 52, "daily": 260, "hourly": 2080}
var intervalUnit = map[string]string{"yearly": "yr", "monthly": "mo", "weekly": "wk", "daily": "day", "hourly": "hr"}

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

// normalizeSalary converts a posted range to annual integers. Missing or
// non-positive amounts count as absent; unknown intervals are treated as yearly.
func normalizeSalary(min, max *float64, interval string) (lo, hi *int64, annualized bool, text string) {
	if min != nil && *min <= 0 {
		min = nil
	}
	if max != nil && *max <= 0 {
		max = nil
	}
	if min == nil && max == nil {
		return nil, nil, false, ""
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
	switch {
	case min != nil && max != nil:
		text = moneyText(*min) + "–" + moneyText(*max) + unit
	case min != nil:
		text = "From " + moneyText(*min) + unit
	default:
		text = "Up to " + moneyText(*max) + unit
	}
	return annualize(min), annualize(max), interval != "yearly", text
}

func dedupeKey(company, title string) string {
	norm := func(s string) string { return strings.Join(strings.Fields(strings.ToLower(s)), " ") }
	return norm(company) + "|" + norm(title)
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
	res.SalaryMin, res.SalaryMax, res.Annualized, res.SalaryText = normalizeSalary(r.MinAmount, r.MaxAmount, r.Interval)
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
func runDiscover(ctx context.Context, q DiscoverQuery, fetch sourceFunc, tracked []Job) DiscoverResponse {
	var sources []string
	for _, s := range q.Sources {
		if knownSources[s] && !slices.Contains(sources, s) {
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
			jobs, err := fetch(ctx, s, q)
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
	markTracked(resp.Results, tracked)
	return resp
}
