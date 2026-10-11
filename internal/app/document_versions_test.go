// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"testing"
	"time"
)

func listVersions(t *testing.T, r *Repo, docID string) []DocumentVersion {
	t.Helper()
	versions, err := r.ListDocumentVersions(docID)
	if err != nil {
		t.Fatalf("ListDocumentVersions: %v", err)
	}
	return versions
}

func kinds(versions []DocumentVersion) []string {
	out := make([]string, len(versions))
	for i, v := range versions {
		out[i] = v.Kind
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func advance(r *Repo, by time.Duration) {
	next := r.now().Add(by)
	r.now = func() time.Time { return next }
}

func TestNewDocumentHasACreatedVersion(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	versions := listVersions(t, r, d.ID)
	if !equalStrings(kinds(versions), []string{VersionCreated}) {
		t.Fatalf("kinds = %v", kinds(versions))
	}
	if versions[0].Data != "" {
		t.Fatal("the list carries version data; it should only summarise")
	}
}

func TestEditingSessionKeepsOneAutosaveRefreshedEveryTwoMinutes(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	save := func(data string) {
		t.Helper()
		if _, err := r.SaveDocument(d.ID, data, "", "session-1"); err != nil {
			t.Fatal(err)
		}
	}
	save(`{"v":1}`)
	advance(r, time.Minute)
	save(`{"v":2}`) // under two minutes since the autosave: not refreshed
	auto := listVersions(t, r, d.ID)[0]
	if got := mustGetVersion(t, r, auto.ID).Data; got != `{"v":1}` {
		t.Fatalf("autosave = %s, want the first save", got)
	}
	advance(r, 2*time.Minute)
	save(`{"v":3}`)
	versions := listVersions(t, r, d.ID)
	if !equalStrings(kinds(versions), []string{VersionAuto, VersionCreated}) {
		t.Fatalf("kinds = %v, want one autosave per session", kinds(versions))
	}
	if got := mustGetVersion(t, r, versions[0].ID).Data; got != `{"v":3}` {
		t.Fatalf("autosave = %s, want the latest save", got)
	}
}

func TestEachEditingSessionGetsItsOwnAutosave(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	for _, session := range []string{"a", "b"} {
		if _, err := r.SaveDocument(d.ID, sampleData, "", session); err != nil {
			t.Fatal(err)
		}
	}
	if got := kinds(listVersions(t, r, d.ID)); !equalStrings(got, []string{VersionAuto, VersionAuto, VersionCreated}) {
		t.Fatalf("kinds = %v", got)
	}
}

func mustGetVersion(t *testing.T, r *Repo, id string) DocumentVersion {
	t.Helper()
	v, err := r.GetDocumentVersion(id)
	if err != nil {
		t.Fatalf("GetDocumentVersion: %v", err)
	}
	return v
}

func TestNameRenameAndDeleteAVersion(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	named, err := r.NameDocumentVersion(d.ID, "  Sent to Lumen ")
	if err != nil {
		t.Fatal(err)
	}
	if named.Kind != VersionNamed || named.Name != "Sent to Lumen" || mustGetVersion(t, r, named.ID).Data != sampleData {
		t.Fatalf("named = %+v", named)
	}
	if err := r.RenameDocumentVersion(named.ID, "Sent to Acme"); err != nil {
		t.Fatal(err)
	}
	if got := mustGetVersion(t, r, named.ID).Name; got != "Sent to Acme" {
		t.Fatalf("name = %q", got)
	}
	if err := r.DeleteDocumentVersion(named.ID); err != nil {
		t.Fatal(err)
	}
	if got := kinds(listVersions(t, r, d.ID)); !equalStrings(got, []string{VersionCreated}) {
		t.Fatalf("kinds after delete = %v", got)
	}
}

func TestOnlyNamedVersionsCanBeRenamedOrDeleted(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	created := listVersions(t, r, d.ID)[0]
	if err := r.RenameDocumentVersion(created.ID, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rename created: err = %v", err)
	}
	if err := r.DeleteDocumentVersion(created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete created: err = %v", err)
	}
	if _, err := r.NameDocumentVersion(d.ID, "  "); err == nil {
		t.Fatal("a blank name was accepted")
	}
}

func TestRestoreSavesTheCurrentStateFirst(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	original := listVersions(t, r, d.ID)[0]
	advance(r, time.Minute)
	if _, err := r.SaveDocument(d.ID, `{"v":2}`, "two", ""); err != nil {
		t.Fatal(err)
	}
	advance(r, time.Minute)
	restored, err := r.RestoreDocumentVersion(d.ID, original.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Data != sampleData || restored.PlainText != "Ada" {
		t.Fatalf("restored = %+v", restored)
	}
	versions := listVersions(t, r, d.ID)
	if got := kinds(versions); !equalStrings(got, []string{VersionRestored, VersionBeforeRestore, VersionCreated}) {
		t.Fatalf("kinds = %v", got)
	}
	if got := mustGetVersion(t, r, versions[1].ID).Data; got != `{"v":2}` {
		t.Fatalf("before restore = %s", got)
	}
}

func TestRestoreRefusesAnotherDocumentsVersion(t *testing.T) {
	r := newTestRepo(t)
	a := mustCreateDocument(t, r, DocumentResume, "A")
	b := mustCreateDocument(t, r, DocumentResume, "B")
	if _, err := r.RestoreDocumentVersion(a.ID, listVersions(t, r, b.ID)[0].ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestOldAutosavesExpire(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	if _, err := r.SaveDocument(d.ID, sampleData, "", "old"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.NameDocumentVersion(d.ID, "Keep me"); err != nil {
		t.Fatal(err)
	}
	advance(r, versionRetention+time.Hour)
	if _, err := r.SaveDocument(d.ID, sampleData, "", "new"); err != nil {
		t.Fatal(err)
	}
	if got := kinds(listVersions(t, r, d.ID)); !equalStrings(got, []string{VersionAuto, VersionNamed, VersionCreated}) {
		t.Fatalf("kinds = %v, want the old autosave gone and the rest kept", got)
	}
}

func TestDeletingADocumentDeletesItsVersions(t *testing.T) {
	r := newTestRepo(t)
	d := mustCreateDocument(t, r, DocumentResume, "Backend")
	version := listVersions(t, r, d.ID)[0]
	if err := r.DeleteDocumentForever(d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetDocumentVersion(version.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}
