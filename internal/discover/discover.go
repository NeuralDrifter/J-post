// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

const DefaultPerSource = 20

// FetchOptions are the per-source limits passed to a scraper or API.
type FetchOptions struct {
	Results  int
	HoursOld int // 0 = no age limit
}

// maxDaysOld is HoursOld in whole days, rounded up, for APIs that filter by day.
func (o FetchOptions) maxDaysOld() int { return (o.HoursOld + 23) / 24 }

type DiscoverQuery struct {
	Term       string   `json:"term"`
	Location   string   `json:"location"`
	RemoteOnly bool     `json:"remoteOnly"`
	Sources    []string `json:"sources"`
}

type DiscoverResult struct {
	Key         string   `json:"key"`
	Title       string   `json:"title"`
	Company     string   `json:"company"`
	Location    string   `json:"location"`
	WorkMode    string   `json:"workMode"`
	SalaryMin   *int64   `json:"salaryMin,omitempty"`
	SalaryMax   *int64   `json:"salaryMax,omitempty"`
	SalaryText  string   `json:"salaryText"`
	Annualized  bool     `json:"annualized"`
	Description string   `json:"description"`
	DatePosted  string   `json:"datePosted"`
	URL         string   `json:"url"`
	Sources     []string `json:"sources"`
}

type DiscoverResponse struct {
	Results []DiscoverResult  `json:"results"`
	Errors  map[string]string `json:"errors"`
}

// RawJob is one posting as reported by a single source, before normalization.
type RawJob struct {
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
