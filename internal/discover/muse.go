// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"jobtrack/internal/httpapi"
	"jobtrack/internal/textproc"
)

// The Muse's public jobs API, read one category × location slice at a time.
var (
	museBaseURL   = "https://www.themuse.com/api/public/jobs"
	musePageDelay = 300 * time.Millisecond
)

const (
	museMaxPages     = 100 // 2,000 jobs per slice
	MuseRemote       = "Flexible / Remote"
	museMinRemaining = 10 // stop paging when the hourly allowance runs this low
)

type museResponse struct {
	PageCount int `json:"page_count"`
	Total     int `json:"total"`
	Results   []struct {
		ID              int64  `json:"id"`
		Name            string `json:"name"`
		Contents        string `json:"contents"`
		PublicationDate string `json:"publication_date"`
		Company         struct {
			Name string `json:"name"`
		} `json:"company"`
		Locations []struct {
			Name string `json:"name"`
		} `json:"locations"`
		Levels []struct {
			Name string `json:"name"`
		} `json:"levels"`
		Refs struct {
			LandingPage string `json:"landing_page"`
		} `json:"refs"`
	} `json:"results"`
}

// MuseLocation maps the search location to The Muse's "City, ST" names.
func MuseLocation(q DiscoverQuery) string {
	loc := strings.TrimSpace(q.Location)
	if q.RemoteOnly || loc == "" {
		return MuseRemote
	}
	parts := strings.SplitN(loc, ",", 2)
	city := strings.Fields(strings.ToLower(parts[0]))
	for i, w := range city {
		city[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	out := strings.Join(city, " ")
	if len(parts) == 2 {
		out += ", " + strings.ToUpper(strings.TrimSpace(parts[1]))
	}
	return out
}

func fetchMusePage(ctx context.Context, category, location string, page int) (museResponse, int, error) {
	var out museResponse
	params := url.Values{"page": {strconv.Itoa(page)}, "category": {category}, "location": {location}}
	header, err := httpapi.GetJSON(ctx, httpapi.Request{Source: "The Muse", URL: museBaseURL + "?" + params.Encode()}, &out)
	if err != nil {
		return out, 0, err
	}
	remaining := -1
	if v, err := strconv.Atoi(header.Get("X-RateLimit-Remaining")); err == nil {
		remaining = v
	}
	return out, remaining, nil
}

// MuseJob is one listing in the local copy of a slice.
type MuseJob struct {
	ID                                                        int64
	Title, Company, Locations, Levels, Date, URL, Description string
}

// FetchMuseSlice pages through The Muse for one slice, pausing between pages and
// stopping early when the hourly allowance runs low. A failure after the first
// page keeps the pages already fetched.
func FetchMuseSlice(ctx context.Context, category, location string) ([]MuseJob, error) {
	var jobs []MuseJob
	for page := 0; page < museMaxPages; page++ {
		if page > 0 && musePageDelay > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(musePageDelay):
			}
		}
		resp, remaining, err := fetchMusePage(ctx, category, location, page)
		if err != nil {
			if len(jobs) > 0 {
				break
			}
			return nil, err
		}
		jobs = append(jobs, museJobs(resp)...)
		if page+1 >= resp.PageCount || (remaining >= 0 && remaining < museMinRemaining) {
			break
		}
	}
	return jobs, nil
}

func museJobs(resp museResponse) []MuseJob {
	jobs := make([]MuseJob, 0, len(resp.Results))
	for _, j := range resp.Results {
		var locs, levels []string
		for _, l := range j.Locations {
			locs = append(locs, l.Name)
		}
		for _, l := range j.Levels {
			levels = append(levels, l.Name)
		}
		jobs = append(jobs, MuseJob{j.ID, j.Name, j.Company.Name, strings.Join(locs, "; "), strings.Join(levels, ", "),
			textproc.DatePart(j.PublicationDate), j.Refs.LandingPage, textproc.HTMLToText(j.Contents)})
	}
	return jobs
}
