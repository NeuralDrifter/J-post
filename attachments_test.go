package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writeTemp(t *testing.T, name, content string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestAttachmentDuplicateNamesWithSpaces(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	first := writeTemp(t, "My Résumé v2.pdf", "one")
	second := writeTemp(t, "My Résumé v2.pdf", "two")

	a, err := r.AddAttachment(j.ID, first, "")
	if err != nil {
		t.Fatal(err)
	}
	b, err := r.AddAttachment(j.ID, second, "Tailored resume")
	if err != nil {
		t.Fatal(err)
	}
	if a.Label != "My Résumé v2.pdf" || b.Label != "Tailored resume" || a.StoredPath == b.StoredPath {
		t.Fatalf("a=%+v b=%+v", a, b)
	}
	for path, want := range map[string]string{a.StoredPath: "one", b.StoredPath: "two"} {
		got, err := os.ReadFile(path)
		if err != nil || string(got) != want {
			t.Fatalf("%s = %q, %v", path, got, err)
		}
	}
	list, _ := r.ListAttachments(j.ID)
	if len(list) != 2 {
		t.Fatalf("list = %+v", list)
	}
	if err := r.DeleteAttachment(a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.StoredPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("file not removed: %v", err)
	}
}

func TestAttachmentToMissingJobLeavesNoFile(t *testing.T) {
	r := newTestRepo(t)
	src := writeTemp(t, "cv.pdf", "x")
	if _, err := r.AddAttachment("nope", src, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(r.filesDir, "nope")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("directory created for missing job")
	}
}

func TestDeleteJobRemovesFiles(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	a, err := r.AddAttachment(j.ID, writeTemp(t, "cv.pdf", "x"), "")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.DeleteJob(j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.StoredPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("attachment survived job delete")
	}
}
