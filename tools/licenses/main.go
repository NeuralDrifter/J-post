// Command licenses regenerates frontend/src/generated/licenses.json from the
// Go modules compiled into Job Track and the frontend's production packages.
// Run it from the repository root: go generate ./...
package main

import (
	"fmt"
	"log"

	"jobtrack/internal/licensegen"
)

const out = "frontend/src/generated/licenses.json"

func main() {
	goEntries, err := licensegen.CollectGo(".")
	if err != nil {
		log.Fatal(err)
	}
	npmEntries, err := licensegen.CollectNpm("frontend", licensegen.ShippedBuildTools...)
	if err != nil {
		log.Fatal(err)
	}
	if err := licensegen.Write(out, goEntries, npmEntries); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("wrote %s: %d Go modules, %d npm packages\n", out, len(goEntries), len(npmEntries))
}
