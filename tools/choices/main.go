// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Command choices regenerates frontend/src/generated/choices.ts from the value
// lists the backend validates against. Run it from the repository root:
// go generate ./...
package main

import (
	"fmt"
	"log"
	"os"

	"jobtrack/internal/choicegen"
)

func main() {
	if err := os.WriteFile(choicegen.OutputPath, []byte(choicegen.Render()), 0o644); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("wrote %s\n", choicegen.OutputPath)
}
