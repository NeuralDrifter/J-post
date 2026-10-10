// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package resumes

import (
	"bytes"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A 1×1 PNG.
var pngBytes = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")

func pictureServer(t *testing.T, body []byte) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(body) }))
	t.Cleanup(srv.Close)
	return srv
}

// A fetcher whose guard lets the loopback test server through.
func testFetcher() *PictureFetcher {
	return newPictureFetcher(func(net.IP) bool { return true })
}

func TestFetchPictureReturnsDataURL(t *testing.T) {
	srv := pictureServer(t, pngBytes)
	url, err := testFetcher().Fetch(context.Background(), srv.URL+"/me.png")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(url, "data:image/png;base64,") {
		t.Fatalf("url = %.40q", url)
	}
}

func TestFetchPictureRefusesWhatIsNotAnImage(t *testing.T) {
	srv := pictureServer(t, []byte("<html>not a picture</html>"))
	if _, err := testFetcher().Fetch(context.Background(), srv.URL); err == nil {
		t.Fatal("no error for an HTML page")
	}
}

func TestFetchPictureRefusesHugeFiles(t *testing.T) {
	srv := pictureServer(t, append(append([]byte{}, pngBytes...), bytes.Repeat([]byte{0}, maxPictureBytes)...))
	if _, err := testFetcher().Fetch(context.Background(), srv.URL); err == nil {
		t.Fatal("no error for a picture over the size limit")
	}
}

func TestFetchPictureRefusesOtherSchemes(t *testing.T) {
	for _, url := range []string{"file:///C:/Windows/win.ini", "ftp://example.com/me.png", "javascript:alert(1)", ""} {
		if _, err := testFetcher().Fetch(context.Background(), url); err == nil {
			t.Errorf("%q: no error", url)
		}
	}
}

func TestFetchPictureRefusesLocalAddresses(t *testing.T) {
	srv := pictureServer(t, pngBytes)
	if _, err := NewPictureFetcher().Fetch(context.Background(), srv.URL); err == nil {
		t.Fatal("the default fetcher reached a loopback address")
	}
}

func TestIsPublicIP(t *testing.T) {
	cases := map[string]bool{
		"8.8.8.8": true, "2606:4700:4700::1111": true,
		"127.0.0.1": false, "::1": false, "10.1.2.3": false, "172.16.0.1": false, "192.168.1.1": false,
		"169.254.169.254": false, "fe80::1": false, "0.0.0.0": false, "100.64.0.1": false, "fd00::1": false, "224.0.0.1": false,
	}
	for ip, want := range cases {
		if got := isPublicIP(net.ParseIP(ip)); got != want {
			t.Errorf("isPublicIP(%s) = %v, want %v", ip, got, want)
		}
	}
}
