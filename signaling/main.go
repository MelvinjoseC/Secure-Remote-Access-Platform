package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development and MVP
	},
}

// Hub manages active agent and client WebSockets
type Hub struct {
	mu      sync.RWMutex
	agents  map[string]*websocket.Conn
	clients map[string]*websocket.Conn
}

var hub = Hub{
	agents:  make(map[string]*websocket.Conn),
	clients: make(map[string]*websocket.Conn),
}

var (
	rateLimitMap = make(map[string][]time.Time)
	rateLimitMu  sync.Mutex
)

func isRateLimited(ip string, limit int, window time.Duration) bool {
	rateLimitMu.Lock()
	defer rateLimitMu.Unlock()

	now := time.Now()
	var validTimes []time.Time
	for _, t := range rateLimitMap[ip] {
		if now.Sub(t) < window {
			validTimes = append(validTimes, t)
		}
	}

	if len(validTimes) >= limit {
		rateLimitMap[ip] = validTimes
		return true
	}

	validTimes = append(validTimes, now)
	rateLimitMap[ip] = validTimes
	return false
}

func getClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8443"
	}
	apiKey := os.Getenv("SIGNALING_API_KEY")
	if apiKey == "" {
		apiKey = "dev-signaling-secret-key"
	}

	certFile := os.Getenv("SSL_CERT_FILE")
	keyFile := os.Getenv("SSL_KEY_FILE")

	http.HandleFunc("/healthz", handleHealthz)
	http.HandleFunc("/readyz", handleReadyz)
	http.HandleFunc("/agent/register", handleAgentRegister)
	http.HandleFunc("/client/connect", handleClientConnect)
	http.HandleFunc("/api/devices", func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		if isRateLimited(ip, 30, time.Minute) {
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}
		handleListDevices(w, r, apiKey)
	})
	http.HandleFunc("/api/devices/telemetry", func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		if isRateLimited(ip, 30, time.Minute) {
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}
		handleDeviceTelemetry(w, r, apiKey)
	})

	log.Printf("Signaling server starting on port %s...", port)
	if certFile != "" && keyFile != "" {
		log.Printf("TLS enabled using cert: %s, key: %s", certFile, keyFile)
		err := http.ListenAndServeTLS(":"+port, certFile, keyFile, nil)
		if err != nil {
			log.Fatalf("ListenAndServeTLS error: %v", err)
		}
	} else {
		log.Printf("WARNING: TLS not configured, running on HTTP")
		err := http.ListenAndServe(":"+port, nil)
		if err != nil {
			log.Fatalf("ListenAndServe error: %v", err)
		}
	}
}

// handleAgentRegister registers a device agent's outbound WebSocket
func handleAgentRegister(w http.ResponseWriter, r *http.Request) {
	deviceId := r.URL.Query().Get("deviceId")
	token := r.URL.Query().Get("token")

	if deviceId == "" {
		http.Error(w, "deviceId is required", http.StatusBadRequest)
		return
	}

	// Validate agent registration token against configured key
	expectedAgentToken := os.Getenv("AGENT_AUTH_TOKEN")
	if expectedAgentToken == "" {
		expectedAgentToken = "agent-secure-token-123"
	}
	if token != expectedAgentToken {
		http.Error(w, "Unauthorized: invalid agent token", http.StatusUnauthorized)
		log.Printf("Agent registration rejected for %s: invalid token", deviceId)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Agent upgrade failed for %s: %v", deviceId, err)
		return
	}

	hub.mu.Lock()
	// Clean up old connection if exists
	if oldConn, ok := hub.agents[deviceId]; ok {
		oldConn.Close()
	}
	hub.agents[deviceId] = conn
	hub.mu.Unlock()

	log.Printf("Agent %s registered successfully", deviceId)

	defer func() {
		hub.mu.Lock()
		if hub.agents[deviceId] == conn {
			delete(hub.agents, deviceId)
		}
		// If a client is connected, notify them of agent disconnect
		if clientConn, ok := hub.clients[deviceId]; ok {
			clientConn.WriteJSON(map[string]string{
				"type":  "disconnect",
				"error": "agent_disconnected",
			})
		}
		hub.mu.Unlock()
		conn.Close()
		log.Printf("Agent %s disconnected", deviceId)
	}()

	// Read messages from Agent and relay to Client
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var rawMsg map[string]interface{}
		if err := json.Unmarshal(message, &rawMsg); err == nil {
			if rawMsg["type"] == "telemetry" {
				var telMsg struct {
					Telemetry interface{} `json:"telemetry"`
				}
				if err := json.Unmarshal(message, &telMsg); err == nil {
					cacheTelemetry(deviceId, telMsg.Telemetry)
				}
				continue // consume telemetry message, do not relay to client
			}
		}

		hub.mu.RLock()
		clientConn, hasClient := hub.clients[deviceId]
		hub.mu.RUnlock()

		if hasClient {
			err = clientConn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("Error relaying message from Agent %s to Client: %v", deviceId, err)
			}
		}
	}
}

