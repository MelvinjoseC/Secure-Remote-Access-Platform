# Secure Remote Access Platform - Enterprise DevOps Architecture

This document provides a comprehensive overview of the system architecture, network topology, security model, and component interactions for the **Secure Remote Access Platform**.

---

## 1. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients ["Public & Operator Network"]
        Operator["Operator Browser (React SPA)"]
        Drone["Edge Agent (Drone / ROV / Host)"]
    end

    subgraph Perimeter ["Edge & Ingress Tier"]
        WAF["WAF / CDN (Cloudflare / AWS CloudFront)"]
        ALB["Application Load Balancer / Nginx Gateway"]
    end

    subgraph VPC ["Internal Private Network (VPC / Kubernetes Namespace)"]
        Frontend["dashboard-frontend (Nginx 8080)"]
        Backend["dashboard-backend (FastAPI 8000)"]
        Signaling["signaling (Go WebRTC Hub 8443)"]
        Postgres[(PostgreSQL 16 Multi-AZ)]
        Coturn["Coturn STUN/TURN (UDP 3478 / 49152-49200)"]
    end

    subgraph Observability ["Observability Tier"]
        Prometheus["Prometheus Server (9090)"]
        Grafana["Grafana Dashboards (3000)"]
        Alertmanager["Alertmanager"]
    end

    Operator -->|HTTPS 443| WAF
    WAF --> ALB
    ALB -->|/ (Static SPA)| Frontend
    ALB -->|/api/*| Backend
    ALB -->|/client/connect, /agent/register (WSS)| Signaling
    Drone -->|Outbound TLS WebSocket| ALB
    Drone <-->|P2P WebRTC Direct / TURN Relay| Operator
    Drone -.->|NAT Traversal| Coturn
    Operator -.->|NAT Traversal| Coturn
    Backend -->|SQL| Postgres
    Backend -->|Internal REST| Signaling
    Prometheus -->|Scrape /metrics| Backend
    Prometheus -->|Scrape /metrics| Signaling
    Grafana -->|Query| Prometheus
    Prometheus -->|Alerts| Alertmanager
```

---

## 2. Component Tier Specifications

### 2.1 Edge & Ingress Tier
* **Nginx Reverse Proxy Gateway (`gateway/`)**:
  - Handles TLS termination (TLS 1.2 / 1.3 only, modern cipher suites).
  - Enforces HTTP to HTTPS redirection.
  - Implements HTTP connection upgrade mapping for WebSockets (`$http_upgrade`, `$connection_upgrade`).
  - Strict security headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`.
  - Rate limiting zones protecting authentication endpoints (`/api/auth/` capped at 5 req/s) and general API endpoints (30 req/s).

### 2.2 Application Services Tier
* **Operations Frontend (`dashboard/frontend`)**:
  - React 19 + TypeScript SPA built with Vite.
  - Multi-stage container build served via unprivileged Nginx on port 8080.
  - Fully decoupled from backend APIs via reverse proxy path routing.
* **API Backend (`dashboard/backend`)**:
  - FastAPI running Python 3.12 under non-root unprivileged execution.
  - Manages Role-Based Access Control (RBAC: `admin`, `operator`, `auditor`), TOTP MFA (`pyotp`), session audit logs, and device statuses.
  - Exposes Kubernetes-compliant `/healthz` (liveness) and `/readyz` (readiness) endpoints.
  - Prometheus `/metrics` exporter instrumenting request throughput, latencies, and active user metrics.
* **Signaling Server (`signaling`)**:
  - Lightweight, high-throughput Go HTTP/WebSocket hub.
  - Manages outbound agent registration and operator SDP/ICE negotiation.
  - Authenticates operators via JWT role verification and agents via secure tokens.
  - Native Prometheus `/metrics` handler exposing connected agent counts, viewer sessions, relayed packets, and uptime.

### 2.3 NAT Traversal & Media Relay Tier
* **Coturn STUN / TURN Server**:
  - Traverses symmetric NATs and enterprise firewalls when direct WebRTC peer-to-peer connection is blocked.
  - Relays SRTP video, audio, and WebRTC data channels (used for remote desktop input injection and clipboard synchronization).
  - Configured with dedicated relay UDP port range (49152–49200).

### 2.4 Data Tier
* **PostgreSQL 16**:
  - Stores credentials, password hashes (bcrypt), MFA secret seeds, user roles, and compliance audit trail records.
  - Running in private network without public internet accessibility.
  - Supported via AWS RDS Multi-AZ or Kubernetes StatefulSets with persistent SSD storage.

---

## 3. Security & Zero-Trust Model

1. **Outbound-Only Agents**: Target device agents dial outbound to the signaling hub. Zero inbound firewall ports need to be opened on client/drone hosts.
2. **Non-Root Containers**: Every Dockerfile is configured with unprivileged system users (UID `10001:10001` or `101:101`).
3. **Network Policies**: Kubernetes NetworkPolicies enforce default-deny ingress and isolate PostgreSQL so only the backend API can communicate with it.
4. **Secret Management**: No credentials committed to git; automated Gitleaks CI scanning; production parameters injected through Kubernetes Secrets or AWS Parameter Store/Secrets Manager.
