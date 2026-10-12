// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
)

// The resume and letter AI features (tailor, improve, review, import tidy,
// letter draft) share one path: the builder sends the task's material as
// JSON, the model answers with typed edits, and the answer is kept as an
// AIGeneration for the builder to review.

// resumeAITask is how one feature asks: its instruction, the answer's schema and its role.
type resumeAITask struct {
	instruction string
	schema      map[string]any
	role        ai.Role
}

// resumeAITasks holds every resume AI task by its settings task id.
var resumeAITasks = map[string]resumeAITask{
	settings.TaskResumeImprove: improveTask,
	settings.TaskResumeTailor:  tailorTask,
}

// ResumeAIRequest is one run of a resume AI task.
type ResumeAIRequest struct {
	Task       string `json:"task"`
	DocumentID string `json:"documentId"`
	SectionKey string `json:"sectionKey"` // "" = the whole document
	JobID      string `json:"jobId"`      // the job whose posting the task reads, if any
	Posting    string `json:"posting"`    // a pasted posting, used when there's no job
	Input      string `json:"input"`      // the task's material as JSON
	Context    string `json:"context"`    // kept with the generation for the builder, never sent
	Provider   string `json:"provider"`   // a one-run override; "" = the task's setting
	Model      string `json:"model"`      // with Provider: one of its models; "" = its own
}

// editsAnswer is the shape every resume task answers in; the edits stay raw for the builder.
type editsAnswer struct {
	Edits []json.RawMessage `json:"edits"`
}

func runResumeAI(ctx context.Context, r *Repo, s settings.Settings, req ResumeAIRequest) (AIGeneration, error) {
	settings.ApplyDefaults(&s)
	task, ok := resumeAITasks[req.Task]
	if !ok {
		return AIGeneration{}, fmt.Errorf("unknown resume AI task %q", req.Task)
	}
	if err := r.checkEditable(req.DocumentID); err != nil {
		return AIGeneration{}, err
	}
	posting, err := r.postingFor(req)
	if err != nil {
		return AIGeneration{}, err
	}
	choice := overrideChoice(s, req.Task, req.Provider, req.Model)
	var answer editsAnswer
	t := ai.Task{Name: req.Task, Instruction: task.instruction, Input: resumeAIInput(req.Input, posting), Schema: task.schema, Role: task.role}
	model, err := ai.RunTask(ctx, s, choice, t, &answer)
	if err != nil {
		return AIGeneration{}, err
	}
	return r.keepGeneration(req, posting, choice.Provider, model, answer)
}

func (r *Repo) checkEditable(documentID string) error {
	doc, err := r.GetDocument(documentID)
	if err != nil {
		return err
	}
	if doc.Locked {
		return lockedError(doc.ID)
	}
	return nil
}

// postingFor is the posting a run reads: the job's description, else the pasted one.
func (r *Repo) postingFor(req ResumeAIRequest) (string, error) {
	if req.JobID == "" {
		return strings.TrimSpace(req.Posting), nil
	}
	job, err := r.GetJob(req.JobID)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(job.Description), nil
}

// overrideChoice is the task's setting, or a one-run provider and model.
func overrideChoice(s settings.Settings, task, provider, model string) settings.AIChoice {
	c := choiceFor(s, task, provider)
	if model != "" {
		c.Model = model
	}
	return c
}

// resumeAIInput wraps the builder's material (and the posting) in markers, so
// nothing inside them can pass for instructions.
func resumeAIInput(material, posting string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "The material, as JSON:\n<<<MATERIAL_START>>>\n%s\n<<<MATERIAL_END>>>\n", material)
	if posting != "" {
		fmt.Fprintf(&b, "\nThe job posting:\n<<<POSTING_START>>>\n%s\n<<<POSTING_END>>>\n", posting)
	}
	return b.String()
}

func (r *Repo) keepGeneration(req ResumeAIRequest, posting, provider, model string, answer editsAnswer) (AIGeneration, error) {
	if answer.Edits == nil {
		answer.Edits = []json.RawMessage{}
	}
	edits, err := json.Marshal(answer)
	if err != nil {
		return AIGeneration{}, err
	}
	g := AIGeneration{
		ID: newID(), DocumentID: req.DocumentID, Task: req.Task, SectionKey: req.SectionKey, JobID: req.JobID, Posting: posting, Context: req.Context,
		Provider: provider, Model: model, Edits: string(edits), Decisions: "{}", CreatedAt: ts(r.now()),
	}
	return g, r.insertAIGeneration(g)
}

// editsSchema is the answer's shape: a list of edits, each one of the given shapes.
func editsSchema(shapes ...map[string]any) map[string]any {
	items := shapes[0]
	if len(shapes) > 1 {
		anyOf := make([]any, len(shapes))
		for i, s := range shapes {
			anyOf[i] = s
		}
		items = map[string]any{"anyOf": anyOf}
	}
	return map[string]any{
		"type":                 "object",
		"properties":           map[string]any{"edits": map[string]any{"type": "array", "items": items}},
		"required":             []string{"edits"},
		"additionalProperties": false,
	}
}

// editShape is one kind of edit: "kind" fixed to the edit's name, plus its fields (all required).
func editShape(kind string, fields map[string]any) map[string]any {
	props := map[string]any{"kind": map[string]any{"type": "string", "enum": []string{kind}}}
	required := []string{"kind"}
	for name, schema := range fields {
		props[name] = schema
		required = append(required, name)
	}
	return map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}
}

var (
	schemaString  = map[string]any{"type": "string"}
	schemaBoolean = map[string]any{"type": "boolean"}
	schemaStrings = map[string]any{"type": "array", "items": map[string]any{"type": "string"}}
)
