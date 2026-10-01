//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

const createNoWindow = 0x08000000

// hideConsole stops a console window flashing up when the GUI app runs Python.
func hideConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

// openWithOS opens a file or folder with its default Windows handler.
func openWithOS(path string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	hideConsole(cmd)
	return cmd.Start()
}

// revealInFolder opens Explorer with the file selected.
func revealInFolder(path string) error {
	return exec.Command("explorer", "/select,", path).Start()
}
