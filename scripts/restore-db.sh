#!/usr/bin/env bash
# ==============================================================================
# SECURE REMOTE ACCESS PLATFORM - DATABASE RESTORE & DISASTER RECOVERY
# ==============================================================================
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path_to_backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="${DB_CONTAINER:-remote-access-db}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-remote_access}"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file '${BACKUP_FILE}' does not exist!" >&2
    exit 1
fi

# Verify checksum if present
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "==> Verifying SHA256 integrity checksum..."
    if command -v sha256sum > /dev/null; then
        sha256sum -c "${CHECKSUM_FILE}"
    elif command -v shasum > /dev/null; then
        shasum -a 256 -c "${CHECKSUM_FILE}"
    fi
    echo "==> Checksum verified successfully."
else
    echo "WARNING: No checksum file found at '${CHECKSUM_FILE}'. Proceeding without integrity check."
fi

# Confirm container is available
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Database container '${CONTAINER_NAME}' is not running!" >&2
    exit 1
fi

echo "==> CAUTION: Restoring will overwrite existing data in '${POSTGRES_DB}'."
read -p "Are you sure you want to proceed? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore aborted by user."
    exit 0
fi

echo "==> Decompressing and restoring database..."
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "==> Database restore finished successfully."
