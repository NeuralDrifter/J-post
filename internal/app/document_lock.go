// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"fmt"
)

// ErrDocumentLocked is returned for a change to a locked document.
var ErrDocumentLocked = errors.New("the document is locked; unlock it to edit")

// SetDocumentLocked locks or unlocks a document. A locked document can still be
// read, exported, copied and given named versions; it can't be edited, renamed,
// moved to Trash or restored to an older version. Locking isn't an edit, so the
// document keeps its last-edited time.
func (r *Repo) SetDocumentLocked(id string, locked bool) error {
	res, err := r.db.Exec(`UPDATE documents SET locked = ? WHERE id = ?`, locked, id)
	return expectOneRow(res, err, "document", id)
}

// requireUnlocked fails for a locked document (and a missing one).
func (r *Repo) requireUnlocked(id string) error {
	doc, err := r.GetDocument(id)
	if err != nil {
		return err
	}
	if doc.Locked {
		return lockedError(id)
	}
	return nil
}

func lockedError(id string) error {
	return fmt.Errorf("document %s: %w", id, ErrDocumentLocked)
}
