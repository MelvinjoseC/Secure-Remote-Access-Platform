//go:build !docker
// +build !docker

package main

import (
	"image"

	"github.com/kbinani/screenshot"
)

func capturePhysicalScreen() (image.Image, error) {
	num := screenshot.NumActiveMonitors()
	if num <= 0 {
		return nil, nil
	}

	bounds := screenshot.GetDisplayBounds(0)
	return screenshot.CaptureRect(bounds)
}
