# Secure Remote Access Platform Operations Console

This repository contains a secure, enterprise-grade outbound-only remote access platform built for industrial, drone, and marine operations center environments.

---

## 🚀 Advanced Features Implemented

1. **Role-Based Access Control (RBAC)**:
   - Three distinct roles: `admin` (management and log clearing), `operator` (remote session connection), and `auditor` (read-only audit compliance).
   - Dynamic user role updates inside an admin-exclusive `/users` dashboard panel.

2. **Multi-Factor Authentication (MFA)**:
   - Secure TOTP setup (`pyotp` backend integration) generating QR code pairing URIs.
   - Multi-stage user authentication login flow requiring 6-digit verification codes.

3. **System Telemetry & Live Diagnostics**:
   - Periodic resource metrics (CPU, RAM, Disk space, Goroutine count, Go version, Uptime) reported by Go agents.
   - In-depth telemetry details modal and real-time dashboard progress meters.

4. **Dynamic Video Scaling & Quality Presets**:
   - Stream quality control panel supporting High (1080p @ 20fps), Medium (720p @ 10fps), and Low (480p @ 5fps) presets.
   - Restarts FFmpeg compression sub-processes on the fly without dropping the WebRTC peer connection.

5. **WebRTC Diagnostics Sidebar**:
   - Real-time network statistics tracking current Latency (RTT), Jitter Buffer depth, Packet Loss totals, and Throughput Bitrates using browser `getStats()`.

6. **Bidirectional Clipboard Sync**:
   - Custom `"clipboard"` WebRTC data channel relaying clipboard changes between local browsers and remote hosts with graceful in-memory fallbacks.

7. **Agent Auto-Reconnect & Fault Resilience**:
   - Wrap connection sockets in a persistent loop; the agent will re-dial the signaling server, re-register, and resume active control loops seamlessly if connection drops.

---

## Architecture

The platform consists of three main components:
1. **`/agent`**: A Go client running on the target machine. Captures frames (physical screens or simulated canvas) and encodes them using dynamic FFmpeg pipelines. Pipes input injections and clipboard state over WebRTC channels.
2. **`/signaling`**: A secure WebRTC handshake router caching telemetry data and relaying ICE/SDP control signals between agents and operator consoles.
3. **`/dashboard`**:
   - **`backend`**: FastAPI application with a PostgreSQL database managing credentials, rate limits, session audits, user roles, and TOTP verification.
   - **`frontend`**: React + TypeScript client styled with a premium dark cyber glassmorphic Operations Center look.

---

## Quick Start (Docker Compose)

The entire stack is containerized and can be started with a single command. 

### Prerequisites
- Docker and Docker Compose (v2.x+) installed.

### Run the Stack
Run the following command in the repository root directory:
```bash
docker-compose up --build
```

This will automatically:
1. Spin up a cert-generator container to create SSL certificates for HTTPS/WSS in a shared volume.
2. Launch a PostgreSQL database.
3. Launch the Go signaling server on `https://localhost:8443`.
4. Launch the FastAPI backend on `https://localhost:8000`.
5. Launch the React dashboard on `https://localhost:5173`.
6. Launch a test agent (`test-drone-01`) which registers with the signaling server.

---

## Verifying the Flow

1. **Access the Dashboard**:
   Open your browser and navigate to: **`https://localhost:5173`**
   
   > [!NOTE]
   > Since the containers use self-signed certificates for local HTTPS/WSS, your browser will display a security warning. Click **Advanced -> Proceed to localhost (unsafe)**. 
   > For the WebRTC handshake to succeed, you should also visit `https://localhost:8443` in a new tab once and accept the warning to allow the browser to talk to the signaling server via WebSocket (`wss://`).

2. **Authenticate with Default Users**:
   The system database is seeded on start with three default users (passwords are all `Password123!`):
   - **Admin**: `admin@platform.local`
   - **Operator**: `operator@platform.local`
   - **Auditor**: `auditor@platform.local`

3. **MFA Enrollment**:
   - Log in with operator credentials.
   - Navigate to the **Security Settings** tab.
   - Click **Set Up Two-Factor Authentication**.
   - Scan the QR code or register the secret key in your authenticator app, type in the 6-digit code, and confirm.
   - On your next login, the console will prompt for verification.

4. **Verify Session Auditing & Exports**:
   - Establish a remote control session on `test-drone-01`.
   - Click **Disconnect Session** in the viewer header.
   - Navigate to the **Audit Logs** tab to search, filter, and export the logs to compliance CSV or JSON sheets.
