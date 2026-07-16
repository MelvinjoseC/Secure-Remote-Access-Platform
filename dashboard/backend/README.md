# Dashboard Backend (FastAPI)

A Python FastAPI application that handles user authentication (JWT), proxies device registration lookups to the signaling server, and maintains an audit log in PostgreSQL for WebRTC connections.

## Features
- **User Authentication**: Register/Login endpoints using standard bcrypt-hashed passwords and JWT.
- **Device Proxy**: Lists active agents by making an internal API request to the signaling server.
- **Audit Logs**: Records session start and end times to a PostgreSQL database.
- **TLS Enabled**: Served over HTTPS using certificates.

## Environment Variables
- `DATABASE_URL` (default: `postgresql://postgres:postgres@db:5432/remote_access`): Postgres connection string.
- `JWT_SECRET` (default: `super-secret-dev-jwt-key`): Secret key for signing JWTs.
- `SIGNALING_API_URL` (default: `https://signaling:8443`): URL of the signaling server.
- `SIGNALING_API_KEY` (default: `dev-signaling-secret-key`): Pre-shared API key to authenticate requests with the signaling server.

## API Endpoints

- **Auth**:
  - `POST /api/auth/register` - Create user.
  - `POST /api/auth/login` - Verify user credentials and receive JWT.
- **Devices**:
  - `GET /api/devices` - Returns list of active device IDs (requires JWT).
- **Sessions**:
  - `POST /api/sessions/start` - Logs a session start (requires JWT).
  - `POST /api/sessions/end` - Logs a session end (requires JWT).
- **Audit Logs**:
  - `GET /api/audit-logs` - Fetches log history (requires JWT).

## Standalone Development Setup

1. **Install python requirements**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run server (without TLS)**:
   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/remote_access
   export SIGNALING_API_URL=http://localhost:8443
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. **Run server (with TLS)**:
   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/remote_access
   export SIGNALING_API_URL=https://localhost:8443
   uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-certfile=../../certs/server.crt --ssl-keyfile=../../certs/server.key
   ```
