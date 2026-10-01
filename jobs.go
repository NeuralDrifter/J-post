package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	StatusInterested   = "interested"
	StatusApplied      = "applied"
	StatusInterviewing = "interviewing"
	StatusOffer        = "offer"
	StatusClosed       = "closed"
)

var validStatuses = map[string]bool{
	StatusInterested: true, StatusApplied: true, StatusInterviewing: true, StatusOffer: true, StatusClosed: true,
}

var validCloseReasons = map[string]bool{"rejected": true, "withdrawn": true, "ghosted": true, "declined": true}

var validWorkModes = map[string]bool{"": true, "remote": true, "hybrid": true, "onsite": true}

type Job struct {
	ID          string `json:"id"`
	Company     string `json:"company"`
	Position    string `json:"position"`
	Status      string `json:"status"`
	CloseReason string `json:"closeReason"`
	Location    string `json:"location"`
	WorkMode    string `json:"workMode"`
	SalaryMin   *int64 `json:"salaryMin,omitempty"`
	SalaryMax   *int64 `json:"salaryMax,omitempty"`
	SalaryText  string `json:"salaryText"`
	URL         string `json:"url"`
	Source      string `json:"source"`
	Description string `json:"description"`
	DatePosted  string `json:"datePosted"`
	DateApplied string `json:"dateApplied"`
	FollowUpOn  string `json:"followUpOn"`
	Notes       string `json:"notes"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type StageEvent struct {
	ID          string `json:"id"`
	JobID       string `json:"jobId"`
	FromStatus  string `json:"fromStatus"`
	ToStatus    string `json:"toStatus"`
	CloseReason string `json:"closeReason"`
	At          string `json:"at"`
	Note        string `json:"note"`
}

const jobColumns = `id, company, position, status, close_reason, location, work_mode, salary_min, salary_max, salary_text, url, source, description, date_posted, date_applied, follow_up_on, notes, created_at, updated_at`

func scanJob(s rowScanner) (Job, error) {
	var j Job
	var lo, hi sql.NullInt64
	err := s.Scan(&j.ID, &j.Company, &j.Position, &j.Status, &j.CloseReason, &j.Location, &j.WorkMode,
		&lo, &hi, &j.SalaryText, &j.URL, &j.Source, &j.Description, &j.DatePosted, &j.DateApplied,
		&j.FollowUpOn, &j.Notes, &j.CreatedAt, &j.UpdatedAt)
	if err != nil {
		return j, err
	}
	if lo.Valid {
		v := lo.Int64
		j.SalaryMin = &v
	}
	if hi.Valid {
		v := hi.Int64
		j.SalaryMax = &v
	}
	return j, nil
}

// isActive reports whether a job is in flight (applied but not yet closed).
func isActive(status string) bool {
	return status == StatusApplied || status == StatusInterviewing || status == StatusOffer
}

func validateJobFields(j *Job) error {
	j.Company = strings.TrimSpace(j.Company)
	j.Position = strings.TrimSpace(j.Position)
	if j.Company == "" {
		return errors.New("company is required")
	}
	if j.Position == "" {
		return errors.New("position is required")
	}
	if !validWorkModes[j.WorkMode] {
		return fmt.Errorf("invalid work mode %q", j.WorkMode)
	}
	if j.SalaryMin != nil && j.SalaryMax != nil && *j.SalaryMin > *j.SalaryMax {
		return errors.New("minimum salary is greater than maximum")
	}
	for _, d := range []string{j.DateApplied, j.FollowUpOn} {
		if d == "" {
			continue
		}
		if _, err := time.Parse(dateLayout, d); err != nil {
			return fmt.Errorf("invalid date %q (want YYYY-MM-DD)", d)
		}
	}
	if j.Source == "" {
		j.Source = "manual"
	}
	return nil
}

func validateStatus(status, reason string) error {
	if !validStatuses[status] {
		return fmt.Errorf("invalid status %q", status)
	}
	if status == StatusClosed && !validCloseReasons[reason] {
		return errors.New("closing a job needs a reason: rejected, withdrawn, ghosted or declined")
	}
	if status != StatusClosed && reason != "" {
		return errors.New("a close reason is only allowed for closed jobs")
	}
	return nil
}

func (r *Repo) today() string { return r.now().Format(dateLayout) }

func insertStageEvent(ex execer, jobID, from, to, reason, at, note string) error {
	var fromVal any
	if from != "" {
		fromVal = from
	}
	_, err := ex.Exec(`INSERT INTO stage_events (id, job_id, from_status, to_status, close_reason, at, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		newID(), jobID, fromVal, to, reason, at, note)
	return err
}

