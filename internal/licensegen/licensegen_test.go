package licensegen

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const mitText = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction`

// writeTree creates files (path → content) under a temp dir and returns it.
func writeTree(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for path, content := range files {
		full := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestDetectLicense(t *testing.T) {
	cases := map[string]string{
		mitText: "MIT",
		"                                 Apache License\n                           Version 2.0, January 2004": "Apache-2.0",
		"Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n1. ...\n2. ...\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse": "BSD-3-Clause",
		"Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n1. ...\n2. ... THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS":                                                           "BSD-2-Clause",
		"ISC License\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted": "ISC",
		"Mozilla Public License Version 2.0": "MPL-2.0",
		"This is free and unencumbered software released into the public domain.": "Unlicense",
		"SIL OPEN FONT LICENSE Version 1.1":                                         "OFL-1.1",
		"All rights reserved. Do whatever.":                                         "Other",
	}
	for text, want := range cases {
		if got := DetectLicense(text); got != want {
			t.Errorf("DetectLicense(%.40q) = %s, want %s", text, got, want)
		}
	}
}

func TestFindLicenseFileVariants(t *testing.T) {
	for _, name := range []string{"LICENSE", "LICENSE.md", "license", "LICENCE.txt", "COPYING"} {
		dir := writeTree(t, map[string]string{name: mitText, "README.md": "readme"})
		text, ok := FindLicenseText(dir)
		if !ok || !strings.Contains(text, "Permission is hereby granted") {
			t.Errorf("%s: ok=%v text=%.30q", name, ok, text)
		}
	}
	if _, ok := FindLicenseText(writeTree(t, map[string]string{"README.md": "x"})); ok {
		t.Error("a folder without a license file should report ok=false")
	}
}

func TestFindLicenseAppendsNotice(t *testing.T) {
	dir := writeTree(t, map[string]string{"LICENSE": "Apache License\nVersion 2.0", "NOTICE": "Copyright Example Corp"})
	text, _ := FindLicenseText(dir)
	if !strings.Contains(text, "Version 2.0") || !strings.Contains(text, "Copyright Example Corp") {
		t.Fatalf("text = %q", text)
	}
}

// A small frontend: react depends on loose-envify, which depends on js-tokens@4;
// another dependency needs js-tokens@9 nested under it. vite is a dev dependency.
func npmFixture(t *testing.T) string {
	return writeTree(t, map[string]string{
		"frontend/package.json": `{"dependencies": {"react": "^18", "@scope/ui": "^1", "nolicense": "^1"}, "devDependencies": {"vite": "^6", "tailwindcss": "^4"}}`,
		"frontend/node_modules/react/package.json":                          `{"name": "react", "version": "18.3.1", "license": "MIT", "homepage": "https://react.dev/", "dependencies": {"loose-envify": "^1"}}`,
		"frontend/node_modules/react/LICENSE":                               mitText,
		"frontend/node_modules/loose-envify/package.json":                   `{"name": "loose-envify", "version": "1.4.0", "license": "MIT", "repository": "git://github.com/zertosh/loose-envify.git", "dependencies": {"js-tokens": "^4"}}`,
		"frontend/node_modules/loose-envify/LICENSE":                        mitText,
		"frontend/node_modules/js-tokens/package.json":                      `{"name": "js-tokens", "version": "4.0.0", "license": "MIT"}`,
		"frontend/node_modules/js-tokens/LICENSE":                           mitText,
		"frontend/node_modules/@scope/ui/package.json":                      `{"name": "@scope/ui", "version": "1.2.0", "license": "ISC", "repository": {"type": "git", "url": "git+https://github.com/scope/ui.git"}, "dependencies": {"js-tokens": "^9"}}`,
		"frontend/node_modules/@scope/ui/LICENSE":                           "ISC License",
		"frontend/node_modules/@scope/ui/node_modules/js-tokens/package.json": `{"name": "js-tokens", "version": "9.0.1", "license": "MIT"}`,
		"frontend/node_modules/@scope/ui/node_modules/js-tokens/LICENSE":      mitText,
		"frontend/node_modules/nolicense/package.json":                      `{"name": "nolicense", "version": "1.0.0", "license": "MIT"}`,
		"frontend/node_modules/vite/package.json":                           `{"name": "vite", "version": "6.4.3", "license": "MIT"}`,
		"frontend/node_modules/vite/LICENSE.md":                             mitText,
		"frontend/node_modules/tailwindcss/package.json":                    `{"name": "tailwindcss", "version": "4.3.3", "license": "MIT"}`,
		"frontend/node_modules/tailwindcss/LICENSE":                         mitText,
	})
}

func names(entries []Entry) string {
	var out []string
	for _, e := range entries {
		out = append(out, e.Name+"@"+e.Version)
	}
	return strings.Join(out, ",")
}

func TestNpmProductionOnly(t *testing.T) {
	root := npmFixture(t)
	got, err := CollectNpm(filepath.Join(root, "frontend"), "tailwindcss")
	if err != nil {
		t.Fatal(err)
	}
	list := names(got)
	if strings.Contains(list, "vite@") {
		t.Errorf("dev dependency vite listed: %s", list)
	}
	if !strings.Contains(list, "tailwindcss@4.3.3") {
		t.Errorf("extra tailwindcss missing: %s", list)
	}
}

func TestNpmNestedVersions(t *testing.T) {
	got, err := CollectNpm(filepath.Join(npmFixture(t), "frontend"))
	if err != nil {
		t.Fatal(err)
	}
	want := "@scope/ui@1.2.0,js-tokens@4.0.0,js-tokens@9.0.1,loose-envify@1.4.0,nolicense@1.0.0,react@18.3.1"
	if names(got) != want {
		t.Fatalf("entries = %s\nwant      %s", names(got), want)
	}
}

func TestNpmScopedPackageAndURLs(t *testing.T) {
	got, _ := CollectNpm(filepath.Join(npmFixture(t), "frontend"))
	urls := map[string]string{}
	for _, e := range got {
		urls[e.Name] = e.URL
		if e.Name == "@scope/ui" && (e.License != "ISC" || e.Text == "") {
			t.Errorf("@scope/ui = %+v", e)
		}
	}
	if urls["react"] != "https://react.dev/" || urls["@scope/ui"] != "https://github.com/scope/ui" || urls["loose-envify"] != "https://github.com/zertosh/loose-envify" {
		t.Errorf("urls = %v", urls)
	}
	if urls["js-tokens"] != "https://www.npmjs.com/package/js-tokens" {
		t.Errorf("a package without homepage or repository should link to npm, got %q", urls["js-tokens"])
	}
}

func TestNpmMissingLicenseFile(t *testing.T) {
	got, _ := CollectNpm(filepath.Join(npmFixture(t), "frontend"))
	for _, e := range got {
		if e.Name == "nolicense" && (e.License != "MIT" || e.Text != "") {
			t.Fatalf("nolicense = %+v", e)
		}
	}
}

func TestCollectGoExcludesStdAndMain(t *testing.T) {
	got, err := CollectGo("../..")
	if err != nil {
		t.Fatal(err)
	}
	list := names(got)
	if strings.Contains(list, "jobtrack@") || len(got) == 0 {
		t.Fatalf("entries = %s", list)
	}
	found := false
	for _, e := range got {
		if e.Name == "github.com/openai/openai-go/v3" {
			found = e.License == "Apache-2.0" && e.URL == "https://pkg.go.dev/github.com/openai/openai-go/v3" && e.Text != ""
		}
		if strings.HasPrefix(e.Name, "github.com/stretchr/") {
			t.Errorf("test-only module %s listed", e.Name)
		}
	}
	if !found {
		t.Fatalf("openai-go missing or wrong: %s", list)
	}
}
