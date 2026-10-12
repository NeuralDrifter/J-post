// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"

	"jobtrack/internal/settings"
)

// Bindings for Discover's match scores (see match.go). Each score remembers the
// resume it was graded against, and is outdated only when that resume or the
// preferences changed.

// ListPostings returns a tab's postings, with each match score flagged if its
// resume or the preferences changed since it was graded.
func (a *App) ListPostings(f PostingFilter) ([]Posting, error) {
	postings, err := a.repo.ListPostings(f)
	if err != nil {
		return nil, err
	}
	s, err := a.settings.Load()
	if err != nil {
		return nil, err
	}
	fingerprints, err := a.matchFingerprints(s, scoredResumeIDs(postings))
	if err != nil {
		return nil, err
	}
	markOutdated(postings, func(resumeID string) string { return fingerprints[resumeID] })
	return postings, nil
}

// ScoreInbox scores, against the default resume, every inbox and Interested posting that has no score yet.
func (a *App) ScoreInbox() (MatchRun, error) {
	return a.scoreAgainst("", func(p Posting) bool { return p.Match == nil })
}

// ScorePosting scores one posting again, against the resume it was graded with before (else the default).
func (a *App) ScorePosting(id string) (MatchRun, error) {
	posting, err := a.repo.GetPosting(id)
	if err != nil {
		return MatchRun{}, err
	}
	resumeID := ""
	if posting.Match != nil {
		resumeID = posting.Match.ResumeID
	}
	return a.scoreAgainst(resumeID, func(p Posting) bool { return p.ID == id })
}

// ScorePostingWith scores one posting against a chosen resume ("" = the default).
func (a *App) ScorePostingWith(id, resumeID string) (MatchRun, error) {
	if resumeID != "" {
		if err := a.requireLiveResume(resumeID); err != nil {
			return MatchRun{}, err
		}
	}
	return a.scoreAgainst(resumeID, func(p Posting) bool { return p.ID == id })
}

// RescoreOutdated scores again the postings whose resume or preferences changed, each against its own resume.
func (a *App) RescoreOutdated() (MatchRun, error) {
	if !a.matchMu.TryLock() {
		return MatchRun{Error: "Scoring is already running"}, nil
	}
	defer a.matchMu.Unlock()
	s, err := a.settings.Load()
	if err != nil {
		return MatchRun{}, err
	}
	scored, err := a.repo.matchCandidates(func(p Posting) bool { return p.Match != nil })
	if err != nil {
		return MatchRun{}, err
	}
	fingerprints, err := a.matchFingerprints(s, scoredResumeIDs(scored))
	if err != nil {
		return MatchRun{}, err
	}
	var total MatchRun
	for resumeID, group := range outdatedByResume(scored, fingerprints) {
		run, err := a.runMatchAgainst(s, resumeID, group)
		total.add(run)
		if err != nil || run.Error != "" {
			return total, err
		}
	}
	return total, nil
}

func (a *App) scoreAgainst(resumeID string, want func(Posting) bool) (MatchRun, error) {
	if !a.matchMu.TryLock() {
		return MatchRun{Error: "Scoring is already running"}, nil
	}
	defer a.matchMu.Unlock()
	s, err := a.settings.Load()
	if err != nil {
		return MatchRun{}, err
	}
	postings, err := a.repo.matchCandidates(want)
	if err != nil {
		return MatchRun{}, err
	}
	return a.runMatchAgainst(s, resumeID, postings)
}

// runMatchAgainst scores postings against a resume. A missing resume is the
// run's Error (like any problem the user can fix), not a failed call.
func (a *App) runMatchAgainst(s settings.Settings, resumeID string, postings []Posting) (MatchRun, error) {
	text, err := a.repo.optionalResumeText(s, resumeID)
	if err != nil {
		return MatchRun{}, err
	}
	return runMatch(a.lifetimeContext(), a.repo, s, matchResume{ID: resumeID, Text: text}, postings, a.reportProgress("match:progress"))
}

// matchFingerprints gives, for each resume ID, the fingerprint its scores would have if graded now.
func (a *App) matchFingerprints(s settings.Settings, resumeIDs []string) (map[string]string, error) {
	fingerprints := map[string]string{}
	for _, id := range append(resumeIDs, "") {
		text, err := a.repo.optionalResumeText(s, id)
		if err != nil {
			return nil, err
		}
		fingerprints[id] = matchFingerprint(text, s)
	}
	return fingerprints, nil
}

// outdatedByResume groups the scored postings whose fingerprint changed by the resume they were graded against.
func outdatedByResume(postings []Posting, fingerprints map[string]string) map[string][]Posting {
	groups := map[string][]Posting{}
	for _, p := range postings {
		if p.Match.fingerprint != fingerprints[p.Match.ResumeID] {
			groups[p.Match.ResumeID] = append(groups[p.Match.ResumeID], p)
		}
	}
	return groups
}

func (a *App) requireLiveResume(id string) error {
	doc, err := a.repo.GetDocument(id)
	if err != nil {
		return err
	}
	if doc.Kind != DocumentResume || doc.DeletedAt != "" {
		return errors.New("that resume isn't available; pick another")
	}
	return nil
}
