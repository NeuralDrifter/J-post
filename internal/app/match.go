// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"slices"
	"strconv"
	"strings"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
	"jobtrack/internal/textproc"
)

// Match scores: how well a Discover posting fits the user's resume and
// preferences. The AI scores each factor; the overall % is computed here from
// fixed weights, so the same breakdown always gives the same number.

// Factor weights; they sum to 100.
const (
	weightResumeFit = 50
	weightSeniority = 20
	weightLocation  = 15
	weightSalary    = 15
)

const (
	matchDescriptionChars = 1500 // how much of each description is sent
	maxMatchReasons       = 3    // strengths and gaps kept per posting
)

// MatchFactor is one part of a match score. A factor that doesn't apply (no
// target set, or the posting doesn't say) is left out of the overall.
type MatchFactor struct {
	Applicable bool   `json:"applicable"`
	Score      int    `json:"score"` // 0-100
	Note       string `json:"note"`
}

type MatchFactors struct {
	ResumeFit MatchFactor `json:"resumeFit"` // always applicable; includes goals and deal-breakers
	Seniority MatchFactor `json:"seniority"`
	Location  MatchFactor `json:"location"` // work mode and location
	Salary    MatchFactor `json:"salary"`
}

// MatchScore is a posting's stored score. Outdated is set when listing: the
// score was graded against a different resume or preferences.
type MatchScore struct {
	Overall     int          `json:"overall"`
	Factors     MatchFactors `json:"factors"`
	Strengths   []string     `json:"strengths"`
	Gaps        []string     `json:"gaps"`
	Provider    string       `json:"provider"`
	Model       string       `json:"model"`
	ScoredAt    string       `json:"scoredAt"`
	Outdated    bool         `json:"outdated"`
	ResumeID    string       `json:"resumeId"` // the resume it was graded against; "" = the default at the time
	fingerprint string       // matchFingerprint at scoring time
}

// overallScore is the weighted average of the applicable factors, 0-100.
func overallScore(f MatchFactors) int {
	parts := []struct {
		f      MatchFactor
		weight int
	}{{f.ResumeFit, weightResumeFit}, {f.Seniority, weightSeniority}, {f.Location, weightLocation}, {f.Salary, weightSalary}}
	sum, weights := 0, 0
	for _, p := range parts {
		if p.f.Applicable {
			sum += clamp(p.f.Score, 0, 100) * p.weight
			weights += p.weight
		}
	}
	if weights == 0 {
		return 0
	}
	return int(math.Round(float64(sum) / float64(weights)))
}

// matchFingerprint identifies the resume and preferences a score was graded
// against. The switch, provider and request size don't affect it.
func matchFingerprint(resume string, s settings.Settings) string {
	modes := slices.Clone(s.MatchWorkModes)
	slices.Sort(modes)
	h := sha256.New()
	for _, part := range []string{strings.TrimSpace(resume), strconv.FormatInt(s.MatchMinSalary, 10), strings.Join(modes, ","),
		strings.TrimSpace(s.MatchLocations), s.MatchSeniority, strings.TrimSpace(s.MatchGoals)} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

type matchPreferences struct {
	MinSalary int64    `json:"minSalary,omitempty"`
	WorkModes []string `json:"workModes,omitempty"`
	Locations string   `json:"locations,omitempty"`
	Seniority string   `json:"seniority,omitempty"`
	Goals     string   `json:"goals,omitempty"`
}

type matchPosting struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Company     string `json:"company,omitempty"`
	Location    string `json:"location,omitempty"`
	WorkMode    string `json:"workMode,omitempty"`
	Salary      string `json:"salary,omitempty"`
	Description string `json:"description,omitempty"`
}

const matchInstruction = "You are a careful career advisor. For each job posting, judge how well it fits the candidate. " +
	"Score each factor from 0 to 100 with a one-line note: resumeFit (skills, experience and domain from the resume, plus the " +
	"candidate's goals), seniority (the role's level against the target), location (work mode and place against the candidate's " +
	"preferences) and salary (listed pay against the floor). Set applicable to false, with a note saying why, when the candidate " +
	"set no preference for that factor or the posting doesn't say. Treat goals and deal-breakers as part of resumeFit; a " +
	"deal-breaker the posting hits must lower resumeFit and appear in gaps. Give up to three strengths and three gaps, each a few " +
	"words. Return exactly one result per posting id. Use only facts from the resume and the postings."

