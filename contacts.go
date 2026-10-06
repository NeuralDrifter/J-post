package main

import (
	"errors"
	"strings"
)

type Contact struct {
	ID          string `json:"id"`
	JobID       string `json:"jobId"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	LinkedInURL string `json:"linkedinUrl"`
	Notes       string `json:"notes"`
}

func (r *Repo) ListContacts(jobID string) ([]Contact, error) {
	return queryAll(r.db, scanContact, `SELECT id, job_id, name, role, email, phone, linkedin_url, notes
		FROM contacts WHERE job_id = ? ORDER BY name COLLATE NOCASE`, jobID)
}

func scanContact(s rowScanner) (Contact, error) {
	var c Contact
	err := s.Scan(&c.ID, &c.JobID, &c.Name, &c.Role, &c.Email, &c.Phone, &c.LinkedInURL, &c.Notes)
	return c, err
}

func (r *Repo) SaveContact(c Contact) (Contact, error) {
	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" {
		return c, errors.New("contact name is required")
	}
	if c.ID == "" {
		if _, err := r.GetJob(c.JobID); err != nil {
			return c, err
		}
		c.ID = newID()
		_, err := r.db.Exec(`INSERT INTO contacts (id, job_id, name, role, email, phone, linkedin_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			c.ID, c.JobID, c.Name, c.Role, c.Email, c.Phone, c.LinkedInURL, c.Notes)
		return c, err
	}
	res, err := r.db.Exec(`UPDATE contacts SET name = ?, role = ?, email = ?, phone = ?, linkedin_url = ?, notes = ? WHERE id = ?`,
		c.Name, c.Role, c.Email, c.Phone, c.LinkedInURL, c.Notes, c.ID)
	return c, expectOneRow(res, err, "contact", c.ID)
}

func (r *Repo) DeleteContact(id string) error {
	res, err := r.db.Exec(`DELETE FROM contacts WHERE id = ?`, id)
	return expectOneRow(res, err, "contact", id)
}
