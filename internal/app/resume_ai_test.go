// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"jobtrack/internal/ai"
	"jobtrack/internal/ai/aitest"
	"jobtrack/internal/settings"
)

const testResumeTask = "resumeTailor"

// withTestResumeTask registers a minimal task under testResumeTask for one test.
func withTestResumeTask(t *testing.T) {
	t.Helper()
	saved, had := resumeAITasks[testResumeTask]
	resumeAITasks[testResumeTask] = resumeAITask{
		instruction: "Suggest edits.",
		schema:      editsSchema(editShape("rewrite", map[string]any{"passageId": schemaString, "text": schemaString, "why": schemaString})),
		role:        ai.RoleWriting,
	}
	t.Cleanup(func() {
		if had {
			resumeAITasks[testResumeTask] = saved
		} else {
			delete(resumeAITasks, testResumeTask)
		}
	})
}

// fakeEdits answers every Anthropic request with answer, and records each request body.
func fakeEdits(t *testing.T, answer string) *[]map[string]any {
	t.Helper()
	var bodies []map[string]any
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		var body map[string]any
		json.NewDecoder(req.Body).Decode(&body)
		bodies = append(bodies, body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(aitest.AnthropicReply("claude-opus-5-5", answer, "end_turn"))
	})
	return &bodies
}

func resumeAISettings() settings.Settings {
	return aitest.WithTask(aitest.AnthropicSettings, testResumeTask, settings.ProviderAnthropic)
}

const oneRewrite = `{"edits":[{"kind":"rewrite","passageId":"p_1","text":"Led the team","why":"stronger verb"}]}`

func TestRunResumeAIKeepsTheGeneration(t *testing.T) {
	withTestResumeTask(t)
	r := newTestRepo(t)
	doc, _ := r.CreateDocument(DocumentResume, "CV", sampleData, "Ada")
	job := mustCreateJob(t, r)
	job.Description = "We need a team lead."
	if _, err := r.UpdateJob(job); err != nil {
		t.Fatal(err)
	}
	bodies := fakeEdits(t, oneRewrite)

	req := ResumeAIRequest{Task: testResumeTask, DocumentID: doc.ID, SectionKey: "experience", JobID: job.ID, Input: `{"passages":[]}`, Context: `{"p_1":"<li>Led</li>"}`}
	g, err := runResumeAI(context.Background(), r, resumeAISettings(), req)
	if err != nil {
		t.Fatal(err)
	}
	if g.Provider != settings.ProviderAnthropic || g.Model != "claude-opus-5-5" || g.Posting != "We need a team lead." || g.SectionKey != "experience" || g.Decisions != "{}" || g.Context != `{"p_1":"<li>Led</li>"}` {
		t.Fatalf("g = %+v", g)
	}
	if !strings.Contains(g.Edits, `"passageId":"p_1"`) {
		t.Fatalf("edits = %s", g.Edits)
	}
	input := (*bodies)[0]["messages"].([]any)[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(input, "<<<MATERIAL_START>>>\n{\"passages\":[]}") || !strings.Contains(input, "We need a team lead.") || strings.Contains(input, "<li>Led</li>") {
		t.Fatalf("input = %s", input)
	}
	list, _ := r.ListAIGenerations(doc.ID)
	if len(list) != 1 || list[0].ID != g.ID {
		t.Fatalf("list = %+v", list)
	}
}

func TestRunResumeAIOverride(t *testing.T) {
	withTestResumeTask(t)
	r := newTestRepo(t)
	doc, _ := r.CreateDocument(DocumentResume, "CV", sampleData, "Ada")
	bodies := fakeEdits(t, oneRewrite)
	s := aitest.WithTask(aitest.AnthropicSettings, testResumeTask, settings.ProviderGeminiLive)
	req := ResumeAIRequest{Task: testResumeTask, DocumentID: doc.ID, Input: `{}`, Provider: settings.ProviderAnthropic, Model: "claude-sonnet-5-5"}
	if _, err := runResumeAI(context.Background(), r, s, req); err != nil {
		t.Fatal(err)
	}
	if (*bodies)[0]["model"] != "claude-sonnet-5-5" {
		t.Fatalf("model = %v", (*bodies)[0]["model"])
	}
}

func TestRunResumeAIRefusals(t *testing.T) {
	withTestResumeTask(t)
	r := newTestRepo(t)
	doc, _ := r.CreateDocument(DocumentResume, "CV", sampleData, "Ada")
	fakeEdits(t, `not json`)
	if _, err := runResumeAI(context.Background(), r, resumeAISettings(), ResumeAIRequest{Task: "nope", DocumentID: doc.ID}); err == nil {
		t.Error("unknown task ran")
	}
	if _, err := runResumeAI(context.Background(), r, resumeAISettings(), ResumeAIRequest{Task: testResumeTask, DocumentID: doc.ID, Input: `{}`}); err == nil {
		t.Error("an answer that isn't JSON was accepted")
	}
	r.SetDocumentLocked(doc.ID, true)
	if _, err := runResumeAI(context.Background(), r, resumeAISettings(), ResumeAIRequest{Task: testResumeTask, DocumentID: doc.ID, Input: `{}`}); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Errorf("locked document: err = %v", err)
	}
	if list, _ := r.ListAIGenerations(doc.ID); len(list) != 0 {
		t.Fatalf("failed runs were kept: %+v", list)
	}
}

