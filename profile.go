package main

import (
	"archive/zip"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strings"

	"github.com/ledongthuc/pdf"
)

// Profile holds the user's resume. Every AI feature reads ResumeText, which the
// user can review and correct in Settings.
type Profile struct {
	ResumeFileName string `json:"resumeFileName"`
	ResumePath     string `json:"resumePath"`
	ResumeText     string `json:"resumeText"`
	UpdatedAt      string `json:"updatedAt"`
}

func (r *Repo) GetProfile() (Profile, error) {
	var p Profile
	err := r.db.QueryRow(`SELECT resume_file_name, resume_path, resume_text, updated_at FROM profile WHERE id = 1`).
		Scan(&p.ResumeFileName, &p.ResumePath, &p.ResumeText, &p.UpdatedAt)
	return p, err
}

func (r *Repo) SaveResume(fileName, storedPath, text string) error {
	_, err := r.db.Exec(`UPDATE profile SET resume_file_name = ?, resume_path = ?, resume_text = ?, updated_at = ? WHERE id = 1`,
		fileName, storedPath, strings.TrimSpace(text), ts(r.now()))
	return err
}

func (r *Repo) UpdateResumeText(text string) error {
	_, err := r.db.Exec(`UPDATE profile SET resume_text = ?, updated_at = ? WHERE id = 1`, strings.TrimSpace(text), ts(r.now()))
	return err
}

// extractDocxText reads the paragraphs of a Word document (word/document.xml).
func extractDocxText(path string) (string, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return "", fmt.Errorf("not a readable .docx file: %v", err)
	}
	defer zr.Close()
	for _, f := range zr.File {
		if f.Name != "word/document.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		defer rc.Close()
		return docxXMLText(rc)
	}
	return "", errors.New("the .docx file has no document body")
}

func docxXMLText(r io.Reader) (string, error) {
	dec := xml.NewDecoder(r)
	var b strings.Builder
	inText := false
	for {
		tok, err := dec.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "t":
				inText = true
			case "tab":
				b.WriteString("\t")
			case "br":
				b.WriteString("\n")
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				b.WriteString("\n")
			}
		case xml.CharData:
			if inText {
				b.Write(t)
			}
		}
	}
	return strings.TrimSpace(b.String()), nil
}

// extractPDFText reads a PDF's text layer locally (nothing is uploaded),
// rebuilding lines top-to-bottom from the positioned text runs.
func extractPDFText(path string) (string, error) {
	f, r, err := pdf.Open(path)
	if err != nil {
		return "", fmt.Errorf("not a readable PDF: %v", err)
	}
	defer f.Close()
	var lines []string
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		lines = append(lines, pdfPageLines(page.Content().Text)...)
		lines = append(lines, "") // blank line between pages
	}
	text := tidyText(strings.Join(lines, "\n"))
	if len(text) < 20 {
		return "", errors.New("this PDF has no readable text (it may be a scanned image). Copy the text from your resume and paste it into the Resume box instead")
	}
	return text, nil
}

// pdfPageLines groups positioned glyphs into lines by their baseline (top to
// bottom), keeping reading order within a line. GetTextByRow isn't used because
// it loses positions for some PDFs (e.g. standard fonts without width tables).
func pdfPageLines(glyphs []pdf.Text) []string {
	type row struct {
		y      float64
		glyphs []pdf.Text
	}
	var rows []*row
	byY := map[int64]*row{}
	for _, g := range glyphs {
		key := int64(math.Round(g.Y))
		r, ok := byY[key]
		if !ok {
			r = &row{y: g.Y}
			byY[key] = r
			rows = append(rows, r)
		}
		r.glyphs = append(r.glyphs, g)
	}
	sort.SliceStable(rows, func(a, b int) bool { return rows[a].y > rows[b].y })
	var lines []string
	for _, r := range rows {
		sort.SliceStable(r.glyphs, func(a, b int) bool { return r.glyphs[a].X < r.glyphs[b].X })
		var b strings.Builder
		for i, g := range r.glyphs {
			// Add a space where the layout leaves a word-sized gap without a space glyph.
			if i > 0 {
				prev := r.glyphs[i-1]
				if prev.W > 0 && g.X-(prev.X+prev.W) > g.FontSize*0.2 && prev.S != " " && g.S != " " {
					b.WriteByte(' ')
				}
			}
			b.WriteString(g.S)
		}
		if line := strings.TrimSpace(innerSpaceRun.ReplaceAllString(b.String(), " ")); line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}
