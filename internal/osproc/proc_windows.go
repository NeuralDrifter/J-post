// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

//go:build windows

package osproc

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

const createNoWindow = 0x08000000

// HideConsole stops a console window flashing up when the GUI app runs Python.
func HideConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

// KillProcessTree ends a process and everything it started (e.g. claude.cmd's
// node child, or the per-run MCP server), which Process.Kill alone would leave running.
func KillProcessTree(p *os.Process) error {
	kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(p.Pid))
	HideConsole(kill)
	if err := kill.Run(); err != nil {
		return p.Kill()
	}
	return nil
}

// OpenWithOS opens a file or folder with its default Windows handler.
func OpenWithOS(path string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	HideConsole(cmd)
	return cmd.Start()
}

// RevealInFolder opens Explorer with the file selected.
func RevealInFolder(path string) error {
	return exec.Command("explorer", "/select,", path).Start()
}
