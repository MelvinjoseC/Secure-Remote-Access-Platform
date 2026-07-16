# WebRTC Signaling Server

A lightweight Go WebRTC signaling server that facilitates peer matching and SDP/ICE candidate exchange.

## Features
- **Outbound-only agent connection**: Agents connect and register via outbound WebSockets.
- **Client pairing**: Clients connect via WebSockets and are paired with the matching agent by `deviceId`.
- **Relay logic**: Relays SDP offers, answers, and ICE candidates between paired connections.
- **Status API**: Secure API endpoint for querying active device connections.
- **TLS support**: Native TLS listener configuration.

## Environment Variables
- `PORT` (default: `8443`): The port the server listens on.
- `SIGNALING_API_KEY` (default: `dev-signaling-secret-key`): Pre-shared key for authenticating the dashboard API requests.
- `SSL_CERT_FILE` (optional): Path to the SSL certificate (`.crt`).
- `SSL_KEY_FILE` (optional): Path to the SSL private key (`.key`).

## Standalone Development Setup

1. **Install dependencies**:
   ```bash
   go mod download
   ```

2. **Run server (without TLS)**:
   ```bash
   go run main.go
   ```

3. **Run server (with TLS)**:
   ```bash
   export PORT=8443
   export SSL_CERT_FILE=../certs/server.crt
   export SSL_KEY_FILE=../certs/server.key
   export SIGNALING_API_KEY=my-super-secret-key
   go run main.go
   ```

## WebSocket Endpoints

- **Agent registration**: `wss://<host>:<port>/agent/register?deviceId=<id>&token=<auth-token>`
- **Client connection**: `wss://<host>:<port>/client/connect?deviceId=<id>&token=<session-token>`

## REST API Endpoints

- **List active devices**: `GET /api/devices`
  - Headers: `Authorization: Bearer <SIGNALING_API_KEY>`
  - Response: `["device-id-1", "device-id-2"]`

## Security & Encryption
* **DTLS-SRTP**: Once the signaling server facilitates the SDP/ICE candidate exchange, the actual media (video) and input events flow directly between browser and agent (or relayed through TURN). The payload is fully encrypted using WebRTC's standard DTLS-SRTP protocol.
* **Rate Limiting**: The `/api/devices` REST endpoint is protected by an IP-based rate limiter (maximum 30 requests per minute).

## TURN Server Relay
* For environments behind symmetric firewalls or strict NATs, a **coturn** server container is integrated.
* **TURN configurations**:
  - Host: `localhost:3478` (for client browser) or `turn:3478` (for docker container agent)
  - Username: `demo`
  - Credential: `password123`
  - *Note: In production, dynamic short-lived credentials via shared secret (REST API auth) must be implemented.*

