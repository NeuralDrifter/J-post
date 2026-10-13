// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Command licenses regenerates frontend/src/generated/licenses.json from the
// Go modules compiled into J-POST, the frontend's production packages and
// the third-party source vendored into the frontend.
// Run it from the repository root: go generate ./...
package main

import (
	"fmt"
	"log"

	"jobtrack/internal/licensegen"
)

const out = "frontend/src/generated/licenses.json"

func main() {
	app, err := licensegen.CollectApp(".")
	if err != nil {
		log.Fatal(err)
	}
	vendored, err := licensegen.CollectVendored(licensegen.VendorRoot)
	if err != nil {
		log.Fatal(err)
	}
	goEntries, err := licensegen.CollectGo(".")
	if err != nil {
		log.Fatal(err)
	}
	npmEntries, err := licensegen.CollectNpm("frontend", licensegen.ShippedBuildTools...)
	if err != nil {
		log.Fatal(err)
	}
	file := licensegen.File{App: app, Vendored: vendored, Go: goEntries, Npm: npmEntries}
	if err := licensegen.Write(out, file); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("wrote %s: %d vendored, %d Go modules, %d npm packages\n", out, len(vendored), len(goEntries), len(npmEntries))
}
