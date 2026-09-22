#!/usr/bin/env bash
# ==============================================================================
# SECURE REMOTE ACCESS PLATFORM - AUTOMATED DATABASE BACKUP
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CONTAINER_NAME="${DB_CONTAINER:-remote-access-db}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-remote_access}"
BACKUP_FILENAME="${BACKUP_DIR}/db_backup_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
CHECKSUM_FILENAME="${BACKUP_FILENAME}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "==> [$(date)] Starting backup for database '${POSTGRES_DB}'..."

# Verify database container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Database container '${CONTAINER_NAME}' is not running!" >&2
    exit 1
fi

# Execute pg_dump, pipe through gzip, write to file
docker exec -t "${CONTAINER_NAME}" pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip -9 > "${BACKUP_FILENAME}"

# Generate SHA256 checksum
if command -v sha256sum > /dev/null; then
    sha256sum "${BACKUP_FILENAME}" > "${CHECKSUM_FILENAME}"
elif command -v shasum > /dev/null; then
    shasum -a 256 "${BACKUP_FILENAME}" > "${CHECKSUM_FILENAME}"
fi

BACKUP_SIZE=$(ls -lh "${BACKUP_FILENAME}" | awk '{print $5}')
echo "==> Backup complete! File: ${BACKUP_FILENAME} (Size: ${BACKUP_SIZE})"
echo "==> Checksum recorded in: ${CHECKSUM_FILENAME}"

# Retention cleanup: remove backups older than 7 days
echo "==> Enforcing 7-day retention policy..."
find "${BACKUP_DIR}" -name "db_backup_*.sql.gz" -type f -mtime +7 -delete || true
find "${BACKUP_DIR}" -name "db_backup_*.sha256" -type f -mtime +7 -delete || true
echo "==> Backup process finished successfully."
