// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"jobtrack/internal/textproc"
)

func TestHTMLToText(t *testing.T) {
	in := `<p>We build <b>payments</b> &amp; billing.</p><h3>You&#39;ll</h3><ul><li>Write Go</li><li>Ship <i>fast</i></li></ul><br>Thanks&nbsp;!<script>alert(1)</script>`
	got := textproc.HTMLToText(in)
	want := "We build payments & billing.\n\nYou'll\n\n- Write Go\n- Ship fast\n\nThanks !"
	if got != want {
		t.Fatalf("got %q\nwant %q", got, want)
	}
	if textproc.HTMLToText("plain text, no tags") != "plain text, no tags" {
		t.Fatal("plain text should pass through")
	}
}

func fakeServer(t *testing.T, handler http.HandlerFunc) string {
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestUSAJobsSearch(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.Header.Get("Authorization-Key") != "k3y" || r.Header.Get("User-Agent") != "me@example.test" ||
			q.Get("Keyword") != "analyst" || q.Get("LocationName") != "Denver, CO" || q.Get("ResultsPerPage") != "25" ||
			q.Get("RemoteIndicator") != "True" || q.Get("DatePosted") != "3" {
			t.Errorf("request = %v headers=%v", q, r.Header)
		}
		w.Write([]byte(`{"SearchResult":{"SearchResultItems":[{"MatchedObjectDescriptor":{
			"PositionTitle":"IT Specialist","OrganizationName":"Dept of Energy","PositionLocationDisplay":"Denver, Colorado",
			"PositionURI":"https://www.usajobs.gov/job/1","PublicationStartDate":"2026-09-30T00:00:00.0000",
			"PositionRemuneration":[{"MinimumRange":"40.50","MaximumRange":"52.00","RateIntervalCode":"PH"}],
			"UserArea":{"Details":{"JobSummary":"Support <b>systems</b>."}}}}]}}`))
	})
	old := usajobsBaseURL
	usajobsBaseURL = url
	t.Cleanup(func() { usajobsBaseURL = old })

	jobs, err := usajobsSearch(context.Background(), "k3y", "me@example.test",
		DiscoverQuery{Term: "analyst", Location: "Denver, CO", RemoteOnly: true}, fetchOptions{Results: 25, HoursOld: 50})
	if err != nil || len(jobs) != 1 {
		t.Fatalf("jobs=%+v err=%v", jobs, err)
	}
	j := jobs[0]
	if j.Title != "IT Specialist" || j.Company != "Dept of Energy" || j.URL != "https://www.usajobs.gov/job/1" ||
		j.DatePosted != "2026-09-30" || *j.MinAmount != 40.5 || j.Interval != "hourly" || j.Description != "Support systems." || j.Site != "usajobs" {
		t.Fatalf("job = %+v", j)
	}
}

func TestUSAJobsErrorsDoNotLeak(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) { http.Error(w, "unauthorized", http.StatusUnauthorized) })
	old := usajobsBaseURL
	usajobsBaseURL = url
	t.Cleanup(func() { usajobsBaseURL = old })
	_, err := usajobsSearch(context.Background(), "s3cret", "me@example.test", DiscoverQuery{Term: "x"}, fetchOptions{})
	if err == nil || !strings.Contains(err.Error(), "401") || strings.Contains(err.Error(), "s3cret") || strings.Contains(err.Error(), "me@example") {
		t.Fatalf("err = %v", err)
	}
}

