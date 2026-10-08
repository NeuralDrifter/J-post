// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The only module that touches the Wails-generated bindings. Import Go methods,
// model types and runtime helpers from here, never from ../../wailsjs directly.
export * from '../../wailsjs/go/main/App'
export { ai, comp, main, marketdata, settings, taxes } from '../../wailsjs/go/models'
export { BrowserOpenURL } from '../../wailsjs/runtime/runtime'
