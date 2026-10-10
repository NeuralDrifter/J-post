// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package licensegen

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// VendorRoot is where third-party source is copied, relative to the repository root.
const VendorRoot = "frontend/src/vendor"

// shortCommitLength is how many characters of an upstream commit are shown as its version.
const shortCommitLength = 7

// CollectVendored lists the third-party source copied into vendorRoot: one
// entry per folder, read from its LICENSE and UPSTREAM.md. A missing
// vendorRoot means nothing is vendored.
func CollectVendored(vendorRoot string) ([]Entry, error) {
	folders, err := os.ReadDir(vendorRoot)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var entries []Entry
	for _, folder := range folders {
		if !folder.IsDir() {
			continue
		}
		entry, err := vendoredEntry(filepath.Join(vendorRoot, folder.Name()))
		if err != nil {
			return nil, fmt.Errorf("vendored %s: %w", folder.Name(), err)
		}
		entries = append(entries, entry)
	}
	sortEntries(entries)
	return entries, nil
}

func vendoredEntry(dir string) (Entry, error) {
	text, ok := FindLicenseText(dir)
	if !ok {
		return Entry{}, errors.New("no license file")
	}
	upstream, err := readUpstreamFields(filepath.Join(dir, "UPSTREAM.md"))
	if err != nil {
		return Entry{}, err
	}
	return Entry{
		Name:    upstream["Name"],
		Version: shortCommit(upstream["Commit"]),
		License: DetectLicense(text),
		URL:     upstream["Upstream"],
		Text:    text,
	}, nil
}

// readUpstreamFields reads the "Name:", "Upstream:" and "Commit:" lines of an
// UPSTREAM.md; the first line for each key wins, so prose further down can't override it.
func readUpstreamFields(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	fields := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		key, value, found := strings.Cut(scanner.Text(), ":")
		if _, seen := fields[key]; found && !seen {
			fields[key] = strings.TrimSpace(value)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	for _, key := range []string{"Name", "Upstream", "Commit"} {
		if fields[key] == "" {
			return nil, fmt.Errorf("%s has no %q line", path, key+":")
		}
	}
	return fields, nil
}

// shortCommit turns "abc1234def5678 (2026-01-01)" into "abc1234".
func shortCommit(commit string) string {
	hash, _, _ := strings.Cut(commit, " ")
	return hash[:min(len(hash), shortCommitLength)]
}
