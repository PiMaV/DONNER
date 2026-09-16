package main

import (
	"sync"
	"time"
)

// presence tracks Local Viewer browser sessions via /ping and /bye.
type presence struct {
	mu       sync.Mutex
	last     time.Time
	seen     bool
	byeTimer *time.Timer
	quit     func()
}

func newPresence(quit func()) *presence {
	return &presence{quit: quit}
}

func (p *presence) touch() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.last = time.Now()
	p.seen = true
	if p.byeTimer != nil {
		p.byeTimer.Stop()
		p.byeTimer = nil
	}
}

func (p *presence) scheduleBye(grace time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.byeTimer != nil {
		p.byeTimer.Stop()
	}
	p.byeTimer = time.AfterFunc(grace, func() {
		p.quit()
	})
}

func (p *presence) watchIdle(idle time.Duration) {
	for {
		time.Sleep(time.Second)
		p.mu.Lock()
		seen := p.seen
		last := p.last
		p.mu.Unlock()
		if seen && time.Since(last) > idle {
			p.quit()
			return
		}
	}
}
