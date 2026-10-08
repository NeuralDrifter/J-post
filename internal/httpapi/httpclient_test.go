// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAPIRequestUnreachableHidesURL(t *testing.T) {
	_, err := Request{Source: "Example", URL: "http://127.0.0.1:1/search?key=s3cret"}.Send(context.Background())
	if err == nil || strings.Contains(err.Error(), "s3cret") || !strings.Contains(err.Error(), "could not reach Example") {
		t.Fatalf("err = %v", err)
	}
}

func TestAPIRequestTimeout(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	})
	_, err := Request{Source: "Example", URL: url + "?key=s3cret", Timeout: 20 * time.Millisecond}.Send(context.Background())
	if err == nil || strings.Contains(err.Error(), "s3cret") || !strings.Contains(err.Error(), "Example timed out") {
		t.Fatalf("err = %v", err)
	}
}

func TestAPIRequestReturnsAnyStatus(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Test") != "yes" || r.Header.Get("User-Agent") != apiUserAgent {
			t.Errorf("headers = %v", r.Header)
		}
		w.Header().Set("X-RateLimit-Remaining", "7")
		w.WriteHeader(http.StatusTeapot)
		w.Write([]byte("short and stout"))
	})
	resp, err := Request{Source: "Example", URL: url, Headers: map[string]string{"X-Test": "yes"}}.Send(context.Background())
	if err != nil || resp.Status != http.StatusTeapot || string(resp.Body) != "short and stout" || resp.Header.Get("X-RateLimit-Remaining") != "7" {
		t.Fatalf("resp = %+v, err = %v", resp, err)
	}
}

func TestHTTPErrorMessage(t *testing.T) {
	html := `<!DOCTYPE html> <html> <!-- This file is managed by Chef --> <head><title>Uh oh, something isn't right</title>`
	cases := []struct {
		status int
		body   string
		want   string
	}{
		{503, html, "Adzuna is temporarily unavailable (503). Try again later."},
		{502, "", "Adzuna is temporarily unavailable (502). Try again later."},
		{401, html, "Adzuna rejected the API key (401). Check it in Settings."},
		{403, "", "Adzuna rejected the API key (403). Check it in Settings."},
		{429, html, "Adzuna is rate-limiting requests (429). Try again later."},
		{404, "<html>not found</html>", "Adzuna returned an error (404)."},
		{400, `{"error":"bad where parameter"}`, `Adzuna error 400: {"error":"bad where parameter"}`},
	}
	for _, c := range cases {
		if got := ErrorMessage("Adzuna", c.status, []byte(c.body)); got != c.want {
			t.Errorf("%d: got %q, want %q", c.status, got, c.want)
		}
	}
}

func fakeServer(t *testing.T, handler http.HandlerFunc) string {
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv.URL
}
