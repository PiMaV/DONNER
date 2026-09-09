package main

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
)

func TestServeStreamNpyProxiesLoopback(t *testing.T) {
	var hits atomic.Int32
	mux := http.NewServeMux()
	body := []byte{0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(body)
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go http.Serve(ln, mux)

	target := "http://" + ln.Addr().String() + "/evt?filename=stack.npy"
	req := httptest.NewRequest(http.MethodGet, "/stream-npy?u="+url.QueryEscape(target), nil)
	rr := httptest.NewRecorder()
	serveStreamNpy(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	got, _ := io.ReadAll(rr.Body)
	if string(got) != string(body) {
		t.Fatalf("body mismatch")
	}
	if hits.Load() != 1 {
		t.Fatalf("hits %d", hits.Load())
	}
}

func TestServeStreamNpyForbidsPublic(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/stream-npy?u=http://8.8.8.8/evt", nil)
	rr := httptest.NewRecorder()
	serveStreamNpy(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status %d", rr.Code)
	}
}
