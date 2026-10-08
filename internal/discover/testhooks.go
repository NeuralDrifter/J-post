// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

// SetTestMuse points The Muse client at url, with no pause between pages,
// until the test ends. Only tests call it.
func SetTestMuse(t interface{ Cleanup(func()) }, url string) {
	oldURL, oldDelay := museBaseURL, musePageDelay
	museBaseURL, musePageDelay = url, 0
	t.Cleanup(func() { museBaseURL, musePageDelay = oldURL, oldDelay })
}

// SetTestJobicy points the Jobicy client at url until the test ends. Only tests call it.
func SetTestJobicy(t interface{ Cleanup(func()) }, url string) {
	old := jobicyBaseURL
	jobicyBaseURL = url
	t.Cleanup(func() { jobicyBaseURL = old })
}
