# Secure Remote Access Platform MVP

This repository contains a secure, outbound-only remote access platform prototype built for industrial/drone/marine operations.

## Architecture

The platform consists of three main components:
1. **`/agent`**: A Go client that runs on the remote machine. It captures the screen (physical monitor, or simulated desktop when running headless) and streams it over WebRTC DTLS data channels. It accepts keyboard/mouse inputs over the same channel and stubs local injection. It connects **outbound-only** to the signaling server.
2. **`/signaling`**: A Go WebRTC signaling server that handles agent registration and routes WebRTC offer/answer SDPs and ICE candidates between agents and clients.
3. **`/dashboard`**:
   - **`backend`**: FastAPI application with a PostgreSQL database. Manages user registration, authentication (JWT), online device queries, and connection audit logs.
   - **`frontend`**: React + TypeScript client (Vite) styled with a slate-dark premium Operations Center theme. Contains views for online devices, live WebRTC screen streaming, and compliance audit logs.

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

2. **Register & Log In**:
   - Click **Register here** on the login card.
   - Enter an email (e.g., `operator@company.com`) and password, then click **Register Operator**.
   - You will be automatically authenticated and redirected to the Console.

3. **Establish Remote Session**:
   - In the **Remote Machine Console**, you will see the active agent **`test-drone-01`** (this is the agent container running in headless mode).
   - Click **Establish Remote Session**.
   - The UI will record the session start in the Postgres database, establish an encrypted WebRTC data channel connection with the agent, and start rendering the desktop.
   - Since the agent container runs headlessly, it will stream a **simulated radar screen** with a bouncing cyan ball and animated telemetry to demonstrate low latency.

4. **Test Controls & Input**:
   - Click on the remote viewer canvas or use your keyboard.
   - Look at the terminal output of the `agent` container: you will see real-time logs indicating mouse moves, clicks, and key presses being received over the WebRTC data channel!
   - E.g.: `[INPUT INJECTION] Mouse Move: X=0.4520, Y=0.6120` or `[INPUT INJECTION] Key Down: Key=Enter`

5. **Verify Audit Logs**:
   - Click **Disconnect Session** in the viewer header (this calls the API to log the session end in Postgres).
   - Click the **Audit Logs** tab in the navigation header.
   - You will see a compliance table displaying your session ID, your operator email, the target device ID, start/end timestamps, and the exact session duration.

---

## Simulating a Host Agent (Optional)

If you have Go installed on your local machine and want to capture your physical machine screen:

1. Edit `/agent/config.yaml` to point to localhost:
   ```yaml
   signaling_url: "wss://localhost:8443"
   device_id: "operator-workstation"
   auth_token: "agent-secure-token-123"
   insecure_skip_verify: true
   ```
2. Run the agent locally:
   ```bash
   cd agent
   go run main.go input.go
   ```
3. Refresh the dashboard console; you will see `operator-workstation` appear online. Click connect to view your physical screen!

---

## Out-of-Scope Roadmap Markers

Markers have been left throughout the codebase for future feature additions:
- `# TODO(stage-3)`:
  - Agent: Swap `github.com/kbinani/screenshot` data channel stream for a hardware-accelerated VP8/H.264 video track using native codecs.
  - Agent: Bind input events to OS-specific API calls (`user32.dll` on Windows, `/dev/uinput` or `XTest` on Linux).
  - Signaling: Authenticate device registration and dashboard client pairing tokens against the dashboard database.
- `# TODO(stage-4)`:
  - Signaling: Add TURN relay config (`coturn`) to support connection routing between different NAT networks.
  - Dashboard: Implement role-based access control (RBAC), multi-factor authentication (MFA), and compliance log exports.