func TestHimalayasSearchPagesAndMaps(t *testing.T) {
	pages := 0
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		pages++
		if r.URL.Query().Get("q") != "golang" {
			t.Errorf("q = %v", r.URL.Query())
		}
		// 20 per page; the second page is short, so paging stops.
		n := 20
		if r.URL.Query().Get("page") == "2" {
			n = 3
		}
		var b strings.Builder
		b.WriteString(`{"jobs":[`)
		for i := 0; i < n; i++ {
			if i > 0 {
				b.WriteString(",")
			}
			b.WriteString(`{"title":"Go Dev","companyName":"Acme","guid":"https://himalayas.app/companies/acme/jobs/go-` + r.URL.Query().Get("page") + string(rune('a'+i)) +
				`","pubDate":1790000000,"minSalary":120000,"maxSalary":150000,"currency":"USD","locationRestrictions":["United States"],"description":"<p>Hi</p>"}`)
		}
		b.WriteString(`]}`)
		w.Write([]byte(b.String()))
	})
	old := himalayasBaseURL
	himalayasBaseURL = url
	t.Cleanup(func() { himalayasBaseURL = old })

	jobs, err := himalayasSearch(context.Background(), DiscoverQuery{Term: "golang"}, fetchOptions{Results: 30})
	if err != nil || len(jobs) != 23 || pages != 2 {
		t.Fatalf("jobs=%d pages=%d err=%v", len(jobs), pages, err)
	}
	j := jobs[0]
	if !strings.HasPrefix(j.URL, "https://himalayas.app/") || j.Location != "United States" || !j.IsRemote ||
		*j.MinAmount != 120000 || j.Description != "Hi" || j.DatePosted == "" || j.Site != "himalayas" {
		t.Fatalf("job = %+v", j)
	}
}

func TestHimalayasRateLimited(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTooManyRequests) })
	old := himalayasBaseURL
	himalayasBaseURL = url
	t.Cleanup(func() { himalayasBaseURL = old })
	if _, err := himalayasSearch(context.Background(), DiscoverQuery{Term: "x"}, fetchOptions{}); err == nil || !strings.Contains(err.Error(), "rate-limiting") {
		t.Fatalf("err = %v", err)
	}
}

func TestJobicySearch(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("tag") != "golang" || r.URL.Query().Get("count") != "40" {
			t.Errorf("query = %v", r.URL.Query())
		}
		w.Write([]byte(`{"jobs":[
			{"jobTitle":"Platform Engineer","companyName":"Brex","url":"https://jobicy.com/jobs/1","jobGeo":"USA","pubDate":"2026-10-01 08:00:00",
			 "salaryMin":130000,"salaryMax":160000,"salaryCurrency":"USD","salaryPeriod":"yearly","jobDescription":"<ul><li>Go</li></ul>"},
			{"jobTitle":"Euro Role","companyName":"X","url":"https://jobicy.com/jobs/2","jobGeo":"Europe","pubDate":"2026-10-01 08:00:00",
			 "salaryMin":50000,"salaryMax":60000,"salaryCurrency":"EUR","jobDescription":""}]}`))
	})
	old := jobicyBaseURL
	jobicyBaseURL = url
	t.Cleanup(func() { jobicyBaseURL = old })

	jobs, err := jobicySearch(context.Background(), DiscoverQuery{Term: "golang"}, fetchOptions{Results: 40})
	if err != nil || len(jobs) != 2 {
		t.Fatalf("jobs=%+v err=%v", jobs, err)
	}
	if j := jobs[0]; j.URL != "https://jobicy.com/jobs/1" || *j.MinAmount != 130000 || j.Interval != "yearly" || j.DatePosted != "2026-10-01" || j.Description != "- Go" || !j.IsRemote {
		t.Fatalf("job = %+v", j)
	}
	if jobs[1].MinAmount != nil {
		t.Fatal("non-USD salaries should be dropped rather than shown as dollars")
	}
}

func TestAdzunaHTMLErrorPage(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`<!DOCTYPE html><html><head><title>Uh oh</title></head></html>`))
	})
	old := adzunaBaseURL
	adzunaBaseURL = url
	t.Cleanup(func() { adzunaBaseURL = old })
	_, err := adzunaSearch(context.Background(), "id", "key", DiscoverQuery{Term: "x"}, fetchOptions{})
	if err == nil || strings.Contains(err.Error(), "<") || !strings.Contains(err.Error(), "temporarily unavailable") {
		t.Fatalf("err = %v", err)
	}
}
