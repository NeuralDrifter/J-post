// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import "testing"

func TestMuseLocation(t *testing.T) {
	cases := map[string]string{"denver, co": "Denver, CO", "New York,ny": "New York, NY", "": "Flexible / Remote", "  austin , tx ": "Austin, TX", "Denver": "Denver"}
	for in, want := range cases {
		if got := museLocation(DiscoverQuery{Location: in}); got != want {
			t.Errorf("museLocation(%q) = %q, want %q", in, got, want)
		}
	}
	if got := museLocation(DiscoverQuery{Location: "Denver, CO", RemoteOnly: true}); got != "Flexible / Remote" {
		t.Errorf("remote = %q", got)
	}
}
