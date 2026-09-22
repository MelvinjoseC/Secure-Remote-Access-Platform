# Secure Remote Access Platform - Production Deployment Guide

This guide covers deployment instructions for Docker Compose, Kubernetes (Kustomize/Helm), and AWS Cloud (Terraform).

---

## 1. Quick Start: Local Development

For quick testing or local staging:

```bash
# Clone the repository
git clone https://github.com/MelvinjoseC/Secure-Remote-Access-Platform.git
cd Secure-Remote-Access-Platform

# Generate dev certificates and spin up full development stack
docker compose up -d --build

# Verify all containers are running healthy
docker compose ps
```

* Dashboard UI: `https://localhost:5173`
* Backend API: `https://localhost:8000`
* Signaling Hub: `https://localhost:8443`

---

## 2. Production Docker Deployment (Nginx Gateway)

To run the production-grade stack where all traffic passes through the single hardened TLS Nginx Gateway (ports 80/443):

```bash
# 1. Prepare environment variables
cp .env.example .env
chmod 600 .env
# Edit .env with your real production secrets

# 2. Launch production stack
docker compose -f docker-compose.prod.yml up -d --build

# 3. Optional: Launch Prometheus and Grafana monitoring
docker compose -f docker-compose.monitoring.yml up -d

# 4. Run post-deployment smoke test
make smoke-test
```

* Gateway Ingress: `https://localhost` (or your domain)
* Prometheus UI: `http://localhost:9090`
* Grafana UI: `http://localhost:3000` (Default credentials: `admin` / `admin`)

---

## 3. Kubernetes Deployment

### Option A: Using Kustomize

```bash
# Deploy to Production Overlay
kubectl apply -k k8s/overlays/prod

# Verify Pod Status
kubectl get pods -n secure-platform -w

# Check Ingress & Certificate Status
kubectl get ingress -n secure-platform
```

### Option B: Using Helm

```bash
# Inspect Helm values
helm show values ./helm/secure-remote-access

# Install or Upgrade Release
helm upgrade --install secure-platform ./helm/secure-remote-access \
  --namespace secure-platform \
  --create-namespace \
  --set global.environment=production \
  --set secrets.databaseUrl="postgresql://..." \
  --set secrets.jwtSecret="<YOUR_SECRET>"
```

---

## 4. AWS Cloud Deployment (Terraform)

```bash
cd terraform/environments/prod

# 1. Initialize Terraform
terraform init

# 2. Copy and configure variables
cp terraform.tfvars.example terraform.tfvars
# Update db_password, jwt_secret, turn_password, and certificate_arn

# 3. Review infrastructure execution plan
terraform plan -out=tfplan

# 4. Apply plan to provision VPC, RDS, ALB, Coturn, and ECS clusters
terraform apply tfplan
```

Outputs will display your public ALB DNS hostname and Coturn Elastic IP.
