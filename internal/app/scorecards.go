// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
)

// Everything kept from a mock interview for later review besides the transcript
// and recording: one scorecard per grading provider, and every coaching tip.

// ScorecardResult is one provider's scorecard for an interview.
type ScorecardResult struct {
	Provider  string    `json:"provider"` // an aiProvider id
	Model     string    `json:"model"`    // the exact model used; "" if not reported
	Scorecard Scorecard `json:"scorecard"`
	CreatedAt string    `json:"createdAt"`
}

// InterviewTip is a coaching tip given during the interview.
type InterviewTip struct {
	AnswerAtMs int64  `json:"answerAtMs"` // when the answer it is about started; ties it to the transcript
	Kind       string `json:"kind"`       // tip | good
	Text       string `json:"text"`
	Provider   string `json:"provider"`
	Model      string `json:"model"`
}

// saveScorecard stores a provider's scorecard; re-grading with the same provider replaces it.
func (r *Repo) saveScorecard(id, provider, model string, c Scorecard) error {
	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`INSERT INTO scorecards (id, mock_interview_id, provider, model, scorecard, created_at) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(mock_interview_id, provider) DO UPDATE SET model = excluded.model, scorecard = excluded.scorecard, created_at = excluded.created_at`,
		newID(), id, provider, model, string(raw), ts(r.now()))
	return err
}

// DeleteScorecard removes one provider's scorecard. When it was the last one,
// the interview goes back to "not scored".
func (r *Repo) DeleteScorecard(id, provider string) error {
	res, err := r.db.Exec(`DELETE FROM scorecards WHERE mock_interview_id = ? AND provider = ?`, id, provider)
	if err := expectOneRow(res, err, "scorecard", id+"/"+provider); err != nil {
		return err
	}
	_, err = r.db.Exec(`UPDATE mock_interviews SET status = ?
		WHERE id = ? AND NOT EXISTS (SELECT 1 FROM scorecards WHERE mock_interview_id = ?)`, MockUnscored, id, id)
	return err
}

