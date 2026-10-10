// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Package resumes serves what the resume builder needs from the Go side.
package resumes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"time"

	"jobtrack/internal/httpapi"
)

// FontPath is where the frontend asks for a font: FontPath?src=<font file URL>.
const FontPath = "/rr-fonts"

const fontDownloadTimeout = 60 * time.Second

var fontContentTypes = map[string]string{".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}

// FontCache downloads the web fonts resume templates use, once, and serves
// them from disk afterwards, so PDFs render offline once a font has been used.
// It fetches only the font files listed in Reactive Resume's font catalogue.
type FontCache struct {
	dir     string
	allowed map[string]bool
}

// NewFontCache keeps fonts in dir. fontList is the catalogue
// (webfontlist.json): an array of families, each with a "files" map of URLs.
func NewFontCache(dir string, fontList []byte) (*FontCache, error) {
	var families []struct {
		Files map[string]string `json:"files"`
	}
	if err := json.Unmarshal(fontList, &families); err != nil {
		return nil, fmt.Errorf("font catalogue: %w", err)
	}
	allowed := map[string]bool{}
	for _, family := range families {
		for _, url := range family.Files {
			allowed[url] = true
		}
	}
	return &FontCache{dir: dir, allowed: allowed}, nil
}

// Middleware answers font requests and passes everything else to next.
func (c *FontCache) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != FontPath {
			next.ServeHTTP(w, r)
			return
		}
		c.serveFont(w, r)
	})
}

func (c *FontCache) serveFont(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "fonts are read-only", http.StatusMethodNotAllowed)
		return
	}
	src := r.URL.Query().Get("src")
	if !c.allowed[src] {
		http.NotFound(w, r)
		return
	}
	font, err := c.font(r.Context(), src)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", fontContentTypes[path.Ext(src)])
	w.Header().Set("Cache-Control", "max-age=31536000, immutable")
	w.Write(font)
}

// font returns the cached file for src, downloading it on first use.
func (c *FontCache) font(ctx context.Context, src string) ([]byte, error) {
	file := c.cachePath(src)
	if cached, err := os.ReadFile(file); err == nil {
		return cached, nil
	}
	font, err := download(ctx, src)
	if err != nil {
		return nil, err
	}
	return font, writeAtomically(file, font)
}

// cachePath names a font by the hash of its URL, so no part of a request
// becomes a path on disk.
func (c *FontCache) cachePath(src string) string {
	sum := sha256.Sum256([]byte(src))
	return filepath.Join(c.dir, hex.EncodeToString(sum[:])+path.Ext(src))
}

func download(ctx context.Context, src string) ([]byte, error) {
	resp, err := httpapi.Request{Source: "Font download", URL: src, Headers: map[string]string{"Accept": "*/*"}, Timeout: fontDownloadTimeout}.Send(ctx)
	if err != nil {
		return nil, err
	}
	if resp.Status != http.StatusOK {
		return nil, fmt.Errorf("font download failed: HTTP %d", resp.Status)
	}
	return resp.Body, nil
}

// writeAtomically writes through a temp file, so a half-written font is never served.
func writeAtomically(file string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(file), "font-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), file)
}
