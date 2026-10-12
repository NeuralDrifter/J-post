// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"encoding/json"
	"errors"
)

// AIGeneration is one AI run on a document: what the model suggested (its
// typed edits, as JSON) and which of them the user has accepted or rejected.
// The builder turns the edits into changes against the document as it is
// now, so a generation never goes stale in storage; only its changes do.
type AIGeneration struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	Task       string `json:"task"`
	SectionKey string `json:"sectionKey"` // the section asked about; "" = the whole document
	JobID      string `json:"jobId"`
	Posting    string `json:"posting"` // the posting the run read, so a regenerate reads the same one
	Context    string `json:"context"` // the builder's own notes on the run (what each id named); never sent
	Provider   string `json:"provider"`
	Model      string `json:"model"`
	Edits      string `json:"edits"`     // {"edits": [...]}
	Decisions  string `json:"decisions"` // {"<change key>": "accepted" | "rejected"}
	CreatedAt  string `json:"createdAt"`
}

const generationColumns = `id, document_id, task, section_key, job_id, posting, context, provider, model, edits, decisions, created_at`

func scanGeneration(row rowScanner) (AIGeneration, error) {
	var g AIGeneration
	err := row.Scan(&g.ID, &g.DocumentID, &g.Task, &g.SectionKey, &g.JobID, &g.Posting, &g.Context, &g.Provider, &g.Model, &g.Edits, &g.Decisions, &g.CreatedAt)
	return g, err
}

func (r *Repo) insertAIGeneration(g AIGeneration) error {
	_, err := r.db.Exec(`INSERT INTO ai_generations (`+generationColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		g.ID, g.DocumentID, g.Task, g.SectionKey, g.JobID, g.Posting, g.Context, g.Provider, g.Model, g.Edits, g.Decisions, g.CreatedAt)
	return err
}

// ListAIGenerations lists a document's AI runs, oldest first.
func (r *Repo) ListAIGenerations(documentID string) ([]AIGeneration, error) {
	return queryAll(r.db, scanGeneration, `SELECT `+generationColumns+` FROM ai_generations WHERE document_id = ? ORDER BY created_at, rowid`, documentID)
}

// SetAIGenerationDecisions records which of a run's changes were accepted or rejected.
func (r *Repo) SetAIGenerationDecisions(id, decisions string) error {
	var parsed map[string]string
	if err := json.Unmarshal([]byte(decisions), &parsed); err != nil || parsed == nil {
		return errors.New("decisions must be a JSON object")
	}
	res, err := r.db.Exec(`UPDATE ai_generations SET decisions = ? WHERE id = ?`, decisions, id)
	return expectOneRow(res, err, "AI generation", id)
}
