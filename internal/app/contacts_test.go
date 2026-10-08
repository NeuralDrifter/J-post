// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"testing"
)

func TestContactCRUD(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	c, err := r.SaveContact(Contact{JobID: j.ID, Name: " Maya Lin ", Role: "Recruiter", Email: "maya@acme.test"})
	if err != nil || c.ID == "" || c.Name != "Maya Lin" {
		t.Fatalf("insert: %+v %v", c, err)
	}
	c.Role = "Senior Recruiter"
	if _, err := r.SaveContact(c); err != nil {
		t.Fatal(err)
	}
	list, _ := r.ListContacts(j.ID)
	if len(list) != 1 || list[0].Role != "Senior Recruiter" {
		t.Fatalf("list = %+v", list)
	}
	if err := r.DeleteContact(c.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := r.ListContacts(j.ID); list == nil || len(list) != 0 {
		t.Fatalf("after delete = %#v", list)
	}
}

func TestContactValidation(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if _, err := r.SaveContact(Contact{JobID: j.ID, Name: "  "}); err == nil {
		t.Fatal("expected name error")
	}
	if _, err := r.SaveContact(Contact{JobID: "nope", Name: "X"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	if _, err := r.SaveContact(Contact{ID: "nope", JobID: j.ID, Name: "X"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing err = %v", err)
	}
}
