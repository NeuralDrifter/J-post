//go:build windows

package main

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

const createNoWindow = 0x08000000

// hideConsole stops a console window flashing up when the GUI app runs Python.
func hideConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

// killProcessTree ends a process and everything it started (e.g. claude.cmd's
// node child, or the per-run MCP server), which Process.Kill alone would leave running.
func killProcessTree(p *os.Process) error {
	kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(p.Pid))
	hideConsole(kill)
	if err := kill.Run(); err != nil {
		return p.Kill()
	}
	return nil
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
