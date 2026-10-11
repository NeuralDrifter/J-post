// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"testing"
)

func mustLock(t *testing.T, r *Repo, id string, locked bool) {
	t.Helper()
	if err := r.SetDocumentLocked(id, locked); err != nil {
		t.Fatalf("SetDocumentLocked: %v", err)
	}
}

func TestLockingADocument(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	if d.Locked {
		t.Fatal("a new document is locked")
	}
	mustLock(t, r, d.ID, true)
	got, err := r.GetDocument(d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Locked {
		t.Fatal("the lock didn't stick")
	}
	if got.UpdatedAt != d.UpdatedAt {
		t.Fatal("locking counted as an edit")
	}
	mustLock(t, r, d.ID, false)
	if got, _ := r.GetDocument(d.ID); got.Locked {
		t.Fatal("unlocking didn't stick")
	}
}

func TestALockedDocumentRefusesChanges(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	version := listVersions(t, r, d.ID)[0]
	mustLock(t, r, d.ID, true)
	changes := map[string]error{
		"save":    func() error { _, err := r.SaveDocument(d.ID, `{"v":2}`, "", ""); return err }(),
		"rename":  r.RenameDocument(d.ID, "Other"),
		"trash":   r.TrashDocument(d.ID),
		"restore": func() error { _, err := r.RestoreDocumentVersion(d.ID, version.ID); return err }(),
	}
	for change, err := range changes {
		if !errors.Is(err, ErrDocumentLocked) {
			t.Errorf("%s: err = %v, want ErrDocumentLocked", change, err)
		}
	}
	if got, _ := r.GetDocument(d.ID); got.Data != sampleData || got.Name != "Backend" || got.DeletedAt != "" {
		t.Fatalf("the locked document changed: %+v", got)
	}
}

func TestALockedDocumentCanStillBeCopiedAndNamed(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	mustLock(t, r, d.ID, true)
	copy, err := r.DuplicateDocument(d.ID)
	if err != nil || copy.Locked {
		t.Fatalf("duplicate = %+v, %v; want an unlocked copy", copy, err)
	}
	if _, err := r.NameDocumentVersion(d.ID, "Sent"); err != nil {
		t.Fatalf("naming a version of a locked document: %v", err)
	}
}

func TestLockingAMissingDocument(t *testing.T) {
	r := newTestRepo(t)
	if err := r.SetDocumentLocked("missing", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}