// matchTask asks for scores for a group of postings in one request.
func matchTask(resume string, s settings.Settings, postings []Posting) ai.Task {
	in := struct {
		Candidate struct {
			Resume      string           `json:"resume"`
			Preferences matchPreferences `json:"preferences"`
		} `json:"candidate"`
		Postings []matchPosting `json:"postings"`
	}{}
	in.Candidate.Resume = strings.TrimSpace(resume)
	in.Candidate.Preferences = matchPreferences{MinSalary: s.MatchMinSalary, WorkModes: s.MatchWorkModes,
		Locations: strings.TrimSpace(s.MatchLocations), Seniority: s.MatchSeniority, Goals: strings.TrimSpace(s.MatchGoals)}
	in.Postings = make([]matchPosting, 0, len(postings))
	for _, p := range postings {
		in.Postings = append(in.Postings, matchPosting{ID: p.ID, Title: p.Title, Company: p.Company, Location: p.Location,
			WorkMode: p.WorkMode, Salary: p.SalaryText, Description: textproc.Truncate(strings.TrimSpace(p.Description), matchDescriptionChars)})
	}
	raw, _ := json.Marshal(in) // only strings, ints and slices: can't fail
	return ai.Task{Name: "jobMatch", Instruction: matchInstruction, Input: string(raw), Schema: matchSchema, Role: ai.RoleMatching}
}

var matchFactorSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"applicable": map[string]any{"type": "boolean"},
		"score":      map[string]any{"type": "integer"},
		"note":       map[string]any{"type": "string"},
	},
	"required":             []string{"applicable", "score", "note"},
	"additionalProperties": false,
}

var matchSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"results": map[string]any{"type": "array", "items": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"id": map[string]any{"type": "string"},
				"resumeFit": map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"score": map[string]any{"type": "integer"}, "note": map[string]any{"type": "string"}},
					"required":             []string{"score", "note"},
					"additionalProperties": false,
				},
				"seniority": matchFactorSchema,
				"location":  matchFactorSchema,
				"salary":    matchFactorSchema,
				"strengths": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				"gaps":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			},
			"required":             []string{"id", "resumeFit", "seniority", "location", "salary", "strengths", "gaps"},
			"additionalProperties": false,
		}},
	},
	"required":             []string{"results"},
	"additionalProperties": false,
}

type matchAnswer struct {
	Results []matchResult `json:"results"`
}

type matchResult struct {
	ID        string `json:"id"`
	ResumeFit struct {
		Score int    `json:"score"`
		Note  string `json:"note"`
	} `json:"resumeFit"`
	Seniority MatchFactor `json:"seniority"`
	Location  MatchFactor `json:"location"`
	Salary    MatchFactor `json:"salary"`
	Strengths []string    `json:"strengths"`
	Gaps      []string    `json:"gaps"`
}

// matchScores pairs an answer with the postings asked about. A posting with no
// result, or more than one, is left out and stays unscored; results for IDs
// that weren't asked about are ignored.
func matchScores(postings []Posting, ans matchAnswer) map[string]MatchScore {
	count := map[string]int{}
	for _, res := range ans.Results {
		count[res.ID]++
	}
	out := map[string]MatchScore{}
	for _, res := range ans.Results {
		asked := slices.ContainsFunc(postings, func(p Posting) bool { return p.ID == res.ID })
		if !asked || count[res.ID] != 1 {
			continue
		}
		f := MatchFactors{
			ResumeFit: MatchFactor{Applicable: true, Score: clamp(res.ResumeFit.Score, 0, 100), Note: res.ResumeFit.Note},
			Seniority: clampFactor(res.Seniority),
			Location:  clampFactor(res.Location),
			Salary:    clampFactor(res.Salary),
		}
		out[res.ID] = MatchScore{Overall: overallScore(f), Factors: f, Strengths: firstReasons(res.Strengths), Gaps: firstReasons(res.Gaps)}
	}
	return out
}

func clampFactor(f MatchFactor) MatchFactor {
	f.Score = clamp(f.Score, 0, 100)
	return f
}

// firstReasons keeps up to maxMatchReasons non-blank entries; never nil.
func firstReasons(list []string) []string {
	out := []string{}
	for _, s := range list {
		if s = strings.TrimSpace(s); s != "" && len(out) < maxMatchReasons {
			out = append(out, s)
		}
	}
	return out
}
