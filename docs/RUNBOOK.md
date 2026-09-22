# Secure Remote Access Platform - Operational Runbook

This runbook provides on-call Standard Operating Procedures (SOPs) for site reliability engineers and DevOps administrators managing the platform in production.

---

## SOP 1: Service Health Verification & Probes

### Verification Commands
```bash
# Check gateway liveness
curl -k -i https://<GATEWAY_HOST>/healthz

# Check backend API liveness and readiness
curl -k -i https://<GATEWAY_HOST>/api/healthz
curl -k -i https://<GATEWAY_HOST>/api/readyz

# Inspect live Prometheus telemetry
curl -k -i https://<GATEWAY_HOST>/metrics
```

### Triaging 503 Readiness Errors
If `/api/readyz` reports `503 Service Unavailable`:
1. Check the response JSON `checks` field:
   - If `database: false`: Check PostgreSQL container/RDS status, DB connection limits, and network reachability.
   - If `signaling: false`: Check signaling server process status and TLS cert validity.

---

## SOP 2: Database Backup and Disaster Recovery

### Manual Backup Trigger
```bash
# Creates a compressed, timestamped, SHA-256 verified backup in ./backups/
make backup-db
```

### Disaster Recovery Restoration
```bash
# Restore specific snapshot to running database container
make restore-db BACKUP_FILE=./backups/db_backup_remote_access_20260922_150000.sql.gz
```

---

## SOP 3: SSL / TLS Certificate Rotation

### Local & Gateway Certificates
1. Regenerate certificates using the generator:
   ```bash
   ./generate-certs.sh
   ```
2. Reload Nginx without downtime:
   ```bash
   docker exec -it remote-access-gateway nginx -s reload
   ```

### Kubernetes (cert-manager)
1. Verify certificate status:
   ```bash
   kubectl get certificate -n secure-platform
   ```
2. Trigger manual renewal if needed:
   ```bash
   kubectl renew certificate platform-tls-cert -n secure-platform
   ```

---

## SOP 4: Secrets Rotation Procedure

### JWT Secret Key Rotation
1. Generate new 48-byte secret:
   ```bash
   openssl rand -base64 48
   ```
2. Update `.env` or Kubernetes secret:
   ```bash
   kubectl create secret generic platform-secrets --from-literal=JWT_SECRET="<NEW_KEY>" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```
3. Perform rolling restart:
   ```bash
   kubectl rollout restart deployment/dashboard-backend -n secure-platform
   kubectl rollout restart deployment/signaling -n secure-platform
   ```
*(Note: Active operator JWT sessions will be required to re-authenticate upon key rotation).*

---

## SOP 5: High Signaling Disconnect Rate Alert

**Trigger Condition**: `HighAgentDisconnectRate` or `ZeroRegisteredAgents`.

1. **Check Signaling Pod Logs**:
   ```bash
   kubectl logs -n secure-platform -l app.kubernetes.io/component=signaling --tail=200
   ```
2. **Inspect Coturn STUN/TURN Health**:
   Verify UDP port 3478 is reachable:
   ```bash
   nc -zvu <TURN_IP> 3478
   ```
3. **Verify Agent Host Network Connectivity**:
   Confirm client device has internet egress to signaling hostname on TCP port 443.
