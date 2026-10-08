// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import "time"

type JobSummary struct {
	Job           Job        `json:"job"`
	StageSince    string     `json:"stageSince"`
	DaysInStage   int        `json:"daysInStage"`
	Stale         bool       `json:"stale"`
	FollowUpDue   bool       `json:"followUpDue"`
	NextInterview *Interview `json:"nextInterview,omitempty"`
	// OfferYear1Total is filled in by the app when the job has an offer package.
	OfferYear1Total *int64 `json:"offerYear1Total,omitempty"`
}

type NextUp struct {
	Interview Interview `json:"interview"`
	Company   string    `json:"company"`
	Position  string    `json:"position"`
}

type Metrics struct {
	Active             int      `json:"active"`
	ResponseRate       *float64 `json:"responseRate,omitempty"`
	RespondedCount     int      `json:"respondedCount"`
	AppliedCount       int      `json:"appliedCount"`
	InterviewsThisWeek int      `json:"interviewsThisWeek"`
	FollowUpsDue       int      `json:"followUpsDue"`
	NextUp             *NextUp  `json:"nextUp,omitempty"`
}

func dateOnly(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

// daysBetween counts calendar days (in now's time zone) from a stored timestamp to now.
func daysBetween(fromTS string, now time.Time) int {
	t, err := time.Parse(time.RFC3339, fromTS)
	if err != nil {
		return 0
	}
	hours := dateOnly(now).Sub(dateOnly(t.In(now.Location()))).Hours()
	days := int(hours/24 + 0.5) // rounding absorbs DST's 23/25-hour days
	if days < 0 {
		return 0
	}
	return days
}

// weekStart returns local midnight on the Monday of t's week.
func weekStart(t time.Time) time.Time {
	d := dateOnly(t)
	offset := (int(d.Weekday()) + 6) % 7
	return d.AddDate(0, 0, -offset)
}

func followUpDue(j Job, daysInStage int, today string, thresholdDays int) bool {
	if j.Status == StatusClosed {
		return false
	}
	if j.FollowUpOn != "" && j.FollowUpOn <= today {
		return true
	}
	return j.Status == StatusApplied && daysInStage > thresholdDays
}

func (r *Repo) latestStageTimes() (map[string]string, error) {
	latest, err := queryAll(r.db, scanKeyValue[string], `SELECT job_id, MAX(at) FROM stage_events GROUP BY job_id`)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(latest))
	for _, kv := range latest {
		out[kv.key] = kv.value
	}
	return out, nil
}

// nextInterviews maps each job to its soonest upcoming, not-completed interview.
func (r *Repo) nextInterviews(now time.Time) (map[string]Interview, error) {
	upcoming, err := queryAll(r.db, scanInterview, `SELECT `+interviewColumns+` FROM interviews WHERE completed = 0 AND scheduled_at >= ? ORDER BY scheduled_at`, ts(now))
	if err != nil {
		return nil, err
	}
	out := map[string]Interview{}
	for _, iv := range upcoming {
		if _, seen := out[iv.JobID]; !seen {
			out[iv.JobID] = iv
		}
	}
	return out, nil
}

func (r *Repo) ListJobSummaries(followUpDays int) ([]JobSummary, error) {
	jobs, err := r.ListJobs()
	if err != nil {
		return nil, err
	}
	since, err := r.latestStageTimes()
	if err != nil {
		return nil, err
	}
	now := r.now()
	next, err := r.nextInterviews(now)
	if err != nil {
		return nil, err
	}
	today := now.Format(dateLayout)
	out := make([]JobSummary, 0, len(jobs))
	for _, j := range jobs {
		s := JobSummary{Job: j, StageSince: since[j.ID]}
		if s.StageSince == "" {
			s.StageSince = j.CreatedAt
		}
		s.DaysInStage = daysBetween(s.StageSince, now)
		s.Stale = isActive(j.Status) && s.DaysInStage > followUpDays
		s.FollowUpDue = followUpDue(j, s.DaysInStage, today, followUpDays)
		if iv, ok := next[j.ID]; ok {
			s.NextInterview = &iv
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *Repo) GetMetrics(followUpDays int) (Metrics, error) {
	var m Metrics
	summaries, err := r.ListJobSummaries(followUpDays)
	if err != nil {
		return m, err
	}
	for _, s := range summaries {
		if isActive(s.Job.Status) {
			m.Active++
		}
		if s.FollowUpDue {
			m.FollowUpsDue++
		}
		if s.NextInterview != nil && s.Job.Status != StatusClosed &&
			(m.NextUp == nil || s.NextInterview.ScheduledAt < m.NextUp.Interview.ScheduledAt) {
			m.NextUp = &NextUp{Interview: *s.NextInterview, Company: s.Job.Company, Position: s.Job.Position}
		}
	}

	// Response rate: of jobs that ever reached applied-or-beyond, how many reached interviewing-or-beyond.
	err = r.db.QueryRow(`SELECT
		COUNT(DISTINCT CASE WHEN to_status IN ('applied', 'interviewing', 'offer') THEN job_id END),
		COUNT(DISTINCT CASE WHEN to_status IN ('interviewing', 'offer') THEN job_id END)
		FROM stage_events`).Scan(&m.AppliedCount, &m.RespondedCount)
	if err != nil {
		return m, err
	}
	if m.AppliedCount > 0 {
		rate := float64(m.RespondedCount) / float64(m.AppliedCount)
		m.ResponseRate = &rate
	}

	start := weekStart(r.now())
	err = r.db.QueryRow(`SELECT COUNT(*) FROM interviews i JOIN jobs j ON j.id = i.job_id
		WHERE i.completed = 0 AND j.status != 'closed' AND i.scheduled_at >= ? AND i.scheduled_at < ?`,
		ts(start), ts(start.AddDate(0, 0, 7))).Scan(&m.InterviewsThisWeek)
	return m, err
}
