// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const copyrightLine = "Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)"

// Folders that hold generated, third-party or local-only files.
var skipDirs = map[string]bool{
	".git": true, ".superpowers": true, "3rd_party": true, "node_modules": true, "venv": true,
	"build": true, "dist": true, "wailsjs": true, "generated": true, "datasets": true,
	"example_only_non_functioning_demo content": true, "__pycache__": true,
}

// Every source file in the project starts with the copyright and license notice.
func TestSourceFilesCarryCopyright(t *testing.T) {
	var missing []string
	filepath.WalkDir(".", func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		switch filepath.Ext(path) {
		case ".go", ".ts", ".tsx", ".py", ".css":
		default:
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		head := string(data[:min(len(data), 400)])
		if !strings.Contains(head, copyrightLine) || !strings.Contains(head, "SPDX-License-Identifier: MIT") {
			missing = append(missing, filepath.ToSlash(path))
		}
		return nil
	})
	if len(missing) > 0 {
		t.Errorf("%d files lack the copyright notice, e.g. %s", len(missing), strings.Join(missing[:min(len(missing), 10)], ", "))
	}
}
