package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"io"
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"gopkg.in/yaml.v3"
)

// Config represents YAML configuration
type Config struct {
	SignalingURL       string `yaml:"signaling_url"`
	DeviceID           string `yaml:"device_id"`
	AuthToken          string `yaml:"auth_token"`
	InsecureSkipVerify bool   `yaml:"insecure_skip_verify"`
	CaptureIntervalMS  int    `yaml:"capture_interval_ms"`
}

type SignalMessage struct {
	Type      string                     `json:"type"`
	SDP       string                     `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit   `json:"candidate,omitempty"`
}

type TelemetryMessage struct {
	Type      string        `json:"type"`
	Telemetry TelemetryData `json:"telemetry"`
}

var (
	pcMutex         sync.Mutex
	activePC        *webrtc.PeerConnection
	wsMutex         sync.Mutex
	wsConn          *websocket.Conn
	streaming       bool
	streamingCtx    context.Context
	streamingCancel context.CancelFunc
)

func main() {
	log.Println("Starting Secure Remote Access Agent...")

	// 1. Read Config
	configData, err := ioutil.ReadFile("config.yaml")
	if err != nil {
		log.Fatalf("Failed to read config.yaml: %v", err)
	}

	var config Config
	err = yaml.Unmarshal(configData, &config)
	if err != nil {
		log.Fatalf("Failed to parse config.yaml: %v", err)
	}

	if config.CaptureIntervalMS <= 0 {
		config.CaptureIntervalMS = 500
	}

	// 2. Setup Shutdown Handlers
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	// 3. Connect to Signaling Server
	u, err := url.Parse(config.SignalingURL)
	if err != nil {
		log.Fatalf("Invalid signaling URL: %v", err)
	}

	registerURL := u.String() + "/agent/register?deviceId=" + config.DeviceID + "&token=" + config.AuthToken
	log.Printf("Connecting to Signaling Server: %s", registerURL)

	tlsConfig := &tls.Config{
		InsecureSkipVerify: config.InsecureSkipVerify,
	}

	caCertPath := "/certs/ca.crt"
	if _, err := os.Stat(caCertPath); err == nil {
		caCert, err := os.ReadFile(caCertPath)
		if err == nil {
			caCertPool := x509.NewCertPool()
			if caCertPool.AppendCertsFromPEM(caCert) {
				tlsConfig.RootCAs = caCertPool
				log.Printf("Successfully loaded custom Root CA from %s", caCertPath)
			}
		}
	}

	dialer := websocket.Dialer{
		TLSClientConfig:  tlsConfig,
		HandshakeTimeout: 10 * time.Second,
	}

	var conn *websocket.Conn
	// Retry loop for connecting to signaling server
	for {
		conn, _, err = dialer.Dial(registerURL, nil)
		if err != nil {
			log.Printf("Dial failed: %v. Retrying in 5 seconds...", err)
			select {
			case <-shutdown:
				log.Println("Shutdown received during connection retry.")
				return
			case <-time.After(5 * time.Second):
				continue
			}
		}
		break
	}
	defer conn.Close()

	wsMutex.Lock()
	wsConn = conn
	wsMutex.Unlock()
	log.Println("Connected to Signaling Server successfully!")

	// Goroutine to send periodic telemetry reports
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-shutdown:
				return
			case <-ticker.C:
				data := collectTelemetry()
				telemetryMsg := TelemetryMessage{
					Type:      "telemetry",
					Telemetry: data,
				}
				payload, err := json.Marshal(telemetryMsg)
				if err != nil {
					log.Printf("Failed to marshal telemetry: %v", err)
					continue
				}
				
				wsMutex.Lock()
				if wsConn != nil {
					err = wsConn.WriteMessage(websocket.TextMessage, payload)
					if err != nil {
						log.Printf("Failed to send telemetry: %v", err)
					}
				}
				wsMutex.Unlock()
			}
		}
	}()

	// Goroutine to handle signaling messages
	go func() {
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("WebSocket disconnected: %v", err)
				shutdown <- syscall.SIGTERM
				return
			}
			handleSignalingMessage(message, &config)
		}
	}()

	<-shutdown
	log.Println("Shutting down agent...")
	closePeerConnection()
}

func closePeerConnection() {
	pcMutex.Lock()
	defer pcMutex.Unlock()
	if streamingCancel != nil {
		streamingCancel()
		streamingCancel = nil
	}
	if activePC != nil {
		log.Println("Closing existing PeerConnection...")
		activePC.Close()
		activePC = nil
	}
	streaming = false
}

func handleSignalingMessage(message []byte, config *Config) {
	var msg SignalMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		log.Printf("Error parsing signaling message: %v", err)
		return
	}

	switch msg.Type {
	case "offer":
		log.Println("Received WebRTC Offer from Client. Initializing PeerConnection...")
		closePeerConnection()

		pcMutex.Lock()
		defer pcMutex.Unlock()

		// Create PeerConnection
		webrtcCfg := webrtc.Configuration{
			ICEServers: []webrtc.ICEServer{
				{
					URLs: []string{"stun:stun.l.google.com:19302"},
				},
				{
					URLs:       []string{"turn:turn:3478"},
					Username:   "demo",
					Credential: "password123",
				},
			},
		}

		// Setup SettingEngine to restrict UDP port and map NAT
		s := webrtc.SettingEngine{}
		err := s.SetEphemeralUDPPortRange(50000, 50000)
		if err != nil {
			log.Printf("Failed to set port range: %v", err)
		}
		
		natIP := os.Getenv("NAT_1TO1_IP")
		if natIP == "" {
			natIP = "127.0.0.1"
		}
		log.Printf("Setting WebRTC NAT 1:1 IP to: %s (port 50000/udp)", natIP)
		s.SetNAT1To1IPs([]string{natIP}, webrtc.ICECandidateTypeHost)

		api := webrtc.NewAPI(webrtc.WithSettingEngine(s))
		pc, err := api.NewPeerConnection(webrtcCfg)
		if err != nil {
			log.Printf("Failed to create PeerConnection: %v", err)
			return
		}
		activePC = pc

		// Create Video Track (VP8)
		videoTrack, err := webrtc.NewTrackLocalStaticSample(
			webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8},
			"video",
			"pion",
		)
		if err != nil {
			log.Printf("Failed to create video track: %v", err)
			return
		}
		rtpSender, err := pc.AddTrack(videoTrack)
		if err != nil {
			log.Printf("Failed to add video track to PeerConnection: %v", err)
			return
		}
		// Read incoming RTCP
		go func() {
			rtcpBuf := make([]byte, 1500)
			for {
				if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
					return
				}
			}
		}()

		// Set Remote Description (Offer)
		sdp := webrtc.SessionDescription{
			Type: webrtc.SDPTypeOffer,
			SDP:  msg.SDP,
		}
		if err := pc.SetRemoteDescription(sdp); err != nil {
			log.Printf("Failed to set remote description: %v", err)
			return
		}

		// Set ICE candidate callbacks
		pc.OnICECandidate(func(c *webrtc.ICECandidate) {
			if c == nil {
				return
			}
			candidateInit := c.ToJSON()
			candidateMsg := SignalMessage{
				Type:      "candidate",
				Candidate: &candidateInit,
			}
			data, _ := json.Marshal(candidateMsg)

			wsMutex.Lock()
			if wsConn != nil {
				_ = wsConn.WriteMessage(websocket.TextMessage, data)
			}
			wsMutex.Unlock()
		})

		// Set connection state change callback
		pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
			log.Printf("PeerConnection State Changed: %s", s.String())
			if s == webrtc.PeerConnectionStateConnected {
				log.Println("PeerConnection Connected. Starting FFmpeg screen streaming...")
				startScreenStreaming(videoTrack)
			} else if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
				closePeerConnection()
			}
		})

		// Listen for data channels opened by client
		pc.OnDataChannel(func(d *webrtc.DataChannel) {
			log.Printf("DataChannel opened by client: %s", d.Label())

			if d.Label() == "input" {
				d.OnMessage(func(msg webrtc.DataChannelMessage) {
					HandleInputEvent(msg.Data)
				})
			}
		})

		// Create Answer
		answer, err := pc.CreateAnswer(nil)
		if err != nil {
			log.Printf("Failed to create WebRTC Answer: %v", err)
			return
		}

		if err := pc.SetLocalDescription(answer); err != nil {
			log.Printf("Failed to set local description: %v", err)
			return
		}

		// Send Answer
		answerMsg := SignalMessage{
			Type: "answer",
			SDP:  answer.SDP,
		}
		answerData, _ := json.Marshal(answerMsg)

		wsMutex.Lock()
		if wsConn != nil {
			_ = wsConn.WriteMessage(websocket.TextMessage, answerData)
		}
		wsMutex.Unlock()
		log.Println("Sent WebRTC Answer to Client")

	case "candidate":
		log.Println("Received ICE Candidate from Client")
		pcMutex.Lock()
		pc := activePC
		pcMutex.Unlock()

		if pc != nil && msg.Candidate != nil {
			if err := pc.AddICECandidate(*msg.Candidate); err != nil {
				log.Printf("Failed to add ICE candidate: %v", err)
			}
		}

	case "disconnect":
		log.Println("Received Disconnect signal from Signaling Server. Resetting...")
		closePeerConnection()
	}
}

func startScreenStreaming(videoTrack *webrtc.TrackLocalStaticSample) {
	pcMutex.Lock()
	if streamingCancel != nil {
		streamingCancel()
	}
	streamingCtx, streamingCancel = context.WithCancel(context.Background())
	ctx := streamingCtx
	pcMutex.Unlock()

	streaming = true

	// Get initial frame dimensions
	initImg, err := captureScreenImage()
	if err != nil {
		log.Printf("Failed to capture initial screen frame: %v", err)
		return
	}
	bounds := initImg.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	log.Printf("Starting FFmpeg screen encoder with dimensions: %dx%d", w, h)

	// Spawn FFmpeg to read raw RGBA and output VP8 IVF
	cmd := exec.Command(
		"ffmpeg",
		"-f", "rawvideo",
		"-pix_fmt", "rgba",
		"-s", fmt.Sprintf("%dx%d", w, h),
		"-r", "10",
		"-i", "-",
		"-f", "ivf",
		"-vcodec", "vp8",
		"-deadline", "realtime",
		"-cpu-used", "4",
		"-",
	)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("Failed to get FFmpeg stdin pipe: %v", err)
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Failed to get FFmpeg stdout pipe: %v", err)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start FFmpeg process: %v. Please make sure ffmpeg is installed.", err)
		return
	}

	// Stdin writer (captures screen at 10 FPS and pipes to FFmpeg)
	go func() {
		defer stdin.Close()
		ticker := time.NewTicker(100 * time.Millisecond) // 10 FPS
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				img, err := captureScreenImage()
				if err != nil {
					continue
				}
				rgbaBytes := getRGBABytes(img)
				_, err = stdin.Write(rgbaBytes)
				if err != nil {
					log.Printf("Error writing raw frame to FFmpeg stdin: %v", err)
					return
				}
			}
		}
	}()

	// Stdout reader (reads IVF VP8 packets and sends them to WebRTC track)
	go func() {
		defer cmd.Process.Kill()

		ivfHeader := make([]byte, 32)
		if _, err := io.ReadFull(stdout, ivfHeader); err != nil {
			log.Printf("Error reading IVF header from FFmpeg: %v", err)
			return
		}

		for {
			select {
			case <-ctx.Done():
				return
			default:
				frameHeader := make([]byte, 12)
				if _, err := io.ReadFull(stdout, frameHeader); err != nil {
					if err != io.EOF && ctx.Err() == nil {
						log.Printf("Error reading IVF frame header: %v", err)
					}
					return
				}

				frameSize := uint32(frameHeader[0]) |
					uint32(frameHeader[1])<<8 |
					uint32(frameHeader[2])<<16 |
					uint32(frameHeader[3])<<24

				payload := make([]byte, frameSize)
				if _, err := io.ReadFull(stdout, payload); err != nil {
					log.Printf("Error reading IVF frame payload: %v", err)
					return
				}

				err = videoTrack.WriteSample(media.Sample{
					Data:     payload,
					Duration: 100 * time.Millisecond,
				})
				if err != nil {
					log.Printf("Error writing sample to track: %v", err)
					return
				}
			}
		}
	}()
}

func captureScreenImage() (image.Image, error) {
	img, err := capturePhysicalScreen()
	if err != nil || img == nil {
		return captureDummyScreenImage(), nil
	}
	return img, nil
}

func getRGBABytes(img image.Image) []byte {
	if rgba, ok := img.(*image.RGBA); ok {
		return rgba.Pix
	}
	bounds := img.Bounds()
	rgba := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(rgba, rgba.Bounds(), img, bounds.Min, draw.Src)
	return rgba.Pix
}

// Bouncing ball simulation variables for dummy capture
var (
	ballX   = 100.0
	ballY   = 100.0
	speedX  = 12.0
	speedY  = 9.0
	ballMu  sync.Mutex
	angle   = 0.0
)

func captureDummyScreenImage() *image.RGBA {
	ballMu.Lock()
	defer ballMu.Unlock()

	width, height := 800, 600
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// Background gradient
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			r := uint8(15 + (x * 12 / width))
			g := uint8(20 + (y * 18 / height))
			b := uint8(35 + ((x + y) * 5 / (width + height)))
			img.Set(x, y, color.RGBA{r, g, b, 255})
		}
	}

	// Grid lines
	gridColor := color.RGBA{38, 48, 70, 255}
	for x := 0; x < width; x += 40 {
		for y := 0; y < height; y++ {
			img.Set(x, y, gridColor)
		}
	}
	for y := 0; y < height; y += 40 {
		for x := 0; x < width; x++ {
			img.Set(x, y, gridColor)
		}
	}

	// Header bar:
	for x := 0; x < width; x++ {
		for y := 0; y < 60; y++ {
			img.Set(x, y, color.RGBA{10, 15, 30, 255})
		}
	}

	// Bouncing Ball
	ballColor := color.RGBA{0, 224, 255, 255} // Electric cyan
	ballRadius := 20
	ballX += speedX
	ballY += speedY

	if ballX-float64(ballRadius) < 0 || ballX+float64(ballRadius) > float64(width) {
		speedX = -speedX
	}
	if ballY-float64(ballRadius) < 60 || ballY+float64(ballRadius) > float64(height) {
		speedY = -speedY
	}

	for y := int(ballY) - ballRadius; y <= int(ballY)+ballRadius; y++ {
		for x := int(ballX) - ballRadius; x <= int(ballX)+ballRadius; x++ {
			if x >= 0 && x < width && y >= 60 && y < height {
				dx := float64(x) - ballX
				dy := float64(y) - ballY
				if dx*dx+dy*dy <= float64(ballRadius*ballRadius) {
					img.Set(x, y, ballColor)
				}
			}
		}
	}

	// Draw Green Status Badge on the header (x=30, y=30)
	statusColor := color.RGBA{0, 230, 118, 255} // Bright green
	for dy := -6; dy <= 6; dy++ {
		for dx := -6; dx <= 6; dx++ {
			if dx*dx+dy*dy <= 36 {
				img.Set(30+dx, 30+dy, statusColor)
			}
		}
	}

	// Draw decorative progress indicator bar that cycles
	angle += 0.1
	progressWidth := int(300 + 50*sin(angle))
	for x := 60; x < 60+progressWidth; x++ {
		for y := 27; y < 33; y++ {
			img.Set(x, y, color.RGBA{0, 224, 255, 255})
		}
	}

	return img
}

// Simple approximation of sine for bouncing ball and graphics animation
func sin(x float64) float64 {
	// Reduce x to [-pi, pi]
	const pi = 3.141592653589793
	for x > pi {
		x -= 2 * pi
	}
	for x < -pi {
		x += 2 * pi
	}
	// Taylor series approximation
	res := x
	term := x
	for i := 1; i < 5; i++ {
		term = -term * x * x / float64((2*i)*(2*i+1))
		res += term
	}
	return res
}
