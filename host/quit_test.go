package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestServeQuitLoopback(t *testing.T) {
	var hits atomic.Int32
	h := serveQuit(func() { hits.Add(1) })
	req := httptest.NewRequest(http.MethodPost, "/quit", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	rr := httptest.NewRecorder()
	h(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status %d", rr.Code)
	}
	body, _ := io.ReadAll(rr.Body)
	if string(body) != "{\"ok\":true}\n" {
		t.Fatalf("body %q", body)
	}
	deadline := time.Now().Add(time.Second)
	for hits.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if hits.Load() != 1 {
		t.Fatalf("quit not requested")
	}
}

func TestServeQuitRejectsRemote(t *testing.T) {
	var hits atomic.Int32
	h := serveQuit(func() { hits.Add(1) })
	req := httptest.NewRequest(http.MethodPost, "/quit", nil)
	req.RemoteAddr = "8.8.8.8:443"
	rr := httptest.NewRecorder()
	h(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status %d", rr.Code)
	}
	if hits.Load() != 0 {
		t.Fatalf("quit should not run")
	}
}

func TestIsLoopback(t *testing.T) {
	if !isLoopback("127.0.0.1:9") || !isLoopback("[::1]:9") {
		t.Fatal("expected loopback")
	}
	if isLoopback("192.168.1.2:9") {
		t.Fatal("LAN must not quit")
	}
}
