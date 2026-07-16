// +build windows

package main

import (
	"log"
	"syscall"
	"unsafe"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	procSendInput    = user32.NewProc("SendInput")
)

type wMOUSEINPUT struct {
	Dx          int32
	Dy          int32
	MouseData   uint32
	DwFlags     uint32
	Time        uint32
	DwExtraInfo uintptr
}

type wKEYBDINPUT struct {
	WVk         uint16
	WScan       uint16
	DwFlags     uint32
	Time        uint32
	DwExtraInfo uintptr
}

type wINPUTMouse struct {
	Type uint32
	_    uint32 // Padding for x64 alignment of union
	Mi   wMOUSEINPUT
}

type wINPUTKeyboard struct {
	Type uint32
	_    uint32 // Padding for x64 alignment of union
	Ki   wKEYBDINPUT
	_    uint64 // Padding to match 32-byte union size (extra space)
	_    uint32
}

const (
	INPUT_MOUSE    = 0
	INPUT_KEYBOARD = 1

	MOUSEEVENTF_MOVE     = 0x0001
	MOUSEEVENTF_LEFTDOWN = 0x0002
	MOUSEEVENTF_LEFTUP   = 0x0004
	MOUSEEVENTF_RIGHTDOWN= 0x0008
	MOUSEEVENTF_RIGHTUP  = 0x0010
	MOUSEEVENTF_ABSOLUTE = 0x8000

	KEYEVENTF_KEYUP      = 0x0002
)

func injectMouseMove(x, y float64) {
	posX := int32(x * 65535)
	posY := int32(y * 65535)

	var input wINPUTMouse
	input.Type = INPUT_MOUSE
	input.Mi.Dx = posX
	input.Mi.Dy = posY
	input.Mi.DwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE

	procSendInput.Call(1, uintptr(unsafe.Pointer(&input)), unsafe.Sizeof(input))
}

func injectMouseButton(button string, x, y float64, down bool) {
	// First move cursor to click coordinates
	injectMouseMove(x, y)

	var flags uint32
	switch button {
	case "left":
		if down {
			flags = MOUSEEVENTF_LEFTDOWN
		} else {
			flags = MOUSEEVENTF_LEFTUP
		}
	case "right":
		if down {
			flags = MOUSEEVENTF_RIGHTDOWN
		} else {
			flags = MOUSEEVENTF_RIGHTUP
		}
	default:
		return
	}

	var input wINPUTMouse
	input.Type = INPUT_MOUSE
	input.Mi.DwFlags = flags

	procSendInput.Call(1, uintptr(unsafe.Pointer(&input)), unsafe.Sizeof(input))
}

func injectKey(key string, down bool) {
	vk := keyToVk(key)
	if vk == 0 {
		log.Printf("[Windows] Virtual key mapping not found for: %s", key)
		return
	}

	var flags uint32
	if !down {
		flags = KEYEVENTF_KEYUP
	}

	var input wINPUTKeyboard
	input.Type = INPUT_KEYBOARD
	input.Ki.WVk = vk
	input.Ki.DwFlags = flags

	procSendInput.Call(1, uintptr(unsafe.Pointer(&input)), unsafe.Sizeof(input))
}

func keyToVk(key string) uint16 {
	if len(key) == 1 {
		char := key[0]
		if char >= 'a' && char <= 'z' {
			return uint16(char - 'a' + 0x41)
		}
		if char >= 'A' && char <= 'Z' {
			return uint16(char - 'A' + 0x41)
		}
		if char >= '0' && char <= '9' {
			return uint16(char - '0' + 0x30)
		}
	}
	switch key {
	case "Enter":
		return 0x0D // VK_RETURN
	case "Space", " ":
		return 0x20 // VK_SPACE
	case "Backspace":
		return 0x08 // VK_BACK
	case "Tab":
		return 0x09 // VK_TAB
	case "Escape":
		return 0x1B // VK_ESCAPE
	case "ArrowUp":
		return 0x26 // VK_UP
	case "ArrowDown":
		return 0x28 // VK_DOWN
	case "ArrowLeft":
		return 0x25 // VK_LEFT
	case "ArrowRight":
		return 0x27 // VK_RIGHT
	}
	return 0
}
