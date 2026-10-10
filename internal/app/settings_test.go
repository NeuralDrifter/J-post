// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"testing"

	"jobtrack/internal/settings"
)

func TestSaveSettingsReturnsStoredDefaults(t *testing.T) {
	a := newTestApp(t)
	s, err := a.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	s.FollowUpDays, s.DiscoverCacheHours, s.MatchPerRequest = 0, 0, 0 // "left blank" on the page
	saved, err := a.SaveSettings(s)
	if err != nil {
		t.Fatal(err)
	}
	if saved.FollowUpDays != settings.DefaultFollowUpDays || saved.DiscoverCacheHours <= 0 || saved.MatchPerRequest != settings.DefaultMatchPerRequest {
		t.Fatalf("saved = %+v; blank numbers should come back as the defaults", saved)
	}
	if loaded, _ := a.GetSettings(); loaded.FollowUpDays != saved.FollowUpDays {
		t.Fatalf("returned %d but stored %d", saved.FollowUpDays, loaded.FollowUpDays)
	}
}
