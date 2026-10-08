// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Storage for question plans. An interview points at its plan with plan_id;
// the interviews sharing a plan are its attempts, oldest first.

// InterviewPlanRecord is a stored plan and who wrote it.
type InterviewPlanRecord struct {
	ID        string        `json:"id"`
	Provider  string        `json:"provider"`
	Model     string        `json:"model"`
	CreatedAt string        `json:"createdAt"`
	Plan      InterviewPlan `json:"plan"`
}

// AttemptSummary is one attempt at a plan, for the attempts strip.
type AttemptSummary struct {
	ID        string    `json:"id"`
	StartedAt string    `json:"startedAt"`
	Overall   *ScoreSet `json:"overall,omitempty"` // from the newest scorecard; nil when not scored
}

func (r *Repo) savePlan(jobID string, s InterviewSetup, provider, model string, p InterviewPlan) (string, error) {
	raw, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	id := newID()
	_, err = r.db.Exec(`INSERT INTO interview_plans (id, job_id, kind, minutes, provider, model, plan, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, jobID, s.Kind, s.Minutes, provider, model, string(raw), ts(r.now()))
	return id, err
}

// planFor returns the plan of an interview; ErrNotFound when it has none.
func (r *Repo) planFor(interviewID string) (InterviewPlanRecord, error) {
	var rec InterviewPlanRecord
	var raw string
	err := r.db.QueryRow(`SELECT p.id, p.provider, p.model, p.created_at, p.plan FROM interview_plans p
		JOIN mock_interviews m ON m.plan_id = p.id WHERE m.id = ?`, interviewID).Scan(&rec.ID, &rec.Provider, &rec.Model, &rec.CreatedAt, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return rec, fmt.Errorf("question plan for mock interview %s: %w", interviewID, ErrNotFound)
	}
	if err != nil {
		return rec, err
	}
	if err := json.Unmarshal([]byte(raw), &rec.Plan); err != nil {
		return rec, fmt.Errorf("unreadable question plan: %w", err)
	}
	return rec, nil
}

// loadPlanData fills in an interview's plan and attempts. A plan that can't be
// read is reported in PlanError rather than failing the whole interview.
func (r *Repo) loadPlanData(m *MockInterview) error {
	m.Plan, m.PlanError, m.Attempt, m.Attempts = nil, "", 0, []AttemptSummary{}
	if m.PlanID == "" {
		return nil
	}
	rec, err := r.planFor(m.ID)
	switch {
	case errors.Is(err, ErrNotFound):
		return nil
	case err != nil && rec.ID == "":
		return err
	case err != nil:
		m.PlanError = err.Error()
	default:
		m.Plan = &rec
	}
	attempts, err := queryAll(r.db, scanAttempt, `SELECT m.id, m.started_at,
		(SELECT s.scorecard FROM scorecards s WHERE s.mock_interview_id = m.id ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1)
		FROM mock_interviews m WHERE m.plan_id = ? ORDER BY m.started_at, m.rowid`, m.PlanID)
	if err != nil {
		return fmt.Errorf("mock interview %s: %w", m.ID, err)
	}
	m.Attempts = attempts
	for i, a := range attempts {
		if a.ID == m.ID {
			m.Attempt = i + 1
		}
	}
	return nil
}

func scanAttempt(s rowScanner) (AttemptSummary, error) {
	var a AttemptSummary
	var card sql.NullString
	if err := s.Scan(&a.ID, &a.StartedAt, &card); err != nil {
		return a, err
	}
	if card.Valid {
		var c Scorecard
		// An unreadable card just leaves this attempt without scores.
		if json.Unmarshal([]byte(card.String), &c) == nil {
			a.Overall = &c.Overall
		}
	}
	return a, nil
}

// ListPlanAttempts returns every attempt at id's plan, oldest first, with their
// scorecards; just the interview itself when it has no plan.
func (r *Repo) ListPlanAttempts(id string) ([]MockInterview, error) {
	m, err := r.GetMockInterview(id)
	if err != nil {
		return nil, err
	}
	if m.PlanID == "" {
		return []MockInterview{m}, nil
	}
	list, err := queryAll(r.db, scanMock, `SELECT `+mockColumns+` FROM mock_interviews m JOIN jobs j ON j.id = m.job_id
		WHERE m.plan_id = ? ORDER BY m.started_at, m.rowid`, m.PlanID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if err := r.loadReviewData(&list[i]); err != nil {
			return nil, err
		}
		if err := r.loadPlanData(&list[i]); err != nil {
			return nil, err
		}
	}
	return list, nil
}

// deleteMockAndOrphanPlan deletes an interview, and its plan when no other
// attempt uses it.
func (r *Repo) deleteMockAndOrphanPlan(id string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var planID string
	err = tx.QueryRow(`SELECT plan_id FROM mock_interviews WHERE id = ?`, id).Scan(&planID)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("mock interview %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return err
	}
	res, err := tx.Exec(`DELETE FROM mock_interviews WHERE id = ?`, id)
	if err := expectOneRow(res, err, "mock interview", id); err != nil {
		return err
	}
	if planID != "" {
		if _, err := tx.Exec(`DELETE FROM interview_plans WHERE id = ? AND NOT EXISTS (SELECT 1 FROM mock_interviews WHERE plan_id = ?)`, planID, planID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// createPlannedInterview stores a new plan (one without an ID) and the
// interview that uses it; a reused plan is just linked.
func (r *Repo) createPlannedInterview(jobID string, s InterviewSetup, plan *InterviewPlanRecord) (MockInterview, error) {
	planID := ""
	if plan != nil {
		planID = plan.ID
	}
	if plan != nil && planID == "" {
		id, err := r.savePlan(jobID, s, plan.Provider, plan.Model, plan.Plan)
		if err != nil {
			return MockInterview{}, err
		}
		planID = id
		mi, err := r.CreateMockInterview(jobID, s, planID)
		if err != nil {
			_, delErr := r.db.Exec(`DELETE FROM interview_plans WHERE id = ?`, planID)
			return MockInterview{}, errors.Join(err, delErr)
		}
		return mi, nil
	}
	return r.CreateMockInterview(jobID, s, planID)
}

// keptPlanTTL is how long a plan written for a start that then failed (e.g. the
// Live token was refused) is kept for Try again.
const keptPlanTTL = 30 * time.Minute

// keptPlans holds plans that were written but never used because the start
// failed afterwards, so Try again doesn't wait for (and pay for) a new one.
// Each is used at most once and only for an identical setup.
type keptPlans struct {
	mu    sync.Mutex
	plans map[string]keptPlan
}

type keptPlan struct {
	plan  *InterviewPlanRecord
	until time.Time
}

func keptPlanKey(jobID, provider string, s InterviewSetup) string {
	return strings.Join([]string{jobID, provider, s.Kind, strconv.Itoa(s.Minutes), s.Persona, s.Focus}, "\x00")
}

func (k *keptPlans) keep(key string, p *InterviewPlanRecord, now time.Time) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.plans == nil {
		k.plans = map[string]keptPlan{}
	}
	k.plans[key] = keptPlan{plan: p, until: now.Add(keptPlanTTL)}
}

// take returns and forgets the plan kept for key, or nil when there is none or it expired.
func (k *keptPlans) take(key string, now time.Time) *InterviewPlanRecord {
	k.mu.Lock()
	defer k.mu.Unlock()
	kp, ok := k.plans[key]
	delete(k.plans, key)
	if !ok || now.After(kp.until) {
		return nil
	}
	return kp.plan
}
