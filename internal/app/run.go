// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"io/fs"
	"log"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"jobtrack/internal/resumes"
)

// Run opens the main window on the app's data in dataDir, serving the
// frontend from assets and resume fonts from the catalogue fontList, and
// returns when the window closes.
func Run(dataDir string, assets fs.FS, fontList []byte) error {
	app := NewApp(dataDir)

	// The window starts hidden at a conservative size; domReady resizes it to
	// fit the actual screen before showing it.
	return wails.Run(&options.App{
		Title:            "Job Track",
		Width:            1440,
		Height:           900,
		StartHidden:      true,
		AssetServer:      &assetserver.Options{Assets: assets, Middleware: fontMiddleware(dataDir, fontList)},
		BackgroundColour: &options.RGBA{R: 7, G: 9, B: 14, A: 1},
		OnStartup:        app.startup,
		OnDomReady:       app.domReady,
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		Bind:             []interface{}{app},
	})
}

// fontMiddleware serves the resume builder's fonts from a cache in dataDir.
// Without a readable catalogue the builder still works, with fallback fonts.
func fontMiddleware(dataDir string, fontList []byte) assetserver.Middleware {
	cache, err := resumes.NewFontCache(filepath.Join(dataDir, "fonts"), fontList)
	if err != nil {
		log.Printf("resume fonts unavailable: %v", err)
		return nil
	}
	return cache.Middleware
}
