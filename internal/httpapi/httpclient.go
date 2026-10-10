// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package httpapi

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"jobtrack/internal/textproc"
)

// Every call to an outside HTTP API (job boards, Gemini) goes through
// Request.Send, so the rule "never put a request URL in an error" lives here.
var (
	apiTimeout   = 30 * time.Second
	apiUserAgent = "JobTrack/1.0 (personal job tracker)"
)

const maxResponseBytes = 32 << 20

type Request struct {
	Source  string // shown in errors, e.g. "Adzuna"
	Method  string // GET when empty
	URL     string // may contain an API key
	Headers map[string]string
	Body    []byte
	Timeout time.Duration // apiTimeout when zero
	Client  *http.Client  // http.DefaultClient when nil; e.g. one whose dialer refuses local addresses
}

type Response struct {
	Status int
	Header http.Header
	Body   []byte
}

// Send performs the request. It fails only when no complete response arrives;
// any HTTP status is returned for the caller to judge.
func (r Request) Send(ctx context.Context) (Response, error) {
	timeout := cmp.Or(r.Timeout, apiTimeout)
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var body io.Reader
	if r.Body != nil {
		body = bytes.NewReader(r.Body)
	}
	req, err := http.NewRequestWithContext(ctx, cmp.Or(r.Method, http.MethodGet), r.URL, body)
	if err != nil {
		return Response{}, fmt.Errorf("could not build %s request", r.Source)
	}
	req.Header.Set("User-Agent", apiUserAgent)
	req.Header.Set("Accept", "application/json")
	for k, v := range r.Headers {
		req.Header.Set(k, v)
	}
	resp, err := cmp.Or(r.Client, http.DefaultClient).Do(req)
	if err != nil {
		return Response{}, transportError(ctx, r.Source, timeout, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return Response{}, transportError(ctx, r.Source, timeout, err)
	}
	return Response{Status: resp.StatusCode, Header: resp.Header, Body: raw}, nil
}

// transportError explains a request that got no response. *url.Error is
// unwrapped because its message includes the request URL, which may hold an API key.
func transportError(ctx context.Context, source string, timeout time.Duration, err error) error {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return fmt.Errorf("%s timed out after %s", source, timeout)
	}
	var uerr *url.Error
	if errors.As(err, &uerr) {
		err = uerr.Err
	}
	return fmt.Errorf("could not reach %s: %v", source, err)
}

// GetJSON sends a request, requires 200 OK and decodes the JSON body into out.
// It returns the response headers for callers that read rate-limit info.
func GetJSON(ctx context.Context, r Request, out any) (http.Header, error) {
	resp, err := r.Send(ctx)
	if err != nil {
		return nil, err
	}
	if resp.Status != http.StatusOK {
		return nil, errors.New(ErrorMessage(r.Source, resp.Status, resp.Body))
	}
	if err := json.Unmarshal(resp.Body, out); err != nil {
		return nil, fmt.Errorf("unexpected %s response: %v", r.Source, err)
	}
	return resp.Header, nil
}

// ErrorMessage turns a failed response into a short, readable message.
// Many sites answer outages with an HTML page, which is useless in a toast.
func ErrorMessage(source string, status int, body []byte) string {
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return fmt.Sprintf("%s rejected the API key (%d). Check it in Settings.", source, status)
	case status == http.StatusTooManyRequests:
		return fmt.Sprintf("%s is rate-limiting requests (%d). Try again later.", source, status)
	case status >= 500:
		return fmt.Sprintf("%s is temporarily unavailable (%d). Try again later.", source, status)
	}
	text := strings.TrimSpace(string(body))
	lower := strings.ToLower(textproc.FirstN(text, 200))
	if text == "" || strings.HasPrefix(lower, "<!doctype") || strings.HasPrefix(lower, "<html") || strings.Contains(lower, "<head") {
		return fmt.Sprintf("%s returned an error (%d).", source, status)
	}
	return fmt.Sprintf("%s error %d: %s", source, status, textproc.Truncate(text, 200))
}
