package main

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestPresenceIdleQuits(t *testing.T) {
	var hits atomic.Int32
	p := newPresence(func() { hits.Add(1) })
	p.touch()
	go p.watchIdle(50 * time.Millisecond)
	deadline := time.Now().Add(time.Second)
	for hits.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if hits.Load() != 1 {
		t.Fatalf("idle quit missing")
	}
}

func TestPresenceByeCancelledByPing(t *testing.T) {
	var hits atomic.Int32
	p := newPresence(func() { hits.Add(1) })
	p.scheduleBye(80 * time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	p.touch()
	time.Sleep(120 * time.Millisecond)
	if hits.Load() != 0 {
		t.Fatalf("bye should cancel on ping")
	}
}

func TestServePingTouches(t *testing.T) {
	var hits atomic.Int32
	p := newPresence(func() { hits.Add(1) })
	h := servePing(p)
	req := httptest.NewRequest(http.MethodPost, "/ping", nil)
	req.RemoteAddr = "127.0.0.1:9"
	rr := httptest.NewRecorder()
	h(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status %d", rr.Code)
	}
	if !p.seen {
		t.Fatal("expected seen")
	}
}
