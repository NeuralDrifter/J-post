package main

import (
	"math"
	"testing"
	"time"
)

func TestDaysBetween(t *testing.T) {
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.Local)
	cases := map[string]int{
		ts(time.Date(2026, 10, 1, 23, 0, 0, 0, time.Local)):  0,
		ts(time.Date(2026, 9, 30, 23, 59, 0, 0, time.Local)): 1,
		ts(time.Date(2026, 9, 1, 12, 0, 0, 0, time.Local)):   30,
		"garbage": 0,
	}
	for in, want := range cases {
		if got := daysBetween(in, now); got != want {
			t.Errorf("daysBetween(%s) = %d, want %d", in, got, want)
		}
	}
}

func TestWeekStart(t *testing.T) {
	monday := time.Date(2026, 9, 28, 0, 0, 0, 0, time.Local)
	for _, d := range []time.Time{
		time.Date(2026, 9, 28, 8, 0, 0, 0, time.Local),  // Monday
		time.Date(2026, 10, 1, 12, 0, 0, 0, time.Local), // Thursday
		time.Date(2026, 10, 4, 23, 0, 0, 0, time.Local), // Sunday
	} {
		if got := weekStart(d); !got.Equal(monday) {
			t.Errorf("weekStart(%v) = %v", d, got)
		}
	}
}

func TestFollowUpDueRules(t *testing.T) {
	today := "2026-10-01"
	cases := []struct {
		name string
		job  Job
		days int
		want bool
	}{
		{"applied and stale", Job{Status: StatusApplied}, 8, true},
		{"applied exactly at threshold", Job{Status: StatusApplied}, 7, false},
		{"interviewing and old", Job{Status: StatusInterviewing}, 30, false},
		{"follow-up date reached", Job{Status: StatusInterested, FollowUpOn: "2026-10-01"}, 0, true},
		{"follow-up date in future", Job{Status: StatusOffer, FollowUpOn: "2026-10-02"}, 0, false},
		{"closed never due", Job{Status: StatusClosed, FollowUpOn: "2026-09-01"}, 40, false},
	}
	for _, c := range cases {
		if got := followUpDue(c.job, c.days, today, 7); got != c.want {
			t.Errorf("%s: got %v", c.name, got)
		}
	}
}

func TestGetMetricsEmpty(t *testing.T) {
	r := newTestRepo(t)
	m, err := r.GetMetrics(7)
	if err != nil {
		t.Fatal(err)
	}
	if m.ResponseRate != nil || m.Active != 0 || m.NextUp != nil {
		t.Fatalf("m = %+v", m)
	}
}

// seedPipeline builds: A applied→interviewing, B applied→closed(ghosted),
// C interested, D applied and untouched for 30 days, and an interview for A tomorrow.
func seedPipeline(t *testing.T, r *Repo) (a, b, c, d Job) {
	setNow(r, 2026, time.September, 1, 12)
	a = mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusApplied})
	b = mustCreate(t, r, Job{Company: "Brex", Position: "Dev", Status: StatusApplied})
	c = mustCreate(t, r, Job{Company: "Cora", Position: "Dev"})
	d = mustCreate(t, r, Job{Company: "Dune", Position: "Dev", Status: StatusApplied})
	setNow(r, 2026, time.September, 20, 12)
	if _, err := r.ChangeStatus(a.ID, StatusInterviewing, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := r.ChangeStatus(b.ID, StatusClosed, "ghosted", ""); err != nil {
		t.Fatal(err)
	}
	setNow(r, 2026, time.October, 1, 12)
	tomorrow := time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local).Format(time.RFC3339)
	if _, err := r.SaveInterview(Interview{JobID: a.ID, Kind: "technical", ScheduledAt: tomorrow, DurationMin: 60}); err != nil {
		t.Fatal(err)
	}
	return a, b, c, d
}

func TestGetMetrics(t *testing.T) {
	r := newTestRepo(t)
	seedPipeline(t, r)
	m, err := r.GetMetrics(7)
	if err != nil {
		t.Fatal(err)
	}
	if m.Active != 2 || m.AppliedCount != 3 || m.RespondedCount != 1 {
		t.Fatalf("m = %+v", m)
	}
	if m.ResponseRate == nil || math.Abs(*m.ResponseRate-1.0/3.0) > 1e-9 {
		t.Fatalf("rate = %v", m.ResponseRate)
	}
	if m.InterviewsThisWeek != 1 || m.FollowUpsDue != 1 {
		t.Fatalf("interviews=%d followUps=%d", m.InterviewsThisWeek, m.FollowUpsDue)
	}
	if m.NextUp == nil || m.NextUp.Company != "Acme" {
		t.Fatalf("nextUp = %+v", m.NextUp)
	}
}

func TestListJobSummaries(t *testing.T) {
	r := newTestRepo(t)
	a, _, c, d := seedPipeline(t, r)
	list, err := r.ListJobSummaries(7)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]JobSummary{}
	for _, s := range list {
		byID[s.Job.ID] = s
	}
	if s := byID[d.ID]; s.DaysInStage != 30 || !s.Stale || !s.FollowUpDue {
		t.Errorf("D = %+v", s)
	}
	if s := byID[a.ID]; s.DaysInStage != 11 || s.NextInterview == nil || s.FollowUpDue {
		t.Errorf("A = %+v", s)
	}
	if s := byID[c.ID]; s.Stale || s.FollowUpDue {
		t.Errorf("interested job C should not be stale or due: %+v", s)
	}
}
