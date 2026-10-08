// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"embed"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
)

//go:embed all:frontend/dist
var assets embed.FS

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

	app := NewApp(settings.DefaultDataDir())

	// The window starts hidden at a conservative size; domReady resizes it to
	// fit the actual screen before showing it.
	err := wails.Run(&options.App{
		Title:            "Job Track",
		Width:            1024,
		Height:           640,
		StartHidden:      true,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 7, G: 9, B: 14, A: 1},
		OnStartup:        app.startup,
		OnDomReady:       app.domReady,
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		Bind:             []interface{}{app},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
