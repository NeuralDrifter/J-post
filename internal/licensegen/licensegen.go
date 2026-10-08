// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Package licensegen collects the licenses of everything compiled or bundled
// into Job Track: Go modules and the frontend's production npm packages.
package licensegen

import (
	"bytes"
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
)

// Entry is one library and its license.
type Entry struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	License string `json:"license"` // SPDX ID, or "Other"
	URL     string `json:"url"`
	Text    string `json:"text"` // the license file(s) plus NOTICE; "" when the package ships none
}

// DetectLicense names the license in text by its well-known wording.
func DetectLicense(text string) string {
	t := strings.ToLower(text)
	has := func(s string) bool { return strings.Contains(t, s) }
	switch {
	case has("apache license") && has("version 2.0"):
		return "Apache-2.0"
	case has("mozilla public license") && has("2.0"):
		return "MPL-2.0"
	case has("sil open font license"):
		return "OFL-1.1"
	case has("permission is hereby granted, free of charge"):
		return "MIT"
	case has("isc license") || has("permission to use, copy, modify, and/or distribute") || has("permission to use, copy, modify, and distribute"):
		return "ISC"
	case has("redistribution and use in source and binary forms"):
		if has("neither the name") || has("endorse or promote") {
			return "BSD-3-Clause"
		}
		return "BSD-2-Clause"
	case has("unencumbered software released into the public domain"):
		return "Unlicense"
	}
	return "Other"
}

// FindLicenseText reads every LICENSE*/LICENCE*/COPYING* file in dir (some
// projects ship one per license), followed by NOTICE when present.
func FindLicenseText(dir string) (string, bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", false
	}
	var licenses, notices []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		upper := strings.ToUpper(e.Name())
		switch {
		case strings.HasPrefix(upper, "LICENSE"), strings.HasPrefix(upper, "LICENCE"), strings.HasPrefix(upper, "COPYING"):
			licenses = append(licenses, e.Name())
		case strings.HasPrefix(upper, "NOTICE"):
			notices = append(notices, e.Name())
		}
	}
	if len(licenses) == 0 {
		return "", false
	}
	var parts []string
	for _, name := range append(licenses, notices...) {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err == nil {
			parts = append(parts, strings.TrimSpace(string(data)))
		}
	}
	return strings.Join(parts, "\n\n"), true
}

// CollectGo lists the modules compiled into the main package at moduleRoot,
// without the standard library or the main module itself.
func CollectGo(moduleRoot string) ([]Entry, error) {
	cmd := exec.Command("go", "list", "-deps", "-json", ".")
	cmd.Dir = moduleRoot
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("go list: %v: %s", err, stderr.String())
	}
	type module struct {
		Path, Version, Dir string
		Main               bool
		Replace            *module
	}
	seen := map[string]bool{}
	var entries []Entry
	dec := json.NewDecoder(bytes.NewReader(out))
	for {
		var pkg struct {
			Standard bool
			Module   *module
		}
		if err := dec.Decode(&pkg); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return nil, err
		}
		m := pkg.Module
		if pkg.Standard || m == nil || m.Main || seen[m.Path] {
			continue
		}
		seen[m.Path] = true
		dir, version := m.Dir, m.Version
		if m.Replace != nil {
			dir, version = m.Replace.Dir, m.Replace.Version
		}
		text, ok := FindLicenseText(dir)
		if !ok {
			return nil, fmt.Errorf("%s@%s has no license file in %s", m.Path, version, dir)
		}
		entries = append(entries, Entry{Name: m.Path, Version: version, License: DetectLicense(text), URL: "https://pkg.go.dev/" + m.Path, Text: text})
	}
	sortEntries(entries)
	return entries, nil
}

type packageJSON struct {
	Name                 string            `json:"name"`
	Version              string            `json:"version"`
	License              json.RawMessage   `json:"license"`
	Homepage             string            `json:"homepage"`
	Repository           json.RawMessage   `json:"repository"`
	Dependencies         map[string]string `json:"dependencies"`
	OptionalDependencies map[string]string `json:"optionalDependencies"`
}

