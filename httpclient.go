// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

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
	"time"
)

// Every call to an outside HTTP API (job boards, Gemini) goes through
// apiRequest.send, so the rule "never put a request URL in an error" lives here.
var (
	apiTimeout   = 30 * time.Second
	apiUserAgent = "JobTrack/1.0 (personal job tracker)"
)

const maxResponseBytes = 32 << 20

type apiRequest struct {
	source  string // shown in errors, e.g. "Adzuna"
	method  string // GET when empty
	url     string // may contain an API key
	headers map[string]string
	body    []byte
	timeout time.Duration // apiTimeout when zero
}

type apiResponse struct {
	status int
	header http.Header
	body   []byte
}

// send performs the request. It fails only when no complete response arrives;
// any HTTP status is returned for the caller to judge.
func (r apiRequest) send(ctx context.Context) (apiResponse, error) {
	timeout := cmp.Or(r.timeout, apiTimeout)
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var body io.Reader
	if r.body != nil {
		body = bytes.NewReader(r.body)
	}
	req, err := http.NewRequestWithContext(ctx, cmp.Or(r.method, http.MethodGet), r.url, body)
	if err != nil {
		return apiResponse{}, fmt.Errorf("could not build %s request", r.source)
	}
	req.Header.Set("User-Agent", apiUserAgent)
	req.Header.Set("Accept", "application/json")
	for k, v := range r.headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return apiResponse{}, transportError(ctx, r.source, timeout, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return apiResponse{}, transportError(ctx, r.source, timeout, err)
	}
	return apiResponse{status: resp.StatusCode, header: resp.Header, body: raw}, nil
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

// getJSON sends a request, requires 200 OK and decodes the JSON body into out.
// It returns the response headers for callers that read rate-limit info.
func getJSON(ctx context.Context, r apiRequest, out any) (http.Header, error) {
	resp, err := r.send(ctx)
	if err != nil {
		return nil, err
	}
	if resp.status != http.StatusOK {
		return nil, errors.New(httpErrorMessage(r.source, resp.status, resp.body))
	}
	if err := json.Unmarshal(resp.body, out); err != nil {
		return nil, fmt.Errorf("unexpected %s response: %v", r.source, err)
	}
	return resp.header, nil
}
