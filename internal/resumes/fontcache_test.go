// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package resumes

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
)

const fontBytes = "\x00\x01\x00\x00fake-ttf"

// fontServer serves fontBytes at /inter-400.ttf and fails at /broken.ttf, counting requests.
func fontServer(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.URL.Path == "/broken.ttf" {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		w.Write([]byte(fontBytes))
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

func newTestCache(t *testing.T, base string) (*FontCache, string) {
	t.Helper()
	dir := t.TempDir()
	list := fmt.Sprintf(`[{"family":"Inter","files":{"400":"%[1]s/inter-400.ttf","700":"%[1]s/broken.ttf"}}]`, base)
	cache, err := NewFontCache(dir, []byte(list))
	if err != nil {
		t.Fatal(err)
	}
	return cache, dir
}

func fetchFont(cache *FontCache, method, src string) *httptest.ResponseRecorder {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTeapot) })
	rec := httptest.NewRecorder()
	cache.Middleware(next).ServeHTTP(rec, httptest.NewRequest(method, FontPath+"?src="+url.QueryEscape(src), nil))
	return rec
}

func TestFontCacheDownloadsListedFontOnce(t *testing.T) {
	srv, hits := fontServer(t)
	cache, dir := newTestCache(t, srv.URL)
	src := srv.URL + "/inter-400.ttf"

	first := fetchFont(cache, http.MethodGet, src)
	if first.Code != http.StatusOK || first.Body.String() != fontBytes || first.Header().Get("Content-Type") != "font/ttf" {
		t.Fatalf("first = %d %q %q", first.Code, first.Body.String(), first.Header().Get("Content-Type"))
	}
	if files, _ := os.ReadDir(dir); len(files) != 1 {
		t.Fatalf("cache folder has %d files, want 1", len(files))
	}

	srv.Close()
	second := fetchFont(cache, http.MethodGet, src)
	if second.Code != http.StatusOK || second.Body.String() != fontBytes || hits.Load() != 1 {
		t.Fatalf("second = %d, upstream hits = %d", second.Code, hits.Load())
	}
}

func TestFontCacheRefusesUnlistedURLs(t *testing.T) {
	srv, hits := fontServer(t)
	cache, dir := newTestCache(t, srv.URL)
	for _, src := range []string{
		srv.URL + "/other.ttf",
		srv.URL + "/inter-400.ttf/../other.ttf",
		"file:///C:/Windows/win.ini",
		"",
	} {
		if rec := fetchFont(cache, http.MethodGet, src); rec.Code != http.StatusNotFound {
			t.Errorf("%q: status %d, want 404", src, rec.Code)
		}
	}
	if hits.Load() != 0 {
		t.Errorf("upstream hit %d times for unlisted fonts", hits.Load())
	}
	if files, _ := os.ReadDir(dir); len(files) != 0 {
		t.Errorf("cache folder has %d files", len(files))
	}
}

func TestFontCacheUpstreamFailureIsNotCached(t *testing.T) {
	srv, _ := fontServer(t)
	cache, dir := newTestCache(t, srv.URL)
	if rec := fetchFont(cache, http.MethodGet, srv.URL+"/broken.ttf"); rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", rec.Code)
	}
	if files, _ := os.ReadDir(dir); len(files) != 0 {
		t.Errorf("cache folder has %d files after a failure", len(files))
	}
}

func TestFontCacheOnlyAnswersGET(t *testing.T) {
	srv, _ := fontServer(t)
	cache, _ := newTestCache(t, srv.URL)
	if rec := fetchFont(cache, http.MethodPost, srv.URL+"/inter-400.ttf"); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d, want 405", rec.Code)
	}
}

func TestFontCachePassesOtherPathsThrough(t *testing.T) {
	cache, _ := newTestCache(t, "https://example.com")
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTeapot) })
	rec := httptest.NewRecorder()
	cache.Middleware(next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/index.html", nil))
	if rec.Code != http.StatusTeapot {
		t.Fatalf("status %d, want the next handler's 418", rec.Code)
	}
}

func TestNewFontCacheRejectsBadList(t *testing.T) {
	if _, err := NewFontCache(t.TempDir(), []byte("not json")); err == nil {
		t.Fatal("no error for a malformed font list")
	}
}

func TestFontCacheServesListedPreviews(t *testing.T) {
	srv, _ := fontServer(t)
	list := fmt.Sprintf(`[{"family":"Inter","preview":"%[1]s/inter-preview.ttf","files":{"400":"%[1]s/inter-400.ttf"}}]`, srv.URL)
	cache, err := NewFontCache(t.TempDir(), []byte(list))
	if err != nil {
		t.Fatal(err)
	}
	if rec := fetchFont(cache, http.MethodGet, srv.URL+"/inter-preview.ttf"); rec.Code != http.StatusOK {
		t.Fatalf("preview = %d", rec.Code)
	}
}
