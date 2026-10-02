package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Free, official job APIs used alongside the JobSpy scraper. Each maps its
// results to rawJob; base URLs are variables so tests can use fake servers.
var (
	usajobsBaseURL   = "https://data.usajobs.gov/api/search"
	himalayasBaseURL = "https://himalayas.app/jobs/api/search"
	jobicyBaseURL    = "https://jobicy.com/api/v2/remote-jobs"
	apiTimeout       = 30 * time.Second
	apiUserAgent     = "JobTrack/1.0 (personal job tracker)"
)

const (
	himalayasPageSize = 20
	himalayasMaxPages = 5
	jobicyMaxCount    = 200
	usajobsMaxDays    = 60
)

// getJSON performs a GET and decodes JSON, keeping URLs (which may hold keys) out of errors.
func getJSON(ctx context.Context, source, rawURL string, headers map[string]string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return fmt.Errorf("could not build %s request", source)
	}
	req.Header.Set("User-Agent", apiUserAgent)
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("timed out after %s", apiTimeout)
		}
		var uerr *url.Error
		if errors.As(err, &uerr) {
			err = uerr.Err
		}
		return fmt.Errorf("could not reach %s: %v", source, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return errors.New(httpErrorMessage(source, resp.StatusCode, body))
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("unexpected %s response: %v", source, err)
	}
	return nil
}

func floatPtr(v float64) *float64 {
	if v <= 0 {
		return nil
	}
	return &v
}

