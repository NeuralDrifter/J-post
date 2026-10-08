// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"encoding/json"
)

// saveMatchScore stores (or replaces) a posting's score. A posting deleted
// while it was being scored is skipped, not an error.
func (r *Repo) saveMatchScore(postingID string, m MatchScore, fingerprint string) error {
	factors, _ := json.Marshal(m.Factors)
	strengths, _ := json.Marshal(m.Strengths)
	gaps, _ := json.Marshal(m.Gaps)
	_, err := r.db.Exec(`INSERT OR REPLACE INTO posting_scores (posting_id, overall, factors, strengths, gaps, fingerprint, provider, model, scored_at)
		SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM postings WHERE id = ?`,
		m.Overall, string(factors), string(strengths), string(gaps), fingerprint, m.Provider, m.Model, ts(r.now()), postingID)
	return err
}

// matchColumns are appended to postingColumns; scanMatch reads them back.
const matchColumns = `, ms.overall, ms.factors, ms.strengths, ms.gaps, ms.fingerprint, ms.provider, ms.model, ms.scored_at`

// matchCells receives matchColumns from a row.
type matchCells struct {
	overall                                                        sql.NullInt64
	factors, strengths, gaps, fingerprint, provider, model, scored sql.NullString
}

func (c *matchCells) dests() []any {
	return []any{&c.overall, &c.factors, &c.strengths, &c.gaps, &c.fingerprint, &c.provider, &c.model, &c.scored}
}

// score is nil for an unscored posting.
func (c *matchCells) score() *MatchScore {
	if !c.overall.Valid {
		return nil
	}
	m := &MatchScore{Overall: int(c.overall.Int64), Provider: c.provider.String, Model: c.model.String, ScoredAt: c.scored.String, fingerprint: c.fingerprint.String}
	json.Unmarshal([]byte(c.factors.String), &m.Factors)
	json.Unmarshal([]byte(c.strengths.String), &m.Strengths)
	json.Unmarshal([]byte(c.gaps.String), &m.Gaps)
	return m
}

// markOutdated flags scores graded against another resume or preferences.
func markOutdated(postings []Posting, fingerprint string) {
	for i := range postings {
		if m := postings[i].Match; m != nil {
			m.Outdated = m.fingerprint != fingerprint
		}
	}
}