// CollectNpm lists every package reachable from frontendDir's package.json
// dependencies (not devDependencies), plus extra packages whose build output
// ships in the app. Packages resolve the way Node does: the nearest
// node_modules folder, walking up from the package that needs it.
func CollectNpm(frontendDir string, extra ...string) ([]Entry, error) {
	root, err := readPackage(filepath.Join(frontendDir, "package.json"))
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{} // package dirs already listed
	var entries []Entry
	// withDeps is false for the shipped build tools: only their own output is in
	// the app, not the tools they run on (which also differ per platform).
	var visit func(name, fromDir string, optional, withDeps bool) error
	visit = func(name, fromDir string, optional, withDeps bool) error {
		dir, ok := resolve(name, fromDir, frontendDir)
		if !ok {
			if optional {
				return nil
			}
			return fmt.Errorf("npm package %s (needed from %s) isn't installed; run npm install", name, fromDir)
		}
		if seen[dir] {
			return nil
		}
		seen[dir] = true
		pkg, err := readPackage(filepath.Join(dir, "package.json"))
		if err != nil {
			return err
		}
		text, _ := FindLicenseText(dir)
		license := npmLicense(pkg.License)
		if license == "" {
			license = DetectLicense(text)
		}
		entries = append(entries, Entry{Name: pkg.Name, Version: pkg.Version, License: license, URL: npmURL(pkg), Text: text})
		if !withDeps {
			return nil
		}
		for _, dep := range slices.Sorted(maps.Keys(pkg.Dependencies)) {
			if err := visit(dep, dir, false, true); err != nil {
				return err
			}
		}
		for _, dep := range slices.Sorted(maps.Keys(pkg.OptionalDependencies)) {
			if err := visit(dep, dir, true, true); err != nil {
				return err
			}
		}
		return nil
	}
	for _, name := range slices.Sorted(maps.Keys(root.Dependencies)) {
		if err := visit(name, frontendDir, false, true); err != nil {
			return nil, err
		}
	}
	for _, name := range extra {
		if err := visit(name, frontendDir, false, false); err != nil {
			return nil, err
		}
	}
	sortEntries(entries)
	return entries, nil
}

// resolve finds name's folder from fromDir upward, stopping at root.
func resolve(name, fromDir, root string) (string, bool) {
	root = filepath.Clean(root)
	for dir := filepath.Clean(fromDir); ; dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, "node_modules", filepath.FromSlash(name))
		if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
			return candidate, true
		}
		if dir == root || filepath.Dir(dir) == dir {
			return "", false
		}
	}
}

func readPackage(path string) (packageJSON, error) {
	var pkg packageJSON
	data, err := os.ReadFile(path)
	if err != nil {
		return pkg, err
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return pkg, fmt.Errorf("%s: %v", path, err)
	}
	return pkg, nil
}

// npmLicense reads package.json's license: a string, or the old {type} object.
func npmLicense(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var obj struct{ Type string }
	if json.Unmarshal(raw, &obj) == nil {
		return obj.Type
	}
	return ""
}

// npmURL is the package's homepage, else its repository as an https link,
// else its npm page.
func npmURL(pkg packageJSON) string {
	if strings.HasPrefix(pkg.Homepage, "http") {
		return pkg.Homepage
	}
	var repo string
	if json.Unmarshal(pkg.Repository, &repo) != nil {
		var obj struct{ URL string }
		json.Unmarshal(pkg.Repository, &obj)
		repo = obj.URL
	}
	if repo = normaliseRepo(repo); repo != "" {
		return repo
	}
	return "https://www.npmjs.com/package/" + pkg.Name
}

func normaliseRepo(repo string) string {
	repo = strings.TrimPrefix(repo, "git+")
	repo = strings.TrimSuffix(repo, ".git")
	switch {
	case strings.HasPrefix(repo, "git://"):
		repo = "https://" + strings.TrimPrefix(repo, "git://")
	case strings.HasPrefix(repo, "github:"):
		repo = "https://github.com/" + strings.TrimPrefix(repo, "github:")
	case strings.HasPrefix(repo, "git@github.com:"):
		repo = "https://github.com/" + strings.TrimPrefix(repo, "git@github.com:")
	case repo != "" && !strings.Contains(repo, ":") && strings.Count(repo, "/") == 1:
		repo = "https://github.com/" + repo // "owner/repo" shorthand
	}
	if !strings.HasPrefix(repo, "https://") && !strings.HasPrefix(repo, "http://") {
		return ""
	}
	return repo
}

func sortEntries(entries []Entry) {
	slices.SortFunc(entries, func(a, b Entry) int {
		return cmp.Or(strings.Compare(a.Name, b.Name), strings.Compare(a.Version, b.Version))
	})
}