func firstN(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// ---- USAJobs (federal jobs; free key + registered email) ----

var usajobsIntervals = map[string]string{"PA": "yearly", "PH": "hourly", "PD": "daily", "PW": "weekly", "BW": "biweekly", "PM": "monthly"}

type usajobsResponse struct {
	SearchResult struct {
		SearchResultItems []struct {
			MatchedObjectDescriptor struct {
				PositionTitle           string `json:"PositionTitle"`
				OrganizationName        string `json:"OrganizationName"`
				PositionLocationDisplay string `json:"PositionLocationDisplay"`
				PositionURI             string `json:"PositionURI"`
				PublicationStartDate    string `json:"PublicationStartDate"`
				PositionRemuneration    []struct {
					MinimumRange     string `json:"MinimumRange"`
					MaximumRange     string `json:"MaximumRange"`
					RateIntervalCode string `json:"RateIntervalCode"`
				} `json:"PositionRemuneration"`
				UserArea struct {
					Details struct {
						JobSummary string `json:"JobSummary"`
					} `json:"Details"`
				} `json:"UserArea"`
			} `json:"MatchedObjectDescriptor"`
		} `json:"SearchResultItems"`
	} `json:"SearchResult"`
}

func usajobsSearch(ctx context.Context, key, email string, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	if key == "" || email == "" {
		return nil, errors.New("USAJobs needs an API key and your registered email (add them in Settings)")
	}
	params := url.Values{"Keyword": {q.Term}, "ResultsPerPage": {strconv.Itoa(max(opts.Results, 1))}}
	if q.Location != "" {
		params.Set("LocationName", q.Location)
	}
	if q.RemoteOnly {
		params.Set("RemoteIndicator", "True")
	}
	if opts.HoursOld > 0 {
		params.Set("DatePosted", strconv.Itoa(min((opts.HoursOld+23)/24, usajobsMaxDays)))
	}
	var resp usajobsResponse
	headers := map[string]string{"Host": "data.usajobs.gov", "User-Agent": email, "Authorization-Key": key}
	if err := getJSON(ctx, "USAJobs", usajobsBaseURL+"?"+params.Encode(), headers, &resp); err != nil {
		return nil, err
	}
	out := []rawJob{}
	for _, item := range resp.SearchResult.SearchResultItems {
		d := item.MatchedObjectDescriptor
		j := rawJob{
			Title: d.PositionTitle, Company: d.OrganizationName, Location: d.PositionLocationDisplay,
			URL: d.PositionURI, DatePosted: firstN(d.PublicationStartDate, 10), Site: "usajobs",
			Description: htmlToText(d.UserArea.Details.JobSummary),
		}
		if len(d.PositionRemuneration) > 0 {
			pay := d.PositionRemuneration[0]
			lo, _ := strconv.ParseFloat(pay.MinimumRange, 64)
			hi, _ := strconv.ParseFloat(pay.MaximumRange, 64)
			j.MinAmount, j.MaxAmount, j.Interval = floatPtr(lo), floatPtr(hi), usajobsIntervals[pay.RateIntervalCode]
		}
		out = append(out, j)
	}
	return out, nil
}

// ---- Himalayas (remote jobs; credit Himalayas and link to its URL) ----

type himalayasResponse struct {
	Jobs []struct {
		Title                string   `json:"title"`
		CompanyName          string   `json:"companyName"`
		GUID                 string   `json:"guid"`
		PubDate              int64    `json:"pubDate"`
		MinSalary            *float64 `json:"minSalary"`
		MaxSalary            *float64 `json:"maxSalary"`
		Currency             *string  `json:"currency"`
		LocationRestrictions []string `json:"locationRestrictions"`
		Description          string   `json:"description"`
	} `json:"jobs"`
}

func himalayasSearch(ctx context.Context, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	want := max(opts.Results, 1)
	out := []rawJob{}
	for page := 1; page <= himalayasMaxPages && len(out) < want; page++ {
		var resp himalayasResponse
		params := url.Values{"q": {q.Term}, "page": {strconv.Itoa(page)}}
		if err := getJSON(ctx, "Himalayas", himalayasBaseURL+"?"+params.Encode(), nil, &resp); err != nil {
			if len(out) > 0 {
				break // keep what we already have
			}
			return nil, err
		}
		for _, h := range resp.Jobs {
			j := rawJob{
				Title: h.Title, Company: h.CompanyName, URL: h.GUID, IsRemote: true, Site: "himalayas",
				Location: strings.Join(h.LocationRestrictions, ", "), Description: htmlToText(h.Description), Interval: "yearly",
			}
			if j.Location == "" {
				j.Location = "Remote"
			}
			if h.PubDate > 0 {
				j.DatePosted = time.Unix(h.PubDate, 0).UTC().Format(dateLayout)
			}
			if h.Currency == nil || *h.Currency == "" || *h.Currency == "USD" {
				j.MinAmount, j.MaxAmount = h.MinSalary, h.MaxSalary
			}
			out = append(out, j)
		}
		if len(resp.Jobs) < himalayasPageSize {
			break
		}
	}
	if len(out) > want {
		out = out[:want]
	}
	return out, nil
}

// ---- Jobicy (remote jobs; at most one call per hour; credit Jobicy) ----

type jobicyResponse struct {
	Jobs []struct {
		JobTitle        string   `json:"jobTitle"`
		CompanyName     string   `json:"companyName"`
		URL             string   `json:"url"`
		JobGeo          string   `json:"jobGeo"`
		PubDate         string   `json:"pubDate"`
		SalaryMin       *float64 `json:"salaryMin"`
		SalaryMax       *float64 `json:"salaryMax"`
		AnnualSalaryMin *float64 `json:"annualSalaryMin"`
		AnnualSalaryMax *float64 `json:"annualSalaryMax"`
		SalaryCurrency  string   `json:"salaryCurrency"`
		SalaryPeriod    string   `json:"salaryPeriod"`
		JobDescription  string   `json:"jobDescription"`
	} `json:"jobs"`
}

func jobicySearch(ctx context.Context, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	params := url.Values{"count": {strconv.Itoa(min(max(opts.Results, 1), jobicyMaxCount))}, "tag": {q.Term}}
	var resp jobicyResponse
	if err := getJSON(ctx, "Jobicy", jobicyBaseURL+"?"+params.Encode(), nil, &resp); err != nil {
		return nil, err
	}
	out := []rawJob{}
	for _, jb := range resp.Jobs {
		j := rawJob{
			Title: jb.JobTitle, Company: jb.CompanyName, URL: jb.URL, Location: jb.JobGeo, IsRemote: true,
			DatePosted: firstN(jb.PubDate, 10), Description: htmlToText(jb.JobDescription), Site: "jobicy",
		}
		if jb.SalaryCurrency == "" || jb.SalaryCurrency == "USD" {
			lo, hi := jb.SalaryMin, jb.SalaryMax
			if lo == nil && hi == nil {
				lo, hi = jb.AnnualSalaryMin, jb.AnnualSalaryMax
			}
			j.MinAmount, j.MaxAmount = lo, hi
			j.Interval = map[string]string{"hour": "hourly", "hourly": "hourly", "month": "monthly", "monthly": "monthly"}[strings.ToLower(jb.SalaryPeriod)]
			if j.Interval == "" {
				j.Interval = "yearly"
			}
		}
		out = append(out, j)
	}
	return out, nil
}

// httpErrorMessage turns a failed response into a short, readable message.
// Many sites answer outages with an HTML page, which is useless in a toast.
func httpErrorMessage(source string, status int, body []byte) string {
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return fmt.Sprintf("%s rejected the API key (%d). Check it in Settings.", source, status)
	case status == http.StatusTooManyRequests:
		return fmt.Sprintf("%s is rate-limiting requests (%d). Try again later.", source, status)
	case status >= 500:
		return fmt.Sprintf("%s is temporarily unavailable (%d). Try again later.", source, status)
	}
	text := strings.TrimSpace(string(body))
	lower := strings.ToLower(firstN(text, 200))
	if text == "" || strings.HasPrefix(lower, "<!doctype") || strings.HasPrefix(lower, "<html") || strings.Contains(lower, "<head") {
		return fmt.Sprintf("%s returned an error (%d).", source, status)
	}
	return fmt.Sprintf("%s error %d: %s", source, status, truncate(text, 200))
}
