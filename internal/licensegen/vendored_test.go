// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package licensegen

import (
	"strings"
	"testing"
)

const demoUpstream = `# Demo (vendored)

Name: Demo Project
Upstream: https://example.com/demo
Commit: abc1234def5678 (2026-01-01)
License: MIT
`

func TestCollectVendoredReadsLicenseAndUpstream(t *testing.T) {
	root := writeTree(t, map[string]string{
		"demo/LICENSE":     mitText,
		"demo/UPSTREAM.md": demoUpstream,
		"demo/src/a.ts":    "export {}",
	})
	entries, err := CollectVendored(root)
	if err != nil {
		t.Fatal(err)
	}
	want := Entry{Name: "Demo Project", Version: "abc1234", License: "MIT", URL: "https://example.com/demo", Text: mitText}
	if len(entries) != 1 || entries[0] != want {
		t.Fatalf("entries = %+v, want [%+v]", entries, want)
	}
}

func TestCollectVendoredIgnoresLooseFiles(t *testing.T) {
	root := writeTree(t, map[string]string{"vitest.setup.ts": "", "demo/LICENSE": mitText, "demo/UPSTREAM.md": demoUpstream})
	entries, err := CollectVendored(root)
	if err != nil || len(entries) != 1 {
		t.Fatalf("entries = %+v, err = %v", entries, err)
	}
}

func TestCollectVendoredNeedsUpstreamFile(t *testing.T) {
	root := writeTree(t, map[string]string{"demo/LICENSE": mitText})
	_, err := CollectVendored(root)
	if err == nil || !strings.Contains(err.Error(), "demo") || !strings.Contains(err.Error(), "UPSTREAM.md") {
		t.Fatalf("err = %v, want one naming demo and UPSTREAM.md", err)
	}
}

func TestCollectVendoredNeedsLicense(t *testing.T) {
	root := writeTree(t, map[string]string{"demo/UPSTREAM.md": demoUpstream})
	_, err := CollectVendored(root)
	if err == nil || !strings.Contains(err.Error(), "demo") || !strings.Contains(err.Error(), "license") {
		t.Fatalf("err = %v, want one naming demo and its license", err)
	}
}

func TestCollectVendoredNeedsEveryUpstreamField(t *testing.T) {
	root := writeTree(t, map[string]string{"demo/LICENSE": mitText, "demo/UPSTREAM.md": "Name: Demo\nCommit: abc1234\n"})
	_, err := CollectVendored(root)
	if err == nil || !strings.Contains(err.Error(), "Upstream:") {
		t.Fatalf("err = %v, want one naming the missing Upstream: line", err)
	}
}

func TestCollectVendoredWithoutVendorFolder(t *testing.T) {
	entries, err := CollectVendored(t.TempDir() + "/missing")
	if err != nil || len(entries) != 0 {
		t.Fatalf("entries = %+v, err = %v; want none and no error", entries, err)
	}
}
