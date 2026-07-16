package main

import (
	"encoding/json"
	"log"
)

// InputEvent represents mouse or keyboard actions received from the dashboard
type InputEvent struct {
	Type   string  `json:"type"`             // "mousemove", "mousedown", "mouseup", "keydown", "keyup"
	Button string  `json:"button,omitempty"`  // "left", "right", "middle"
	Key    string  `json:"key,omitempty"`     // e.g., "a", "Enter", "ArrowUp"
	X      float64 `json:"x,omitempty"`       // Normalized X (0.0 to 1.0)
	Y      float64 `json:"y,omitempty"`       // Normalized Y (0.0 to 1.0)
}

// HandleInputEvent decodes and injects input events locally
func HandleInputEvent(data []byte) {
	var event InputEvent
	err := json.Unmarshal(data, &event)
	if err != nil {
		log.Printf("Failed to unmarshal input event: %v", err)
		return
	}

	switch event.Type {
	case "mousemove":
		injectMouseMove(event.X, event.Y)
	case "mousedown":
		injectMouseButton(event.Button, event.X, event.Y, true)
	case "mouseup":
		injectMouseButton(event.Button, event.X, event.Y, false)
	case "keydown":
		injectKey(event.Key, true)
	case "keyup":
		injectKey(event.Key, false)
	default:
		log.Printf("Unknown input event type: %s", event.Type)
	}
}
