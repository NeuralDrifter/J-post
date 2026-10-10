// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package resumes

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"

	"jobtrack/internal/httpapi"
)

// maxPictureBytes caps a downloaded photo; resume photos are far smaller.
const maxPictureBytes = 5 << 20

const pictureTimeout = 20 * time.Second

// carrierGradeNAT (100.64.0.0/10) is shared address space, not the public internet.
var carrierGradeNAT = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

// PictureFetcher downloads the photos that imported resumes link to, so the
// resume stores the image itself. It only connects to public internet
// addresses, checked when connecting, so a link can't reach this computer or
// its network.
type PictureFetcher struct {
	client *http.Client
}

func NewPictureFetcher() *PictureFetcher {
	return newPictureFetcher(isPublicIP)
}

// newPictureFetcher connects only to addresses allow accepts (tests allow loopback).
func newPictureFetcher(allow func(net.IP) bool) *PictureFetcher {
	dialer := &net.Dialer{Timeout: pictureTimeout, Control: func(_, address string, _ syscall.RawConn) error {
		host, _, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		if ip := net.ParseIP(host); ip == nil || !allow(ip) {
			return errors.New("the picture's address isn't on the public internet")
		}
		return nil
	}}
	transport := &http.Transport{DialContext: dialer.DialContext, Proxy: nil, TLSHandshakeTimeout: pictureTimeout}
	return &PictureFetcher{client: &http.Client{Transport: transport}}
}

// Fetch downloads a picture and returns it as a data URL (data:image/…;base64,…).
func (f *PictureFetcher) Fetch(ctx context.Context, rawURL string) (string, error) {
	if !isWebURL(rawURL) {
		return "", errors.New("pictures can only be downloaded from http or https links")
	}
	resp, err := httpapi.Request{Source: "Picture download", URL: rawURL, Headers: map[string]string{"Accept": "image/*"}, Timeout: pictureTimeout, Client: f.client}.Send(ctx)
	if err != nil {
		return "", err
	}
	if resp.Status != http.StatusOK {
		return "", fmt.Errorf("picture download failed: HTTP %d", resp.Status)
	}
	return pictureDataURL(resp.Body)
}

func pictureDataURL(body []byte) (string, error) {
	if len(body) > maxPictureBytes {
		return "", fmt.Errorf("the picture is over %d MB", maxPictureBytes>>20)
	}
	// The type comes from the bytes, not the server's word; SVG (text) is not accepted.
	contentType := http.DetectContentType(body)
	if !strings.HasPrefix(contentType, "image/") {
		return "", errors.New("the link isn't a picture")
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}

func isWebURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// isPublicIP is false for loopback, private, link-local, multicast, unspecified
// and carrier-grade NAT addresses.
func isPublicIP(ip net.IP) bool {
	return !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() || carrierGradeNAT.Contains(ip))
}
