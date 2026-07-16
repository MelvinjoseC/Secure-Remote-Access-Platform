// +build linux

package main

import (
	"log"
	"github.com/jezek/xgb"
	"github.com/jezek/xgb/xproto"
	"github.com/jezek/xgb/xtest"
)

var (
	xgbConn *xgb.Conn
	x11Width  uint16 = 800
	x11Height uint16 = 600
)

func initX11() {
	if xgbConn != nil {
		return
	}
	var err error
	xgbConn, err = xgb.NewConn()
	if err != nil {
		log.Printf("[X11] Failed to connect to X server: %v. Input injection will log only.", err)
		return
	}
	// Initialize XTest extension
	err = xtest.Init(xgbConn)
	if err != nil {
		log.Printf("[X11] XTest extension not available: %v. Input injection will log only.", err)
		xgbConn.Close()
		xgbConn = nil
		return
	}
	// Fetch screen size
	setup := xproto.Setup(xgbConn)
	if setup != nil && len(setup.Roots) > 0 {
		x11Width = setup.Roots[0].WidthInPixels
		x11Height = setup.Roots[0].HeightInPixels
	}
	log.Printf("[X11] Connected. Screen size: %dx%d", x11Width, x11Height)
}

func injectMouseMove(x, y float64) {
	initX11()
	if xgbConn == nil {
		log.Printf("[INPUT LOG ONLY] Mouse Move: X=%.4f, Y=%.4f", x, y)
		return
	}
	posX := int16(x * float64(x11Width))
	posY := int16(y * float64(x11Height))
	// Type 6 is MotionNotify
	xtest.FakeInput(xgbConn, 6, 0, 0, 0, posX, posY, 0)
}

func injectMouseButton(button string, x, y float64, down bool) {
	initX11()
	if xgbConn == nil {
		log.Printf("[INPUT LOG ONLY] Mouse Button: %s (down=%v) at (%.4f, %.4f)", button, down, x, y)
		return
	}
	var btn byte
	switch button {
	case "left":
		btn = 1
	case "middle":
		btn = 2
	case "right":
		btn = 3
	default:
		return
	}
	
	// Move cursor to click position first
	posX := int16(x * float64(x11Width))
	posY := int16(y * float64(x11Height))
	xtest.FakeInput(xgbConn, 6, 0, 0, 0, posX, posY, 0)

	var eventType byte = 5 // ButtonRelease
	if down {
		eventType = 4 // ButtonPress
	}
	xtest.FakeInput(xgbConn, eventType, btn, 0, 0, 0, 0, 0)
}

func injectKey(key string, down bool) {
	initX11()
	if xgbConn == nil {
		log.Printf("[INPUT LOG ONLY] Key: %s (down=%v)", key, down)
		return
	}
	keycode := keyToKeycode(key)
	if keycode == 0 {
		log.Printf("[X11] Keycode mapping not found for key: %s", key)
		return
	}
	var eventType byte = 3 // KeyRelease
	if down {
		eventType = 2 // KeyPress
	}
	xtest.FakeInput(xgbConn, eventType, keycode, 0, 0, 0, 0, 0)
}

func keyToKeycode(key string) byte {
	if len(key) == 1 {
		char := key[0]
		if char >= 'a' && char <= 'z' {
			return byte(char - 'a' + 38) // offset for lowercase keys
		}
		if char >= 'A' && char <= 'Z' {
			return byte(char - 'A' + 38)
		}
		if char >= '0' && char <= '9' {
			if char == '0' {
				return 19
			}
			return byte(char - '1' + 10)
		}
	}
	switch key {
	case "Enter":
		return 36
	case "Space", " ":
		return 65
	case "Backspace":
		return 22
	case "Tab":
		return 23
	case "Escape":
		return 9
	case "ArrowUp":
		return 111
	case "ArrowDown":
		return 116
	case "ArrowLeft":
		return 113
	case "ArrowRight":
		return 114
	}
	return 0
}
