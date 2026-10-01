//go:build !windows

package main

import (
	"os/exec"
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
