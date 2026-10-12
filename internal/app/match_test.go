// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"jobtrack/internal/ai"
	"jobtrack/internal/ai/aitest"
	"jobtrack/internal/settings"
)

func factor(score int) MatchFactor { return MatchFactor{Applicable: true, Score: score} }

func TestOverallScore(t *testing.T) {
	na := MatchFactor{}
	cases := []struct {
		name string
		f    MatchFactors
		want int
	}{
		{"all four", MatchFactors{factor(80), factor(60), factor(100), factor(40)}, 73}, // (4000+1200+1500+600)/100
		{"no salary listed", MatchFactors{factor(80), factor(60), factor(100), na}, 79}, // 6700/85 = 78.8
		{"resume only", MatchFactors{factor(77), na, na, na}, 77},
		{"clamped", MatchFactors{factor(150), factor(-20), na, na}, 71}, // (100*50+0*20)/70 = 71.4
		{"nothing applies", MatchFactors{na, na, na, na}, 0},
	}
	for _, c := range cases {
		if got := overallScore(c.f); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}

func TestMatchScoresClampsAndPairs(t *testing.T) {
	postings := []Posting{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	var ans matchAnswer
	if err := json.Unmarshal([]byte(`{"results":[
		{"id":"a","resumeFit":{"score":130,"note":"strong Go"},"seniority":{"applicable":true,"score":-5,"note":"junior"},
		 "location":{"applicable":false,"score":0,"note":"not stated"},"salary":{"applicable":true,"score":50,"note":"near floor"},
		 "strengths":["Go"," ","Postgres","Kubernetes","AWS"],"gaps":["no Rust"]},
		{"id":"b","resumeFit":{"score":60,"note":""},"seniority":{"applicable":false,"score":0,"note":""},"location":{"applicable":false,"score":0,"note":""},"salary":{"applicable":false,"score":0,"note":""},"strengths":[],"gaps":[]},
		{"id":"b","resumeFit":{"score":61,"note":""},"seniority":{"applicable":false,"score":0,"note":""},"location":{"applicable":false,"score":0,"note":""},"salary":{"applicable":false,"score":0,"note":""},"strengths":[],"gaps":[]},
		{"id":"zzz","resumeFit":{"score":99,"note":""},"seniority":{"applicable":false,"score":0,"note":""},"location":{"applicable":false,"score":0,"note":""},"salary":{"applicable":false,"score":0,"note":""},"strengths":[],"gaps":[]}
	]}`), &ans); err != nil {
		t.Fatal(err)
	}
	got := matchScores(postings, ans)
	if len(got) != 1 {
		t.Fatalf("only a should be scored (b is duplicated, c missing, zzz invented): %v", got)
	}
	a := got["a"]
	if a.Factors.ResumeFit.Score != 100 || !a.Factors.ResumeFit.Applicable || a.Factors.Seniority.Score != 0 || a.Factors.Location.Applicable {
		t.Fatalf("factors = %+v", a.Factors)
	}
	// (100*50 + 0*20 + 50*15) / 85 = 67.6
	if a.Overall != 68 {
		t.Fatalf("overall = %d", a.Overall)
	}
	if strings.Join(a.Strengths, "|") != "Go|Postgres|Kubernetes" || strings.Join(a.Gaps, "|") != "no Rust" {
		t.Fatalf("strengths %q gaps %q", a.Strengths, a.Gaps)
	}
}

func TestMatchFingerprint(t *testing.T) {
	s := settings.Settings{MatchMinSalary: 100000, MatchWorkModes: []string{"remote", "hybrid"}, MatchLocations: "Denver", MatchSeniority: "senior", MatchGoals: "climate"}
	base := matchFingerprint("Jane Doe, Go", s)
	same := s
	same.MatchWorkModes = []string{"hybrid", "remote"}
	same.MatchLocations = "  Denver "
	same.MatchEnabled, same.MatchPerRequest = true, 40
	same = aitest.WithTask(same, settings.TaskJobMatch, settings.ProviderAnthropic)
	if matchFingerprint(" Jane Doe, Go\n", same) != base {
		t.Fatal("order, whitespace, the switch, the provider and the request size must not change the fingerprint")
	}
	changes := map[string]func(*settings.Settings, *string){
		"resume":    func(_ *settings.Settings, r *string) { *r = "Jane Doe, Rust" },
		"salary":    func(s *settings.Settings, _ *string) { s.MatchMinSalary = 90000 },
		"modes":     func(s *settings.Settings, _ *string) { s.MatchWorkModes = []string{"remote"} },
		"locations": func(s *settings.Settings, _ *string) { s.MatchLocations = "Boulder" },
		"seniority": func(s *settings.Settings, _ *string) { s.MatchSeniority = "staff" },
		"goals":     func(s *settings.Settings, _ *string) { s.MatchGoals = "health" },
	}
	for name, change := range changes {
		c, resume := s, "Jane Doe, Go"
		c.MatchWorkModes = append([]string(nil), s.MatchWorkModes...)
		change(&c, &resume)
		if matchFingerprint(resume, c) == base {
			t.Errorf("changing %s must change the fingerprint", name)
		}
	}
}

func TestMatchTaskInput(t *testing.T) {
	long := strings.Repeat("é", 2000)
	task := matchTask("Jane Doe", settings.Settings{MatchSeniority: "senior"}, []Posting{
		{ID: "p1", Title: "Go Dev", Company: "Acme", WorkMode: "remote", SalaryText: "$150k", Description: long},
		{ID: "p2", Title: "PM"},
	})
	if task.Name != "jobMatch" || task.Role != ai.RoleMatching || task.Instruction == "" {
		t.Fatalf("task = %+v", task)
	}
	var in struct {
		Candidate struct {
			Resume      string         `json:"resume"`
			Preferences map[string]any `json:"preferences"`
		} `json:"candidate"`
		Postings []map[string]string `json:"postings"`
	}
	if err := json.Unmarshal([]byte(task.Input), &in); err != nil {
		t.Fatalf("input isn't JSON: %v", err)
	}
	if in.Candidate.Resume != "Jane Doe" || in.Candidate.Preferences["seniority"] != "senior" || len(in.Candidate.Preferences) != 1 {
		t.Fatalf("candidate = %+v (unset preferences must be left out)", in.Candidate)
	}
	d := in.Postings[0]["description"]
	if !utf8.ValidString(d) || utf8.RuneCountInString(d) > 1501 || !strings.HasSuffix(d, "…") {
		t.Fatalf("description cut badly: %d runes", utf8.RuneCountInString(d))
	}
	if in.Postings[0]["salary"] != "$150k" || in.Postings[1]["id"] != "p2" || in.Postings[1]["company"] != "" {
		t.Fatalf("postings = %+v", in.Postings)
	}
}
