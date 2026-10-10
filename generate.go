// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

// Regenerates the open-source licenses list shown in Settings → About.
//go:generate go run ./tools/licenses

// Regenerates the value lists (statuses, work modes, comp options…) the frontend imports.
//go:generate go run ./tools/choices
