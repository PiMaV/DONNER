// Package main is the DONNER Local Viewer host: static files, /stream-npy
// proxy, /local-viewer.json, open the default browser, and quit from the page.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

const defaultPort = 8765

// Idle after the last /ping before auto-quit (browser closed / crashed).
const presenceIdle = 12 * time.Second

// Soft quit after pagehide /bye — cancelled if the page reloads and pings.
const byeGrace = 3 * time.Second

func main() {
	bind := flag.String("bind", "127.0.0.1", "listen address")
	port := flag.Int("port", defaultPort, "listen port")
	root := flag.String("root", "", "web root directory (dev; default embedded or cwd)")
	noOpen := flag.Bool("no-open", false, "do not open a browser")
	flag.Parse()

	web, err := openWebFS(*root)
	if err != nil {
		log.Fatal(err)
	}

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	public := fmt.Sprintf("http://%s/", displayURL(*bind, *port))

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		if alreadyLocalViewer(public) {
			fmt.Println(public)
			fmt.Println("Local Viewer already running — reopening the browser.")
			fmt.Println("Exit from the page: EXIT")
			if !*noOpen {
				_ = openBrowser(public)
			}
			os.Exit(0)
		}
		log.Fatalf("%v\nPort busy and not a Local Viewer. Stop the other process, or: curl -X POST %squit", err, public)
	}

	quitOnce := sync.Once{}
	quitCh := make(chan struct{})
	requestQuit := func() {
		quitOnce.Do(func() { close(quitCh) })
	}
	pres := newPresence(requestQuit)

	mux := http.NewServeMux()
	mux.HandleFunc("/local-viewer.json", serveLocalViewerJSON)
	mux.HandleFunc("/stream-npy", serveStreamNpy)
	mux.HandleFunc("/quit", serveQuit(requestQuit))
	mux.HandleFunc("/ping", servePing(pres))
	mux.HandleFunc("/bye", serveBye(pres))
	mux.Handle("/", withViewerHeaders(http.FileServer(http.FS(web))))

	srv := &http.Server{Handler: mux}

	fmt.Println(public)
	printStopHint()
	if !*noOpen {
		go func() {
			time.Sleep(200 * time.Millisecond)
			_ = openBrowser(public)
		}()
	}

	go pres.watchIdle(presenceIdle)
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	select {
	case <-sigCh:
		fmt.Println("Stopping Local Viewer…")
	case <-quitCh:
		fmt.Println("Stopped.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func printStopHint() {
	if isTerminal(os.Stderr) || isTerminal(os.Stdout) {
		fmt.Println("EXIT in the page, close the browser, or Ctrl+C here.")
		return
	}
	fmt.Println("EXIT in the page, or close the browser (host stops shortly after).")
}

func isTerminal(f *os.File) bool {
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}

func displayURL(bind string, port int) string {
	host := bind
	if host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return fmt.Sprintf("%s:%d", host, port)
}

func serveLocalViewerJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.WriteString(w, `{"localViewer":true,"canQuit":true}`+"\n")
}

func serveQuit(requestQuit func()) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !isLoopback(r.RemoteAddr) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(w, `{"ok":true}`+"\n")
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		go func() {
			time.Sleep(50 * time.Millisecond)
			requestQuit()
		}()
	}
}

func servePing(pres *presence) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !isLoopback(r.RemoteAddr) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		pres.touch()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(w, `{"ok":true}`+"\n")
	}
}

func serveBye(pres *presence) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !isLoopback(r.RemoteAddr) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		pres.scheduleBye(byeGrace)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(w, `{"ok":true}`+"\n")
	}
}

func isLoopback(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func alreadyLocalViewer(public string) bool {
	client := &http.Client{Timeout: 800 * time.Millisecond}
	res, err := client.Get(strings.TrimRight(public, "/") + "/local-viewer.json")
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return false
	}
	var body struct {
		LocalViewer bool `json:"localViewer"`
	}
	if json.NewDecoder(res.Body).Decode(&body) != nil {
		return false
	}
	return body.LocalViewer
}

func withViewerHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Permissions-Policy", "xr-spatial-tracking=(self), camera=(self)")
		path := strings.ToLower(r.URL.Path)
		if path == "/" || strings.HasSuffix(path, ".html") ||
			strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".mjs") ||
			strings.HasSuffix(path, ".css") || strings.HasSuffix(path, ".json") ||
			strings.HasSuffix(path, ".map") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func openBrowser(rawURL string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL)
	case "darwin":
		cmd = exec.Command("open", rawURL)
	default:
		cmd = exec.Command("xdg-open", rawURL)
	}
	return cmd.Start()
}

// openWebFS is implemented in fs_dev.go / fs_release.go.

func resolveDevRoot(explicit string) (string, error) {
	if explicit != "" {
		if _, err := os.Stat(explicit + "/index.html"); err != nil {
			return "", fmt.Errorf("root %q: missing index.html: %w", explicit, err)
		}
		return explicit, nil
	}
	candidates := []string{".", ".."}
	if exe, err := os.Executable(); err == nil {
		candidates = append([]string{exeDir(exe)}, candidates...)
	}
	for _, c := range candidates {
		if _, err := os.Stat(c + "/index.html"); err == nil {
			return c, nil
		}
	}
	return "", fmt.Errorf("no web root with index.html (pass -root or build with -tags release)")
}

func exeDir(exe string) string {
	i := strings.LastIndexAny(exe, `/\`)
	if i < 0 {
		return "."
	}
	return exe[:i]
}