func (r *Repo) saveTip(id string, t InterviewTip) error {
	_, err := r.db.Exec(`INSERT INTO interview_tips (id, mock_interview_id, answer_at_ms, kind, text, provider, model, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, newID(), id, t.AnswerAtMs, t.Kind, t.Text, t.Provider, t.Model, ts(r.now()))
	return err
}

// DeleteInterviewRecording removes the audio file (fine if it's already gone)
// and keeps the transcript, tips and scorecards.
func (r *Repo) DeleteInterviewRecording(id string) error {
	path, err := r.recordingPath(id)
	if err != nil {
		return err
	}
	if path != "" {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return r.SetInterviewRecording(id, "")
}

// recordingData returns the interview's audio, or nil when it has none. A file
// deleted outside the app counts as none, and the stale path is cleared so the
// review page and Interviews list stop offering it.
func (r *Repo) recordingData(id string) ([]byte, error) {
	path, err := r.recordingPath(id)
	if err != nil || path == "" {
		return nil, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, r.SetInterviewRecording(id, "")
	}
	return raw, err
}

// loadReviewData fills in an interview's scorecards (newest first; the newest
// is also Scorecard) and tips (in answer order).
func (r *Repo) loadReviewData(m *MockInterview) error {
	cards, err := queryAll(r.db, scanScorecardResult, `SELECT provider, model, scorecard, created_at FROM scorecards
		WHERE mock_interview_id = ? ORDER BY created_at DESC, rowid DESC`, m.ID)
	if err != nil {
		return fmt.Errorf("mock interview %s: %w", m.ID, err)
	}
	m.Scorecards = cards
	m.Scorecard = nil
	if len(cards) > 0 {
		m.Scorecard = &cards[0].Scorecard
	}
	m.Tips, err = queryAll(r.db, scanTip, `SELECT answer_at_ms, kind, text, provider, model FROM interview_tips
		WHERE mock_interview_id = ? ORDER BY answer_at_ms, rowid`, m.ID)
	return err
}

func scanScorecardResult(s rowScanner) (ScorecardResult, error) {
	var c ScorecardResult
	var raw string
	if err := s.Scan(&c.Provider, &c.Model, &raw, &c.CreatedAt); err != nil {
		return c, err
	}
	if err := json.Unmarshal([]byte(raw), &c.Scorecard); err != nil {
		return c, fmt.Errorf("unreadable %s scorecard: %w", c.Provider, err)
	}
	return c, nil
}

func scanTip(s rowScanner) (InterviewTip, error) {
	var t InterviewTip
	err := s.Scan(&t.AnswerAtMs, &t.Kind, &t.Text, &t.Provider, &t.Model)
	return t, err
}

// MockInterviewSummary is one row of the Interviews page: no transcript, tips
// or scorecard bodies, so the list stays fast.
type MockInterviewSummary struct {
	ID              string    `json:"id"`
	JobID           string    `json:"jobId"`
	Company         string    `json:"company"`
	Position        string    `json:"position"`
	Kind            string    `json:"kind"`
	Minutes         int       `json:"minutes"`
	Persona         string    `json:"persona"`
	InterviewerName string    `json:"interviewerName"`
	Status          string    `json:"status"`
	StartedAt       string    `json:"startedAt"`
	LatestOverall   *ScoreSet `json:"latestOverall,omitempty"`
	Graders         []string  `json:"graders"` // providers with a scorecard, sorted
	HasRecording    bool      `json:"hasRecording"`
	HasTips         bool      `json:"hasTips"`
	HasPlan         bool      `json:"hasPlan"`
	Attempt         int       `json:"attempt"` // 1-based attempt at its plan; 0 without a plan
	planID          string
}

func (r *Repo) ListAllMockInterviews() ([]MockInterviewSummary, error) {
	list, err := queryAll(r.db, scanMockSummary, `SELECT m.id, m.job_id, j.company, j.position, m.kind, m.minutes, m.persona,
		m.interviewer_name, m.status, m.started_at, m.recording_path != '',
		EXISTS (SELECT 1 FROM interview_tips t WHERE t.mock_interview_id = m.id), m.plan_id
		FROM mock_interviews m JOIN jobs j ON j.id = m.job_id ORDER BY m.started_at DESC, m.rowid DESC`)
	if err != nil {
		return nil, err
	}
	cards, err := queryAll(r.db, scanSummaryCard, `SELECT mock_interview_id, provider, scorecard FROM scorecards ORDER BY created_at DESC, rowid DESC`)
	if err != nil {
		return nil, err
	}
	index := map[string]int{}
	for i := range list {
		index[list[i].ID] = i
	}
	for _, c := range cards {
		i, ok := index[c.interviewID]
		if !ok {
			continue
		}
		if list[i].LatestOverall == nil {
			overall := c.card.Overall
			list[i].LatestOverall = &overall
		}
		list[i].Graders = append(list[i].Graders, c.provider)
	}
	for i := range list {
		slices.Sort(list[i].Graders)
	}
	numberAttempts(list)
	return list, nil
}

func scanMockSummary(s rowScanner) (MockInterviewSummary, error) {
	m := MockInterviewSummary{Graders: []string{}}
	if err := s.Scan(&m.ID, &m.JobID, &m.Company, &m.Position, &m.Kind, &m.Minutes, &m.Persona,
		&m.InterviewerName, &m.Status, &m.StartedAt, &m.HasRecording, &m.HasTips, &m.planID); err != nil {
		return m, err
	}
	m.HasPlan = m.planID != ""
	return m, nil
}

// numberAttempts sets each planned interview's attempt number. list is newest
// first, so attempts are counted from the end.
func numberAttempts(list []MockInterviewSummary) {
	seen := map[string]int{}
	for i := len(list) - 1; i >= 0; i-- {
		if id := list[i].planID; id != "" {
			seen[id]++
			list[i].Attempt = seen[id]
		}
	}
}

type summaryCard struct {
	interviewID, provider string
	card                  Scorecard
}

func scanSummaryCard(s rowScanner) (summaryCard, error) {
	var c summaryCard
	var raw string
	if err := s.Scan(&c.interviewID, &c.provider, &raw); err != nil {
		return c, err
	}
	return c, json.Unmarshal([]byte(raw), &c.card)
}
