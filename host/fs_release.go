//go:build release

package main

import (
	"embed"
	"fmt"
	"io/fs"
)

//go:embed all:web
var releaseWeb embed.FS

func openWebFS(explicitRoot string) (fs.FS, error) {
	if explicitRoot != "" {
		return nil, fmt.Errorf("-root is only for dev builds (omit -tags release)")
	}
	sub, err := fs.Sub(releaseWeb, "web")
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return nil, fmt.Errorf("embedded web missing index.html (run scripts/sync-local-viewer-web.sh): %w", err)
	}
	return sub, nil
}
