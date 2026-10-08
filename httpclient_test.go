// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestAPIRequestUnreachableHidesURL(t *testing.T) {
	_, err := apiRequest{source: "Example", url: "http://127.0.0.1:1/search?key=s3cret"}.send(context.Background())
	if err == nil || strings.Contains(err.Error(), "s3cret") || !strings.Contains(err.Error(), "could not reach Example") {
		t.Fatalf("err = %v", err)
	}
}

func TestAPIRequestTimeout(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	})
	_, err := apiRequest{source: "Example", url: url + "?key=s3cret", timeout: 20 * time.Millisecond}.send(context.Background())
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
	resp, err := apiRequest{source: "Example", url: url, headers: map[string]string{"X-Test": "yes"}}.send(context.Background())
	if err != nil || resp.status != http.StatusTeapot || string(resp.body) != "short and stout" || resp.header.Get("X-RateLimit-Remaining") != "7" {
		t.Fatalf("resp = %+v, err = %v", resp, err)
	}
}
