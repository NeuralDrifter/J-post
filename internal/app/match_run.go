// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
)

// MatchRun is the outcome of one scoring run. Error explains why it didn't
// start or where it stopped, in words for the status line.
type MatchRun struct {
	Scored int    `json:"scored"`
	Failed int    `json:"failed"`
	Total  int    `json:"total"`
	Error  string `json:"error"`
}

// matchCandidates returns the inbox and Interested postings that want picks, newest first.
func (r *Repo) matchCandidates(want func(Posting) bool) ([]Posting, error) {
	var out []Posting
	for _, tab := range []string{"inbox", "saved"} {
		postings, err := r.ListPostings(PostingFilter{Tab: tab})
		if err != nil {
			return nil, err
		}
		for _, p := range postings {
			if want(p) {
				out = append(out, p)
			}
		}
	}
	slices.SortStableFunc(out, func(a, b Posting) int { return strings.Compare(b.FirstSeen, a.FirstSeen) })
	return out, nil
}

// runMatch scores postings with s.MatchProvider, s.MatchPerRequest per request,
// one request after another, calling progress after each. It stops at the first
// failed request: a bad key or a rate limit then costs one request, not one per
// group. Problems the user can fix go in MatchRun.Error; the returned error is
// for database failures.
func runMatch(ctx context.Context, r *Repo, s settings.Settings, resume string, postings []Posting, progress func(done, total int)) (MatchRun, error) {
	settings.ApplyDefaults(&s)
	run := MatchRun{Total: len(postings)}
	if len(postings) == 0 {
		return run, nil
	}
	if strings.TrimSpace(resume) == "" {
		run.Error = "Add your resume on the Profile page to get match scores"
		return run, nil
	}
	if reason := providerUnavailable(s, s.MatchProvider); reason != "" {
		run.Error = "Job matching: " + reason
		return run, nil
	}
	fingerprint := matchFingerprint(resume, s)
	done := 0
	for group := range slices.Chunk(postings, s.MatchPerRequest) {
		var ans matchAnswer
		model, err := ai.RunTask(ctx, s, s.MatchProvider, matchTask(resume, s, group), &ans)
		if err != nil {
			run.Failed += len(group)
			run.Error = "Scoring stopped: " + err.Error()
			return run, nil
		}
		scores := matchScores(group, ans)
		for _, p := range group {
			m, ok := scores[p.ID]
			if !ok {
				run.Failed++
				continue
			}
			m.Provider, m.Model = s.MatchProvider, model
			if err := r.saveMatchScore(p.ID, m, fingerprint); err != nil {
				return run, err
			}
			run.Scored++
		}
		done += len(group)
		progress(done, len(postings))
	}
	return run, nil
}

// providerUnavailable is the provider's own setup reason, "" when it's ready.
func providerUnavailable(s settings.Settings, id string) string {
	for _, p := range ai.ListAIProviders(s) {
		if p.ID == id {
			return p.Unavailable
		}
	}
	return fmt.Sprintf("unknown AI provider %q", id)
}