// handleClientConnect handles a browser viewer dashboard connection
func handleClientConnect(w http.ResponseWriter, r *http.Request) {
	deviceId := r.URL.Query().Get("deviceId")
	token := r.URL.Query().Get("token")

	if deviceId == "" {
		http.Error(w, "deviceId is required", http.StatusBadRequest)
		return
	}

	// Validate client JWT token
	claims, err := verifyToken(token)
	if err != nil {
		http.Error(w, "Unauthorized: invalid session token", http.StatusUnauthorized)
		log.Printf("Client connect rejected for device %s: %v", deviceId, err)
		return
	}

	// Restrict connection capability using RBAC roles
	if claims.Role != "admin" && claims.Role != "operator" {
		http.Error(w, "Forbidden: insufficient permissions", http.StatusForbidden)
		log.Printf("User %s rejected for device %s: user is %s (only admin/operator allowed)", claims.Sub, deviceId, claims.Role)
		return
	}

	hub.mu.RLock()
	agentConn, hasAgent := hub.agents[deviceId]
	hub.mu.RUnlock()

	if !hasAgent {
		http.Error(w, "agent not online", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Client upgrade failed for %s: %v", deviceId, err)
		return
	}

	hub.mu.Lock()
	// Clean up old connection if exists
	if oldConn, ok := hub.clients[deviceId]; ok {
		oldConn.Close()
	}
	hub.clients[deviceId] = conn
	hub.mu.Unlock()

	log.Printf("Client connected for device %s", deviceId)

	defer func() {
		hub.mu.Lock()
		if hub.clients[deviceId] == conn {
			delete(hub.clients, deviceId)
		}
		// Notify agent that client disconnected so it resets its peer connection
		if agentConn, ok := hub.agents[deviceId]; ok {
			disconnectMsg, _ := json.Marshal(map[string]string{
				"type": "disconnect",
			})
			agentConn.WriteMessage(websocket.TextMessage, disconnectMsg)
		}
		hub.mu.Unlock()
		conn.Close()
		log.Printf("Client disconnected for device %s", deviceId)
	}()

	// Read messages from Client (browser) and relay to Agent (SDP offers, ICE candidates, and quality control commands)
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		hub.mu.RLock()
		agentConn, hasAgent = hub.agents[deviceId]
		hub.mu.RUnlock()

		if hasAgent {
			err = agentConn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("Error relaying message from Client to Agent %s: %v", deviceId, err)
			}
		}
	}
}

// handleListDevices returns the list of online devices
func handleListDevices(w http.ResponseWriter, r *http.Request, apiKey string) {
	// Simple API key authentication
	authHeader := r.Header.Get("Authorization")
	expectedAuth := "Bearer " + apiKey
	if authHeader != expectedAuth {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	hub.mu.RLock()
	devices := make([]string, 0, len(hub.agents))
	for deviceId := range hub.agents {
		devices = append(devices, deviceId)
	}
	hub.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices)
}

// Telemetry caching structures and handlers
var (
	telemetryCache = make(map[string]interface{})
	telemetryMu    sync.RWMutex
)

func cacheTelemetry(deviceId string, data interface{}) {
	telemetryMu.Lock()
	defer telemetryMu.Unlock()
	telemetryCache[deviceId] = data
}

func getTelemetry(deviceId string) (interface{}, bool) {
	telemetryMu.RLock()
	defer telemetryMu.RUnlock()
	data, ok := telemetryCache[deviceId]
	return data, ok
}

func handleDeviceTelemetry(w http.ResponseWriter, r *http.Request, apiKey string) {
	authHeader := r.Header.Get("Authorization")
	expectedAuth := "Bearer " + apiKey
	if authHeader != expectedAuth {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	deviceId := r.URL.Query().Get("deviceId")
	if deviceId != "" {
		data, found := getTelemetry(deviceId)
		if !found {
			http.Error(w, "Telemetry not found for device", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(data)
		return
	}

	telemetryMu.RLock()
	defer telemetryMu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(telemetryCache)
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"service":   "signaling",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func handleReadyz(w http.ResponseWriter, r *http.Request) {
	hub.mu.RLock()
	agentCount := len(hub.agents)
	clientCount := len(hub.clients)
	hub.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":           "ready",
		"connected_agents": agentCount,
		"active_clients":   clientCount,
		"timestamp":        time.Now().UTC().Format(time.RFC3339),
	})
}
