// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// What the builder shows, as opposed to what the resume says: the selected
// block, the Check tab, the last render. Reactive Resume's editor store holds
// it; one builder is open at a time, and it resets when the builder closes.
export {
  isSameSelection,
  useEditorStore as useBuilderView,
  type CheckTab,
  type EditorSelection,
} from '@reactive-resume/web/features/resume/editor/store'