func TestAIGenerationDecisionsAndCascade(t *testing.T) {
	withTestResumeTask(t)
	r := newTestRepo(t)
	doc, _ := r.CreateDocument(DocumentResume, "CV", sampleData, "Ada")
	fakeEdits(t, oneRewrite)
	g, err := runResumeAI(context.Background(), r, resumeAISettings(), ResumeAIRequest{Task: testResumeTask, DocumentID: doc.ID, Input: `{}`})
	if err != nil {
		t.Fatal(err)
	}
	if err := r.SetAIGenerationDecisions(g.ID, `["accepted"]`); err == nil {
		t.Error("decisions that aren't an object were saved")
	}
	if err := r.SetAIGenerationDecisions(g.ID, `{"0":"accepted"}`); err != nil {
		t.Fatal(err)
	}
	if list, _ := r.ListAIGenerations(doc.ID); list[0].Decisions != `{"0":"accepted"}` {
		t.Fatalf("decisions = %s", list[0].Decisions)
	}
	if err := r.DeleteDocumentForever(doc.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := r.ListAIGenerations(doc.ID); len(list) != 0 {
		t.Fatal("generations outlived their document")
	}
}

func TestCommitAIVersion(t *testing.T) {
	r := newTestRepo(t)
	doc, _ := r.CreateDocument(DocumentResume, "CV", sampleData, "Ada")
	if _, err := r.CommitAIVersion(doc.ID, VersionNamed, "x", sampleData, ""); err == nil {
		t.Error("committed a named version")
	}
	v, err := r.CommitAIVersion(doc.ID, VersionAI, " Tailored Summary · claude-opus-5-5 ", sampleData, "Ada")
	if err != nil || v.Name != "Tailored Summary · claude-opus-5-5" {
		t.Fatalf("v = %+v, %v", v, err)
	}
	list, _ := r.ListDocumentVersions(doc.ID)
	if list[0].Kind != VersionAI {
		t.Fatalf("history = %+v", list)
	}
}

// Every resume task in the registry answers in the shared edits shape, with a role and an instruction.
func TestResumeAITasksAreComplete(t *testing.T) {
	for id, task := range resumeAITasks {
		if task.instruction == "" || task.schema["required"] == nil {
			t.Errorf("%s is incomplete", id)
		}
		if _, ok := settingsTask(id); !ok {
			t.Errorf("%s is not a settings task", id)
		}
	}
}

func settingsTask(id string) (settings.AITask, bool) {
	for _, task := range settings.AITasks {
		if task.ID == id {
			return task, true
		}
	}
	return settings.AITask{}, false
}

func TestImproveAsksForOneRewrite(t *testing.T) {
	r := newTestRepo(t)
	doc, _ := r.CreateDocument(DocumentResume, "CV", sampleData, "Ada")
	bodies := fakeEdits(t, `{"edits":[{"kind":"rewrite","passageId":"p_1","text":"Led five engineers","why":"stronger verb","addsFacts":false}]}`)
	s := aitest.WithTask(aitest.AnthropicSettings, settings.TaskResumeImprove, settings.ProviderAnthropic)
	req := ResumeAIRequest{Task: settings.TaskResumeImprove, DocumentID: doc.ID, SectionKey: "experience", Input: `{"action":"verb","line":{"id":"p_1","text":"Was in charge of five engineers"}}`}
	g, err := runResumeAI(context.Background(), r, s, req)
	if err != nil || !strings.Contains(g.Edits, "Led five engineers") {
		t.Fatalf("g = %+v, %v", g, err)
	}
	body := (*bodies)[0]
	if body["max_tokens"] != float64(1024) || !strings.Contains(body["system"].([]any)[0].(map[string]any)["text"].(string), "Return exactly one edit") {
		t.Fatalf("body = %v", body)
	}
}
