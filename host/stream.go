package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	maxStreamBytes = 512 * 1024 * 1024
	streamTimeout  = 120 * time.Second
)

var errPublicTarget = errors.New("stream target is not a local sidecar")

func allowedStreamURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil {
		return "", errPublicTarget
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", errPublicTarget
	}
	if u.User != nil {
		return "", errPublicTarget
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return u.String(), nil
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return "", errPublicTarget
	}
	if ip.IsLoopback() || ip.IsPrivate() {
		return u.String(), nil
	}
	return "", errPublicTarget
}

func serveStreamNpy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	raw := r.URL.Query().Get("u")
	target, err := allowedStreamURL(raw)
	if err != nil {
		http.Error(w, "stream target is not a local sidecar", http.StatusForbidden)
		return
	}

	client := &http.Client{
		Timeout: streamTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return errors.New("redirects are not allowed")
		},
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, "bad stream target", http.StatusBadRequest)
		return
	}
	req.Header.Set("Accept-Encoding", "identity")

	res, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("sidecar unreachable: %v", err), http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("sidecar HTTP %d", res.StatusCode), res.StatusCode)
		return
	}

	ctype := res.Header.Get("Content-Type")
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxStreamBytes+1))
	if err != nil {
		http.Error(w, fmt.Sprintf("sidecar read: %v", err), http.StatusBadGateway)
		return
	}
	if len(body) > maxStreamBytes {
		http.Error(w, "cube exceeds proxy size cap", http.StatusRequestEntityTooLarge)
		return
	}

	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}