func (r *Repo) CreateJob(j Job) (Job, error) {
	if j.Status == "" {
		j.Status = StatusInterested
	}
	if err := validateJobFields(&j); err != nil {
		return Job{}, err
	}
	if err := validateStatus(j.Status, j.CloseReason); err != nil {
		return Job{}, err
	}
	if isActive(j.Status) && j.DateApplied == "" {
		j.DateApplied = r.today()
	}
	now := ts(r.now())
	j.ID, j.CreatedAt, j.UpdatedAt = newID(), now, now

	tx, err := r.db.Begin()
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback()
	_, err = tx.Exec(`INSERT INTO jobs (`+jobColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		j.ID, j.Company, j.Position, j.Status, j.CloseReason, j.Location, j.WorkMode,
		nullInt(j.SalaryMin), nullInt(j.SalaryMax), j.SalaryText, j.URL, j.Source, j.Description,
		j.DatePosted, j.DateApplied, j.FollowUpOn, j.Notes, j.CreatedAt, j.UpdatedAt)
	if err != nil {
		return Job{}, err
	}
	if err := insertStageEvent(tx, j.ID, "", j.Status, j.CloseReason, now, ""); err != nil {
		return Job{}, err
	}
	return j, tx.Commit()
}

func getJob(q querier, id string) (Job, error) {
	j, err := scanJob(q.QueryRow(`SELECT `+jobColumns+` FROM jobs WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Job{}, fmt.Errorf("job %s: %w", id, ErrNotFound)
	}
	return j, err
}

func (r *Repo) GetJob(id string) (Job, error) { return getJob(r.db, id) }

func (r *Repo) ListJobs() ([]Job, error) {
	rows, err := r.db.Query(`SELECT ` + jobColumns + ` FROM jobs ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

// UpdateJob saves the editable fields. Status changes go through ChangeStatus
// and notes through UpdateJobNotes, so neither can be overwritten here.
func (r *Repo) UpdateJob(j Job) (Job, error) {
	existing, err := r.GetJob(j.ID)
	if err != nil {
		return Job{}, err
	}
	if err := validateJobFields(&j); err != nil {
		return Job{}, err
	}
	j.Status, j.CloseReason, j.Notes, j.CreatedAt = existing.Status, existing.CloseReason, existing.Notes, existing.CreatedAt
	j.UpdatedAt = ts(r.now())
	_, err = r.db.Exec(`UPDATE jobs SET company = ?, position = ?, location = ?, work_mode = ?, salary_min = ?, salary_max = ?,
		salary_text = ?, url = ?, source = ?, description = ?, date_posted = ?, date_applied = ?, follow_up_on = ?, updated_at = ?
		WHERE id = ?`,
		j.Company, j.Position, j.Location, j.WorkMode, nullInt(j.SalaryMin), nullInt(j.SalaryMax),
		j.SalaryText, j.URL, j.Source, j.Description, j.DatePosted, j.DateApplied, j.FollowUpOn, j.UpdatedAt, j.ID)
	return j, err
}

func (r *Repo) UpdateJobNotes(id, notes string) error {
	res, err := r.db.Exec(`UPDATE jobs SET notes = ?, updated_at = ? WHERE id = ?`, notes, ts(r.now()), id)
	return expectOneRow(res, err, "job", id)
}

func (r *Repo) ChangeStatus(id, status, reason, note string) (Job, error) {
	if err := validateStatus(status, reason); err != nil {
		return Job{}, err
	}
	tx, err := r.db.Begin()
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback()
	j, err := getJob(tx, id)
	if err != nil {
		return Job{}, err
	}
	if j.Status == status && j.CloseReason == reason {
		return j, nil
	}
	from := j.Status
	j.Status, j.CloseReason = status, reason
	if isActive(status) && j.DateApplied == "" {
		j.DateApplied = r.today()
	}
	now := ts(r.now())
	j.UpdatedAt = now
	if _, err := tx.Exec(`UPDATE jobs SET status = ?, close_reason = ?, date_applied = ?, updated_at = ? WHERE id = ?`,
		j.Status, j.CloseReason, j.DateApplied, now, id); err != nil {
		return Job{}, err
	}
	if err := insertStageEvent(tx, id, from, status, reason, now, strings.TrimSpace(note)); err != nil {
		return Job{}, err
	}
	return j, tx.Commit()
}

func (r *Repo) DeleteJob(id string) error {
	res, err := r.db.Exec(`DELETE FROM jobs WHERE id = ?`, id)
	if err := expectOneRow(res, err, "job", id); err != nil {
		return err
	}
	// The id came from a real row, so it is a hex string, not a path.
	return os.RemoveAll(filepath.Join(r.filesDir, id))
}

func (r *Repo) ListStageEvents(jobID string) ([]StageEvent, error) {
	rows, err := r.db.Query(`SELECT id, job_id, from_status, to_status, close_reason, at, note
		FROM stage_events WHERE job_id = ? ORDER BY at, rowid`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StageEvent{}
	for rows.Next() {
		var e StageEvent
		var from sql.NullString
		if err := rows.Scan(&e.ID, &e.JobID, &from, &e.ToStatus, &e.CloseReason, &e.At, &e.Note); err != nil {
			return nil, err
		}
		e.FromStatus = from.String
		out = append(out, e)
	}
	return out, rows.Err()
}
