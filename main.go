// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"embed"
	"fmt"
	"os"

	"jobtrack/internal/ai"
	"jobtrack/internal/app"
	"jobtrack/internal/settings"
)

//go:embed all:frontend/dist
var assets embed.FS

// The resume templates' web-font catalogue; only fonts listed here are downloaded.
//
//go:embed frontend/src/vendor/reactive-resume/fonts/webfontlist.json
var resumeFontList []byte

func main() {
	// Launched by headless Claude Code as a per-run MCP server: serve the task
	// over stdin/stdout instead of opening the window.
	if len(os.Args) == 3 && os.Args[1] == ai.TaskMCPFlag {
		if err := ai.RunTaskMCP(context.Background(), os.Args[2], os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	if err := app.Run(settings.DefaultDataDir(), assets, resumeFontList); err != nil {
		println("Error:", err.Error())
	}
}
