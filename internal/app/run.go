// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"io/fs"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// Run opens the main window on the app's data in dataDir, serving the
// frontend from assets, and returns when the window closes.
func Run(dataDir string, assets fs.FS) error {
	app := NewApp(dataDir)

	// The window starts hidden at a conservative size; domReady resizes it to
	// fit the actual screen before showing it.
	return wails.Run(&options.App{
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
}
