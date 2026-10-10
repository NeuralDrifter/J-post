// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAtsReportRoundTripAndReplace(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	if got, err := r.GetAtsReport(job.ID); err != nil || got != nil {
		t.Fatalf("before any check: %+v, %v", got, err)
	}
	if err := r.SaveAtsReport(job.ID, `{"score":71}`, "Backend resume"); err != nil {
		t.Fatal(err)
	}
	setNow(r, 2026, time.October, 2, 9)
	if err := r.SaveAtsReport(job.ID, `{"score":88}`, "Backend · Acme"); err != nil {
		t.Fatal(err)
	}
	got, err := r.GetAtsReport(job.ID)
	if err != nil || got == nil || got.Report != `{"score":88}` || got.Source != "Backend · Acme" || got.CheckedAt == "" {
		t.Fatalf("report = %+v, %v", got, err)
	}
}

func TestAtsReportRejectsBadInput(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	if err := r.SaveAtsReport(job.ID, "not json", "x"); err == nil {
		t.Error("invalid JSON saved")
	}
	if err := r.SaveAtsReport(job.ID, `"`+strings.Repeat("a", maxAtsReportBytes)+`"`, "x"); err == nil {
		t.Error("oversized report saved")
	}
	if err := r.SaveAtsReport("missing", `{}`, "x"); err == nil {
		t.Error("report saved for a missing job")
	}
}

func TestAtsReportGoesWithItsJob(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	r.SaveAtsReport(job.ID, `{}`, "x")
	if err := r.DeleteJob(job.ID); err != nil {
		t.Fatal(err)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM ats_reports`).Scan(&rows)
	if rows != 0 {
		t.Fatalf("rows = %d after deleting the job", rows)
	}
}

func TestReadAttachmentReturnsTheStoredBytes(t *testing.T) {
	r := newTestRepo(t)
	job := mustCreateJob(t, r)
	src := filepath.Join(t.TempDir(), "cv.pdf")
	os.WriteFile(src, []byte("%PDF-1.7 hello"), 0o644)
	att, err := r.AddAttachment(job.ID, src, "")
	if err != nil {
		t.Fatal(err)
	}
	got, err := r.ReadAttachment(att.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes, _ := base64.StdEncoding.DecodeString(got); string(bytes) != "%PDF-1.7 hello" {
		t.Fatalf("bytes = %q", bytes)
	}
}
