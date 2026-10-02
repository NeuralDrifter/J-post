package main

import (
	"archive/zip"
	"os"
	"path/filepath"
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
