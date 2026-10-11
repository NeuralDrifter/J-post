// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import "fmt"

// SetLetterSource names the resume a letter follows ("" for none) and whether
// its sender details and its design come from that resume. The letter keeps
// its own copy too; the frontend refreshes the copy from the resume.
func (r *Repo) SetLetterSource(letterID, resumeID string, senderLinked, designLinked bool) error {
	if err := r.requireDocumentKind(letterID, DocumentLetter); err != nil {
		return err
	}
	if err := r.requireDocumentKind(resumeID, DocumentResume); err != nil {
		return err
	}
	if resumeID == "" && (senderLinked || designLinked) {
		return fmt.Errorf("letter %s can only follow a resume it names", letterID)
	}
	res, err := r.db.Exec(`UPDATE documents SET source_id = ?, sender_linked = ?, design_linked = ? WHERE id = ?`, resumeID, senderLinked, designLinked, letterID)
	return expectOneRow(res, err, "letter", letterID)
}
