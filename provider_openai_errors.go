// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"

	"github.com/openai/openai-go/v3"

	"jobtrack/internal/gemini"
	"jobtrack/internal/textproc"
)

// openAIError turns a failed request into a short, readable message that
// never contains the key.
func openAIError(err error, p openAIPreset, c openAIConn) error {
	label := p.label
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("%s took too long to answer", label)
	}
	var apiErr *openai.Error
	if !errors.As(err, &apiErr) {
		var netErr *net.OpError
		if errors.As(err, &netErr) {
			if p.localApp != "" {
				return fmt.Errorf("%s isn't running at %s", p.localApp, c.baseURL)
			}
			return fmt.Errorf("Couldn't reach %s at %s", label, c.baseURL)
		}
		return fmt.Errorf("Couldn't reach %s: %s", label, scrubKey(err.Error(), c.key))
	}
	message := openAIErrorMessage(apiErr)
	lower := strings.ToLower(message)
	switch status := apiErr.StatusCode; {
	case (status == http.StatusUnauthorized || status == http.StatusForbidden) && c.key == "":
		return fmt.Errorf("%s needs an API token: add it in Settings → AI, or turn off authentication in %s", label, cmp.Or(p.localApp, "the server"))
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return fmt.Errorf("%s rejected the API key", label)
	case status == http.StatusPaymentRequired || strings.Contains(lower, "insufficient balance") || strings.Contains(lower, "insufficient_quota"):
		return fmt.Errorf("%s says the account is out of credit", label)
	case status == http.StatusTooManyRequests:
		if wait := apiErr.Response.Header.Get("retry-after"); wait != "" {
			return fmt.Errorf("%s is rate limiting requests — try again in %s s", label, wait)
		}
		return fmt.Errorf("%s is rate limiting requests", label)
	case status >= 500:
		return fmt.Errorf("%s is unavailable right now", label)
	case strings.Contains(lower, "model") && (status == http.StatusNotFound || strings.Contains(lower, "not exist") || strings.Contains(lower, "not found")):
		return fmt.Errorf("%s doesn't have the model %s", label, c.model)
	case strings.Contains(lower, "response_format"):
		return fmt.Errorf("%s doesn't accept this answer mode; set the mode to plain in Settings → AI", label)
	default:
		return fmt.Errorf("%s error %d: %s", label, status, textproc.Truncate(scrubKey(message, c.key), 300))
	}
}

// openAIErrorMessage is the server's own explanation: error.message in
// OpenAI's format, or a top-level message/detail from other servers.
func openAIErrorMessage(apiErr *openai.Error) string {
	if apiErr.Message != "" {
		return apiErr.Message
	}
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
		Detail  string `json:"detail"`
	}
	if json.Unmarshal([]byte(apiErr.RawJSON()), &body) == nil {
		for _, m := range []string{body.Error.Message, body.Message, body.Detail} {
			if m != "" {
				return m
			}
		}
	}
	return http.StatusText(apiErr.StatusCode)
}

// scrubKey hides key in text; an empty key (Ollama) leaves text alone.
func scrubKey(text, key string) string {
	if key == "" {
		return text
	}
	return gemini.HideKey(text, key)
}
