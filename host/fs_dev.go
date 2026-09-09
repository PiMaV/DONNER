//go:build !release

package main

import (
	"io/fs"
	"os"
)

func openWebFS(explicitRoot string) (fs.FS, error) {
	root, err := resolveDevRoot(explicitRoot)
	if err != nil {
		return nil, err
	}
	return os.DirFS(root), nil
}
