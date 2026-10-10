// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

import (
	"context"
	"net/url"
	"strconv"
	"time"

	"jobtrack/internal/httpapi"
	"jobtrack/internal/textproc"
)

// Adzuna's official search API (free keys from developer.adzuna.com).

var (
	adzunaTimeout = 20 * time.Second
	adzunaBaseURL = "https://api.adzuna.com/v1/api/jobs/us/search/1"
)

const MaxAdzunaResults = 50 // Adzuna's results_per_page limit

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

func AdzunaSearch(ctx context.Context, appID, appKey string, q DiscoverQuery, opts FetchOptions) ([]RawJob, error) {
	what := q.Term
	if q.RemoteOnly {
		what += " remote"
	}
	results := opts.Results
	if results <= 0 {
		results = DefaultPerSource
	}
	params := url.Values{"app_id": {appID}, "app_key": {appKey}, "results_per_page": {strconv.Itoa(min(results, MaxAdzunaResults))}, "what": {what}}
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
	out := make([]RawJob, 0, len(parsed.Results))
	for _, it := range parsed.Results {
		out = append(out, RawJob{
			Title: it.Title, Company: it.Company.DisplayName, Location: it.Location.DisplayName,
			MinAmount: it.SalaryMin, MaxAmount: it.SalaryMax, Interval: "yearly",
			Description: it.Description, DatePosted: textproc.DatePart(it.Created), URL: it.RedirectURL, Site: "adzuna",
		})
	}
	return out, nil
}
