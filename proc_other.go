//go:build !windows

package main

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

func hideConsole(cmd *exec.Cmd) {}

func openWithOS(path string) error {
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	return exec.Command(opener, path).Start()
}

func revealInFolder(path string) error { return openWithOS(filepath.Dir(path)) }
