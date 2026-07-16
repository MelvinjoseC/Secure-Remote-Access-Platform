// +build !linux,!windows

package main

import "log"

func injectMouseMove(x, y float64) {
	log.Printf("[INPUT STUB] Mouse Move: X=%.4f, Y=%.4f", x, y)
}

func injectMouseButton(button string, x, y float64, down bool) {
	log.Printf("[INPUT STUB] Mouse Button: %s (down=%v) at (%.4f, %.4f)", button, down, x, y)
}

func injectKey(key string, down bool) {
	log.Printf("[INPUT STUB] Key: %s (down=%v)", key, down)
}
