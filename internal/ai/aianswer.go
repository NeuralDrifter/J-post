// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Reading a structured answer from a model that may not follow instructions
// exactly: some wrap the JSON in a code fence or a sentence whatever the
// prompt says. (Approach from Reactive Resume's generate-json.ts.)

var (
	errEmptyAnswer = errors.New("the answer was empty")
	errNoJSON      = errors.New("the answer had no json object")
	fenceRe        = regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```")
)

// extractJSON pulls the outermost {…} out of text, inside a code fence if
// there is one, and checks it is valid JSON.
func extractJSON(text string) (json.RawMessage, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errEmptyAnswer
	}
	if m := fenceRe.FindStringSubmatch(text); m != nil {
		text = m[1]
	}
	start, end := strings.IndexByte(text, '{'), strings.LastIndexByte(text, '}')
	if start == -1 || end < start {
		return nil, errNoJSON
	}
	raw := json.RawMessage(text[start : end+1])
	if !json.Valid(raw) {
		var v any
		return nil, fmt.Errorf("the answer wasn't valid json: %v", json.Unmarshal(raw, &v))
	}
	return raw, nil
}

// validateAnswer checks raw against a task's JSON Schema. The error says what
// is wrong, so it can be sent back to the model to correct.
func validateAnswer(raw json.RawMessage, schema map[string]any) error {
	resolved, err := resolveSchema(schema)
	if err != nil {
		return fmt.Errorf("task schema: %v", err)
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	return resolved.Validate(v)
}
