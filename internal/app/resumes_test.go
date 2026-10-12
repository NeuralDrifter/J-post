// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"strings"
	"testing"
	"time"

	"jobtrack/internal/settings"
)

const sampleData = `{"basics":{"name":"Ada"}}`

func mustCreateDocument(t *testing.T, r *Repo, kind, name string) Document {
	t.Helper()
	d, err := r.CreateDocument(kind, name, sampleData, "Ada")
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	return d
}

func TestCreateAndGetDocument(t *testing.T) {
	r := newTestRepo(t)
	created := mustCreateDocument(t, r, DocumentResume, "Backend")
	got, err := r.GetDocument(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got != created || got.Kind != DocumentResume || got.Name != "Backend" || got.Data != sampleData || got.PlainText != "Ada" {
		t.Fatalf("got %+v, created %+v", got, created)
	}
	if got.CreatedAt == "" || got.CreatedAt != got.UpdatedAt || got.DeletedAt != "" {
		t.Fatalf("timestamps = %+v", got)
	}
}

func TestCreateDocumentRejectsBadInput(t *testing.T) {
	r := newTestRepo(t)
	cases := map[string]struct{ kind, name, data string }{
		"unknown kind": {"poster", "X", sampleData},
		"empty name":   {DocumentResume, "  ", sampleData},
		"invalid json": {DocumentResume, "X", "{not json"},
		"too large":    {DocumentResume, "X", `"` + strings.Repeat("a", maxDocumentBytes) + `"`},
	}
	for name, c := range cases {
		if _, err := r.CreateDocument(c.kind, c.name, c.data, ""); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}

func TestListDocumentsByKindAndTrash(t *testing.T) {
	r := newTestRepo(t)
	older := mustCreateDocument(t, r, DocumentResume, "Older")
	setNow(r, 2026, time.October, 2, 12)
	newer := mustCreateDocument(t, r, DocumentResume, "Newer")
	mustCreateDocument(t, r, DocumentLetter, "Letter")
	trashed := mustCreateDocument(t, r, DocumentResume, "Trashed")
	if err := r.TrashDocument(trashed.ID); err != nil {
		t.Fatal(err)
	}

	live, err := r.ListDocuments(DocumentResume, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(live) != 2 || live[0].ID != newer.ID || live[1].ID != older.ID {
		t.Fatalf("live = %+v", names(live))
	}
	inTrash, err := r.ListDocuments(DocumentResume, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(inTrash) != 1 || inTrash[0].ID != trashed.ID || inTrash[0].DeletedAt == "" {
		t.Fatalf("trash = %+v", names(inTrash))
	}
}

func TestSaveDocumentUpdatesDataTextAndTime(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	setNow(r, 2026, time.October, 3, 9)
	saved, err := r.SaveDocument(d.ID, `{"basics":{"name":"Grace"}}`, "Grace", "")
	if err != nil {
		t.Fatal(err)
	}
	if saved.PlainText != "Grace" || !strings.Contains(saved.Data, "Grace") || saved.UpdatedAt == d.UpdatedAt || saved.CreatedAt != d.CreatedAt {
		t.Fatalf("saved = %+v", saved)
	}
	if _, err := r.SaveDocument(d.ID, "nope", "", ""); err == nil {
		t.Error("invalid JSON saved")
	}
	if _, err := r.SaveDocument("missing", sampleData, "", ""); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing document: err = %v", err)
	}
}

func TestRenameDocument(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	if err := r.RenameDocument(d.ID, "  Platform  "); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetDocument(d.ID)
	if got.Name != "Platform" {
		t.Fatalf("name = %q", got.Name)
	}
	if err := r.RenameDocument(d.ID, " "); err == nil {
		t.Error("empty name accepted")
	}
}

func TestDuplicateDocument(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	dup, err := r.DuplicateDocument(d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dup.ID == d.ID || dup.Name != "Copy of Backend" || dup.Data != d.Data || dup.PlainText != d.PlainText || dup.Kind != d.Kind {
		t.Fatalf("dup = %+v", dup)
	}
}

func TestTrashAndRestoreDocument(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	if err := r.TrashDocument(d.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.RestoreDocument(d.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetDocument(d.ID)
	if got.DeletedAt != "" {
		t.Fatalf("still trashed: %+v", got)
	}
}

func TestDeleteDocumentForeverClearsJobLinks(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	job, err := r.CreateJob(Job{Company: "Acme", Position: "Engineer", Status: StatusApplied})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.db.Exec(`UPDATE jobs SET resume_id = ? WHERE id = ?`, d.ID, job.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.DeleteDocumentForever(d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetDocument(d.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("document still there: %v", err)
	}
	var link string
	if err := r.db.QueryRow(`SELECT resume_id FROM jobs WHERE id = ?`, job.ID).Scan(&link); err != nil || link != "" {
		t.Fatalf("job link = %q, err = %v", link, err)
	}
}

func TestEmptyTrashOnlyTouchesThatKind(t *testing.T) {
	r := newTestRepo(t)
	resume := mustCreateDocument(t, r, DocumentResume, "R")
	letter := mustCreateDocument(t, r, DocumentLetter, "L")
	live := mustCreateDocument(t, r, DocumentResume, "Live")
	for _, id := range []string{resume.ID, letter.ID} {
		if err := r.TrashDocument(id); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.EmptyTrash(DocumentResume); err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetDocument(resume.ID); !errors.Is(err, ErrNotFound) {
		t.Error("trashed resume survived")
	}
	for _, id := range []string{letter.ID, live.ID} {
		if _, err := r.GetDocument(id); err != nil {
			t.Errorf("%s removed: %v", id, err)
		}
	}
}

func TestResumeTextForFallsBackInOrder(t *testing.T) {
	r := newTestRepo(t)
	chosen, _ := r.CreateDocument(DocumentResume, "Chosen", sampleData, "Chosen text")
	def, _ := r.CreateDocument(DocumentResume, "Default", sampleData, "Default text")
	blank, _ := r.CreateDocument(DocumentResume, "Blank", sampleData, "  ")
	s := settings.Settings{DefaultResumeID: def.ID}

	cases := []struct {
		name     string
		settings settings.Settings
		resumeID string
		want     string
	}{
		{"explicit resume", s, chosen.ID, "Chosen text"},
		{"default resume", s, "", "Default text"},
		{"unknown explicit falls to default", s, "missing", "Default text"},
		{"blank explicit falls to default", s, blank.ID, "Default text"},
	}
	for _, c := range cases {
		got, err := r.resumeTextFor(c.settings, c.resumeID)
		if err != nil || got != c.want {
			t.Errorf("%s: got %q, %v; want %q", c.name, got, err, c.want)
		}
	}
}

func TestResumeTextForNeedsAResume(t *testing.T) {
	r := newTestRepo(t)
	def, _ := r.CreateDocument(DocumentResume, "Default", sampleData, "Default text")
	s := settings.Settings{DefaultResumeID: def.ID}
	if err := r.TrashDocument(def.ID); err != nil {
		t.Fatal(err)
	}
	for name, c := range map[string]settings.Settings{"no default": {}, "trashed default": s} {
		if _, err := r.resumeTextFor(c, ""); !errors.Is(err, ErrNeedsResume) || !strings.HasPrefix(err.Error(), "needs-resume:") {
			t.Errorf("%s: err = %v", name, err)
		}
		if text, err := r.optionalResumeText(c, ""); text != "" || err != nil {
			t.Errorf("%s: optional = %q, %v", name, text, err)
		}
	}
}

func names(docs []Document) []string {
	out := make([]string, len(docs))
	for i, d := range docs {
		out[i] = d.Name
	}
	return out
}

func mustCreateJob(t *testing.T, r *Repo) Job {
	t.Helper()
	job, err := r.CreateJob(Job{Company: "Acme", Position: "Staff Engineer", Status: StatusApplied})
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func TestLinkJobDocuments(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	resume := mustCreateDocument(t, r, DocumentResume, "Backend")
	letter := mustCreateDocument(t, r, DocumentLetter, "To Acme")
	if err := r.LinkJobDocuments(job.ID, resume.ID, letter.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetJob(job.ID)
	if got.ResumeID != resume.ID || got.LetterID != letter.ID {
		t.Fatalf("job = %+v", got)
	}
	if err := r.LinkJobDocuments(job.ID, "", ""); err != nil {
		t.Fatal(err)
	}
	if got, _ = r.GetJob(job.ID); got.ResumeID != "" || got.LetterID != "" {
		t.Fatalf("links not cleared: %+v", got)
	}
}

func TestLinkJobDocumentsChecksKinds(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	resume := mustCreateDocument(t, r, DocumentResume, "Backend")
	letter := mustCreateDocument(t, r, DocumentLetter, "To Acme")
	if err := r.LinkJobDocuments(job.ID, letter.ID, ""); err == nil {
		t.Error("a letter was linked as the resume")
	}
	if err := r.LinkJobDocuments(job.ID, "", resume.ID); err == nil {
		t.Error("a resume was linked as the letter")
	}
	if err := r.LinkJobDocuments(job.ID, "missing", ""); err == nil {
		t.Error("a missing document was linked")
	}
}

func TestTailorResumeForJob(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	resume := mustCreateDocument(t, r, DocumentResume, "Backend")
	copy, err := r.TailorResumeForJob(job.ID, resume.ID)
	if err != nil {
		t.Fatal(err)
	}
	if copy.ID == resume.ID || copy.Name != "Backend · Acme" || copy.SourceID != resume.ID || copy.JobID != job.ID || copy.Data != resume.Data {
		t.Fatalf("copy = %+v", copy)
	}
	if got, _ := r.GetJob(job.ID); got.ResumeID != copy.ID {
		t.Fatalf("job links %q, want the tailored copy", got.ResumeID)
	}
}

func TestInterviewsReadTheJobsLinkedResume(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	resume, _ := r.CreateDocument(DocumentResume, "Tailored", sampleData, "Tailored text")
	if err := r.LinkJobDocuments(job.ID, resume.ID, ""); err != nil {
		t.Fatal(err)
	}
	ic, err := r.loadInterviewContext(settings.Settings{}, job.ID)
	if err != nil || ic.resume != "Tailored text" {
		t.Fatalf("interview resume = %q, %v", ic.resume, err)
	}
}
