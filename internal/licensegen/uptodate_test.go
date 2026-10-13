// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package licensegen

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const generatedFile = "../../frontend/src/generated/licenses.json"

func TestWriteRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "out", "licenses.json")
	goEntries := []Entry{{Name: "b", Version: "v1"}, {Name: "a", Version: "v2"}}
	if err := Write(path, File{App: Entry{Name: "J-POST"}, Go: goEntries}); err != nil {
		t.Fatal(err)
	}
	f, err := Read(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Go) != 2 || f.Go[0].Name != "a" || f.Npm == nil || f.Vendored == nil || f.App.Name != "J-POST" {
		t.Fatalf("file = %+v", f)
	}
}

// diffEntries names what's in want but not got (added) and the reverse (removed).
func diffEntries(got, want []Entry) (added, removed []string) {
	key := func(e Entry) string { return e.Name + "@" + e.Version }
	have := map[string]bool{}
	for _, e := range got {
		have[key(e)] = true
	}
	need := map[string]bool{}
	for _, e := range want {
		need[key(e)] = true
		if !have[key(e)] {
			added = append(added, key(e))
		}
	}
	for _, e := range got {
		if !need[key(e)] {
			removed = append(removed, key(e))
		}
	}
	return added, removed
}

func TestLicensesUpToDate(t *testing.T) {
	committed, err := Read(generatedFile)
	if err != nil {
		t.Fatalf("%v — run go generate ./...", err)
	}
	app, err := CollectApp("../..")
	if err != nil {
		t.Fatal(err)
	}
	if committed.App != app {
		t.Error("J-POST's own license changed — run go generate ./...")
	}
	vendoredNow, err := CollectVendored("../../" + VendorRoot)
	if err != nil {
		t.Fatal(err)
	}
	if added, removed := diffEntries(committed.Vendored, vendoredNow); len(added)+len(removed) > 0 {
		t.Errorf("vendored licenses are stale (new %v, gone %v) — run go generate ./...", added, removed)
	}
	goNow, err := CollectGo("../..")
	if err != nil {
		t.Fatal(err)
	}
	if added, removed := diffEntries(committed.Go, goNow); len(added)+len(removed) > 0 {
		t.Errorf("Go licenses are stale (new %v, gone %v) — run go generate ./...", added, removed)
	}
	if _, err := os.Stat("../../frontend/node_modules"); err != nil {
		t.Log("frontend/node_modules missing; npm check skipped")
		return
	}
	npmNow, err := CollectNpm("../../frontend", ShippedBuildTools...)
	if err != nil {
		t.Fatal(err)
	}
	if added, removed := diffEntries(committed.Npm, npmNow); len(added)+len(removed) > 0 {
		t.Errorf("npm licenses are stale (new %v, gone %v) — run go generate ./...", added, removed)
	}
}

func TestCollectApp(t *testing.T) {
	app, err := CollectApp("../..")
	if err != nil {
		t.Fatal(err)
	}
	if app.Name != "J-POST" || app.License != "MIT" || app.URL != "https://github.com/NeuralDrifter" ||
		!strings.Contains(app.Text, "Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)") {
		t.Fatalf("app = %+v", app)
	}
}
