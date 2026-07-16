# Secure Remote Access Agent

A lightweight Go agent designed to run on the controlled machine. It connects outbound-only to the signaling server, captures the screen (with a fallback simulation for headless systems), and streams it over WebRTC data channels.

## Features
- **Outbound-only connection**: No inbound port forwarding required. Works behind industrial NATs/firewalls.
- **Cross-platform screen capture**: Uses `github.com/kbinani/screenshot` for native capturing.
- **Headless mode fallback**: Automatically generates a beautiful mock interface with a bouncing ball animation if no physical screen/monitor is found (ideal for testing in Docker containers!).
- **Input Injection**: Decodes incoming mouse/keyboard controls and stubs injection.
- **TLS verification config**: Supports connecting to self-signed TLS signaling servers with a `insecure_skip_verify` flag.

## Configuration (`config.yaml`)

- `signaling_url`: The WebSocket URL of the signaling server (e.g. `wss://signaling:8443`).
- `device_id`: A unique string identifier for this agent.
- `auth_token`: Auth token passed to the signaling server during registration.
- `insecure_skip_verify`: Set to `true` to skip TLS validation for local self-signed certs.
- `capture_interval_ms`: Screen capture frequency (default `500` ms).

## Standalone Development Setup

1. **Install Go dependencies**:
   ```bash
   go mod download
   ```

2. **Run agent**:
   ```bash
   go run main.go input.go
   ```

Note: When running locally, ensure the configuration file `config.yaml` is present in the working directory.

## Security & Encryption
* **DTLS-SRTP**: All media and data channel traffic (video and keyboard/mouse controls) is encrypted end-to-end between the browser client and the agent using WebRTC's standard DTLS-SRTP protocols.
* **TLS Enforcement**: By default, `insecure_skip_verify` is set to `false`. If the custom CA certificate exists at `/certs/ca.crt`, the agent will load and trust it automatically.

## Dependencies
* **FFmpeg**: Spawns as a subprocess to encode raw screens to VP8 video format in real-time. Ensure `ffmpeg` is installed and available in the environment's `PATH`.

