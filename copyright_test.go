// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	copyrightLine   = "Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)"
	vendoredLine    = "Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume)"
	vendoredOwner   = "Copyright (c) 2026 Amruth Pillai"
	mitLicenseLine  = "SPDX-License-Identifier: MIT"
	vendoredRoot    = "frontend/src/vendor/reactive-resume"
	headerReadBytes = 400
)

// Folders that hold generated, third-party, local-only or test-fixture files.
var skipDirs = map[string]bool{
	".git": true, ".superpowers": true, "node_modules": true, "venv": true,
	"build": true, "dist": true, "wailsjs": true, "generated": true, "datasets": true,
	"reference": true, "__pycache__": true, "__fixtures__": true,
}

// Every source file J-POST wrote starts with its copyright and license notice.
func TestSourceFilesCarryCopyright(t *testing.T) {
	missing := filesLackingHeader(t, ".", vendoredRoot, copyrightLine, mitLicenseLine)
	reportMissing(t, missing, "J-POST's copyright notice")
}

// Every vendored Reactive Resume file credits its origin and author.
func TestVendoredFilesCarryAttribution(t *testing.T) {
	missing := filesLackingHeader(t, vendoredRoot, "", vendoredLine, vendoredOwner, mitLicenseLine)
	reportMissing(t, missing, "the Reactive Resume attribution header")
}

// filesLackingHeader walks root (skipping skipDirs and the folder skip) and
// lists the source files whose first bytes don't contain every wanted line.
func filesLackingHeader(t *testing.T, root, skip string, wanted ...string) []string {
	t.Helper()
	var missing []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if skipDirs[d.Name()] || filepath.ToSlash(path) == skip {
				return filepath.SkipDir
			}
			return nil
		}
		if !isSourceFile(path) {
			return nil
		}
		ok, err := headerContains(path, wanted)
		if !ok {
			missing = append(missing, filepath.ToSlash(path))
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return missing
}

func isSourceFile(path string) bool {
	switch filepath.Ext(path) {
	case ".go", ".ts", ".tsx", ".py", ".css":
		return true
	}
	return false
}

func headerContains(path string, wanted []string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	head := string(data[:min(len(data), headerReadBytes)])
	for _, line := range wanted {
		if !strings.Contains(head, line) {
			return false, nil
		}
	}
	return true, nil
}

func reportMissing(t *testing.T, missing []string, notice string) {
	t.Helper()
	if len(missing) > 0 {
		t.Errorf("%d files lack %s, e.g. %s", len(missing), notice, strings.Join(missing[:min(len(missing), 10)], ", "))
	}
}
