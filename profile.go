package main

import (
	"archive/zip"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
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
