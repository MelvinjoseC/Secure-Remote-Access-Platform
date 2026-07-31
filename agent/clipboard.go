package main

import (
	"log"
	"os/exec"
	"runtime"
	"sync"
)

var (
	clipboardMutex sync.Mutex
	localClipboard string
)

func writeToSystemClipboard(text string) {
	clipboardMutex.Lock()
	localClipboard = text
	clipboardMutex.Unlock()

	// Try writing using system tools depending on OS
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			cmd = exec.Command("xsel", "--clipboard", "--input")
		}
	case "darwin":
		cmd = exec.Command("pbcopy")
	case "windows":
		cmd = exec.Command("powershell", "-NoProfile", "-Command", "Set-Clipboard")
	}

	if cmd != nil {
		stdin, err := cmd.StdinPipe()
		if err == nil {
			if err := cmd.Start(); err == nil {
				_, _ = stdin.Write([]byte(text))
				_ = stdin.Close()
				_ = cmd.Wait()
				return
			}
		}
	}
	log.Printf("Clipboard set in-memory (fallback): %s", text)
}

func readSystemClipboard() string {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard", "-o")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			cmd = exec.Command("xsel", "--clipboard", "--output")
		}
	case "darwin":
		cmd = exec.Command("pbpaste")
	case "windows":
		cmd = exec.Command("powershell", "-NoProfile", "-Command", "Get-Clipboard")
	}

	if cmd != nil {
		out, err := cmd.Output()
		if err == nil {
			return string(out)
		}
	}

	clipboardMutex.Lock()
	defer clipboardMutex.Unlock()
	return localClipboard
}
