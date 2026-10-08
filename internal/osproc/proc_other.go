// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

//go:build !windows

package osproc

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func HideConsole(cmd *exec.Cmd) {}

func KillProcessTree(p *os.Process) error { return p.Kill() }

func OpenWithOS(path string) error {
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	return exec.Command(opener, path).Start()
}

func RevealInFolder(path string) error { return OpenWithOS(filepath.Dir(path)) }
