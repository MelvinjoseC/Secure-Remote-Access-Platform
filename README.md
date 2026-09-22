# Secure Remote Access Platform Operations Console

[![CI Pipeline](https://github.com/MelvinjoseC/Secure-Remote-Access-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/MelvinjoseC/Secure-Remote-Access-Platform/actions/workflows/ci.yml)
[![DevSecOps Scan](https://github.com/MelvinjoseC/Secure-Remote-Access-Platform/actions/workflows/security.yml/badge.svg)](https://github.com/MelvinjoseC/Secure-Remote-Access-Platform/actions/workflows/security.yml)
[![Publish Containers](https://github.com/MelvinjoseC/Secure-Remote-Access-Platform/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/MelvinjoseC/Secure-Remote-Access-Platform/actions/workflows/docker-publish.yml)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Kustomize%20%26%20Helm-blue?logo=kubernetes)](./k8s)
[![Terraform](https://img.shields.io/badge/IaC-Terraform%20AWS-purple?logo=terraform)](./terraform)
[![Prometheus](https://img.shields.io/badge/Monitoring-Prometheus%20%26%20Grafana-orange?logo=prometheus)](./monitoring)

An enterprise-grade, outbound-only secure remote access platform engineered for mission-critical industrial, drone, and marine operations centers.

---

## 🏛️ Enterprise DevOps & Infrastructure Architecture

The platform is designed following modern cloud-native, zero-trust infrastructure principles:

```
                  ┌───────────────────────────────┐
                  │    Operator Browser / App     │
                  └──────────────┬────────────────┘
                                 │ HTTPS / WSS (Port 443)
                                 ▼
                  ┌───────────────────────────────┐
                  │  Production Nginx Gateway     │
                  │  TLS 1.3, Rate-Limit, WSS Upgr│
                  └──────────────┬────────────────┘
         ┌───────────────────────┼───────────────────────┐
         │ /                     │ /api/*                │ /client/*, /agent/*
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│Frontend (Nginx)  │    │Backend (FastAPI) │    │Signaling (Go Hub)│
│Unprivileged SPA  │    │RBAC, MFA, Audit  │    │WebRTC Handshake  │
└──────────────────┘    └────────┬─────────┘    └────────┬─────────┘
                                 │                       │
                                 ▼                       ▼
                        ┌──────────────────┐    ┌──────────────────┐
                        │  PostgreSQL 16   │    │Coturn STUN/TURN  │
                        │  KMS Encrypted   │    │UDP 3478 / Relays │
                        └──────────────────┘    └──────────────────┘
                                                         ▲
                                                         │ Outbound-only
                                                ┌────────┴─────────┐
                                                │  Remote Agent    │
                                                │  (Go Client)     │
                                                └──────────────────┘
```

Detailed technical specs, data flows, and network boundary policies are documented in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## 🚀 Key Features

1. **Hardened Container Security**:
   - Multi-stage unprivileged Docker builds with non-root execution (`USER 10001:10001`).
   - Automated DevSecOps scanning with Trivy (CVEs), Gitleaks (secrets), and Bandit (Python SAST).
2. **High-Availability Kubernetes & Helm**:
   - Production Kustomize bases and overlays (`dev` and `prod`).
   - Configurable Helm chart (`helm/secure-remote-access`) with PodDisruptionBudgets, NetworkPolicies, and HorizontalPodAutoscalers.
3. **Modular Infrastructure as Code (Terraform)**:
   - AWS VPC, Multi-AZ RDS PostgreSQL with KMS encryption, Application Load Balancers, and Coturn STUN/TURN compute modules.
4. **End-to-End Observability**:
   - Native Prometheus `/metrics` instrumentation across FastAPI and Go signaling hubs.
   - Production Grafana dashboard with alerting rules for packet loss, disconnect rates, and latency SLOs.
5. **Operational Automation**:
   - Unified `Makefile`, automated SHA-256 verified PostgreSQL backup/restore scripts, and synthetic smoke test suites.

---

## 📚 Documentation & Runbooks

* [**Enterprise Architecture Guide**](./docs/ARCHITECTURE.md) - System design, zero-trust network boundaries, and WebRTC streaming architecture.
* [**Production Deployment Guide**](./docs/DEPLOYMENT_GUIDE.md) - Step-by-step instructions for Docker Compose, Kubernetes, and AWS Terraform.
* [**Site Reliability Runbook**](./docs/RUNBOOK.md) - Standard Operating Procedures (SOPs) for incident triage, secret rotation, and disaster recovery.
* [**Makefile Reference**](./Makefile) - CLI commands for build, lint, test, backup, and health validation.

---

## ⚡ Quick Start

### 1. Local Development (Docker Compose)
```bash
docker compose up -d --build
```
* Dashboard: `https://localhost:5173` | Signaling: `https://localhost:8443` | API: `https://localhost:8000`

### 2. Production Stack (Hardened Nginx Gateway)
```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.monitoring.yml up -d
make smoke-test
```
* Production Ingress: `https://localhost` (or domain)
* Grafana Telemetry: `http://localhost:3000` (User: `admin` / `admin`)

---

## 🔐 Default Credentials (Dev Environment)

| Account Role | Email | Default Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@platform.local` | `Password123!` | User management, audit logs, remote sessions |
| **Operator** | `operator@platform.local` | `Password123!` | Remote device control and telemetry monitoring |
| **Auditor** | `auditor@platform.local` | `Password123!` | Compliance audit log viewer and exports |

*(Note: Change all default passwords and secrets before deploying to public networks).*
