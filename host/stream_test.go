package main

import "testing"

func TestAllowedStreamURL(t *testing.T) {
	ok := []string{
		"http://127.0.0.1:5055/evt?filename=stack.npy",
		"http://192.168.178.30:5055/evt",
		"http://localhost:5055/x",
		"http://10.0.0.2:5055/x",
	}
	for _, raw := range ok {
		got, err := allowedStreamURL(raw)
		if err != nil || got == "" {
			t.Fatalf("want allow %q, err=%v", raw, err)
		}
	}
	bad := []string{
		"http://8.8.8.8/evt",
		"https://example.com/evt",
		"file:///etc/passwd",
		"http://user:pass@127.0.0.1:5055/x",
		"ftp://127.0.0.1/x",
	}
	for _, raw := range bad {
		if _, err := allowedStreamURL(raw); err == nil {
			t.Fatalf("want reject %q", raw)
		}
	}
}
