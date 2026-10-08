// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"archive/zip"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeDocx(t *testing.T, documentXML string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "resume.docx")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	w, _ := zw.Create("word/document.xml")
	w.Write([]byte(documentXML))
	zw.Close()
	f.Close()
	return p
}

func TestExtractDocxText(t *testing.T) {
	p := writeDocx(t, `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
		<w:p><w:r><w:t>Jane Doe</w:t></w:r></w:p>
		<w:p><w:r><w:t xml:space="preserve">Senior </w:t></w:r><w:r><w:t>Engineer &amp; Lead</w:t></w:r></w:p>
		<w:p><w:r><w:t>Go</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Rust</w:t></w:r></w:p>
	</w:body></w:document>`)
	got, err := extractDocxText(p)
	if err != nil || got != "Jane Doe\nSenior Engineer & Lead\nGo\tRust" {
		t.Fatalf("got %q, %v", got, err)
	}
	if _, err := extractDocxText(writeTemp(t, "not.docx", "plain text")); err == nil {
		t.Fatal("a non-zip file should error")
	}
}

func TestProfileResume(t *testing.T) {
	r := newTestRepo(t)
	p, err := r.GetProfile()
	if err != nil || p.ResumeText != "" {
		t.Fatalf("empty profile = %+v, %v", p, err)
	}
	if err := r.SaveResume("cv.pdf", `C:\data\resume\cv.pdf`, "# Jane\n- Go"); err != nil {
		t.Fatal(err)
	}
	if err := r.UpdateResumeText("# Jane Doe\n- Go, Rust"); err != nil {
		t.Fatal(err)
	}
	p, _ = r.GetProfile()
	if p.ResumeFileName != "cv.pdf" || p.ResumeText != "# Jane Doe\n- Go, Rust" || p.UpdatedAt == "" {
		t.Fatalf("profile = %+v", p)
	}
}

// writeMinimalPDF builds a tiny valid PDF with one text line per entry (Helvetica, 16pt spacing).
func writeMinimalPDF(t *testing.T, lines ...string) string {
	t.Helper()
	var content strings.Builder
	content.WriteString("BT /F1 12 Tf 72 720 Td ")
	for i, l := range lines {
		if i > 0 {
			content.WriteString("0 -16 Td ")
		}
		fmt.Fprintf(&content, "(%s) Tj ", l)
	}
	content.WriteString("ET")
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", content.Len(), content.String()),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	var b strings.Builder
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects))
	for i, o := range objects {
		offsets[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, off := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return writeTemp(t, "resume.pdf", b.String())
}

func TestExtractPDFText(t *testing.T) {
	p := writeMinimalPDF(t, "Jane Doe", "Senior Engineer at Brex", "Skills: Go, Rust, SQL and distributed systems")
	got, err := extractPDFText(p)
	if err != nil {
		t.Fatal(err)
	}
	want := "Jane Doe\nSenior Engineer at Brex\nSkills: Go, Rust, SQL and distributed systems"
	if got != want {
		t.Fatalf("got %q\nwant %q", got, want)
	}
}

func TestExtractPDFTextScanned(t *testing.T) {
	// A PDF with no text layer (like a scan) gives a clear error, not an empty resume.
	p := writeMinimalPDF(t)
	if _, err := extractPDFText(p); err == nil || !strings.Contains(err.Error(), "paste") {
		t.Fatalf("err = %v", err)
	}
	if _, err := extractPDFText(writeTemp(t, "bad.pdf", "not a pdf")); err == nil {
		t.Fatal("a broken file should error")
	}
}

func TestExtractResumeText(t *testing.T) {
	dir := t.TempDir()
	txt := filepath.Join(dir, "cv.md")
	os.WriteFile(txt, []byte("  # Jane Doe\nGo developer  "), 0o644)
	if got, err := extractResumeText(txt); err != nil || got != "  # Jane Doe\nGo developer  " {
		t.Fatalf("got %q, %v", got, err)
	}
	blank := filepath.Join(dir, "blank.txt")
	os.WriteFile(blank, []byte(" \n "), 0o644)
	if _, err := extractResumeText(blank); err == nil || !strings.Contains(err.Error(), "no text") {
		t.Fatalf("blank err = %v", err)
	}
	if _, err := extractResumeText(filepath.Join(dir, "cv.rtf")); err == nil || !strings.Contains(err.Error(), "PDF") {
		t.Fatalf("unsupported err = %v", err)
	}
}
