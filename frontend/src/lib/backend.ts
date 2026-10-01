// The only module that touches the Wails-generated bindings. Import Go methods,
// model types and runtime helpers from here, never from ../../wailsjs directly.
export * from '../../wailsjs/go/main/App'
export { main } from '../../wailsjs/go/models'
export { BrowserOpenURL } from '../../wailsjs/runtime/runtime'
