// Package main is the DONNER Local Viewer host: static files, /stream-npy
// proxy, /local-viewer.json, and open the default browser.
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

const defaultPort = 8765

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

	mux := http.NewServeMux()
	mux.HandleFunc("/local-viewer.json", serveLocalViewerJSON)
	mux.HandleFunc("/stream-npy", serveStreamNpy)
	mux.Handle("/", withViewerHeaders(http.FileServer(http.FS(web))))

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}

	public := fmt.Sprintf("http://%s/", displayURL(*bind, *port))
	fmt.Println(public)
	if !*noOpen {
		go func() {
			time.Sleep(200 * time.Millisecond)
			_ = openBrowser(public)
		}()
	}

	log.Fatal(http.Serve(ln, mux))
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
	_, _ = io.WriteString(w, `{"localViewer":true}`+"\n")
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
