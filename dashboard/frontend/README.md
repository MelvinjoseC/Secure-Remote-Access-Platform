# Dashboard Frontend (React + Vite + TypeScript)

A modern, high-performance React application serving as the operator console for the Secure Remote Access Platform.

## Features
- **Device Monitor Console**: Displays real-time statuses of remote machines.
- **Encrypted Remote Viewport**: Peer-to-peer WebRTC connection showing the screen in low-latency canvas graphics.
- **Remote Keyboard & Mouse injection**: Dynamically captures user clicks, coordinates, and keystrokes.
- **Audit Compliance viewer**: Queries and formats session history logs.
- **Aesthetic Dark Operations Theme**: Cyberpunk slate-dark premium styling.
- **Local TLS (HTTPS)**: Runs over HTTPS.

## Installation & Standalone Run

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

2. **Run dev server**:
   ```bash
   npm run dev
   ```

Vite will look for certificates in `../../certs/server.crt` to serve the app over `https://localhost:5173`. If certificates are not found, it will automatically fall back to standard `http://localhost:5173`.

## Architecture Details

- **WebRTC Data Channels**: Creates two channels upon connection:
  - `media` (un-ordered, unreliable): receives binary JPEG screen capture packets and draws them to the HTML5 Canvas.
  - `input` (ordered, reliable): sends mouse actions (move, click) and key presses as JSON strings.
- **Responsive Telemetry**: Tracks and calculates frame rates (FPS), received data size (MB), and resolution changes in real-time.
