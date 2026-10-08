// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package gemini

import "time"

// SetTestEndpoints points REST calls at restURL (with no retry delays) and Live
// sessions at liveWSBase until the test ends; "" leaves that endpoint alone.
// Only tests call it, mostly through package geminitest.
func SetTestEndpoints(t interface{ Cleanup(func()) }, restURL, liveWSBase string) {
	if restURL != "" {
		oldURL, oldDelays := geminiBaseURL, geminiRetryDelays
		geminiBaseURL, geminiRetryDelays = restURL, []time.Duration{0, 0}
		t.Cleanup(func() { geminiBaseURL, geminiRetryDelays = oldURL, oldDelays })
	}
	if liveWSBase != "" {
		old := geminiLiveWSBase
		geminiLiveWSBase = liveWSBase
		t.Cleanup(func() { geminiLiveWSBase = old })
	}
}
