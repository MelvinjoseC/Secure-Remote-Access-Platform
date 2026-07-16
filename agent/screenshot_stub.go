//go:build docker
// +build docker

package main

import (
	"errors"
	"image"
)

func capturePhysicalScreen() (image.Image, error) {
	// Inside docker we compile headlessly without physical monitor access,
	// so we trigger the animated fallback simulated interface.
	return nil, errors.New("physical screen capture disabled in headless docker container")
}
