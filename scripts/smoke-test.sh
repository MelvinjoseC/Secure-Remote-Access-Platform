#!/usr/bin/env bash
# ==============================================================================
# SECURE REMOTE ACCESS PLATFORM - SYNTHETIC SMOKE TEST SUITE
# ==============================================================================
set -euo pipefail

BASE_URL="${PLATFORM_URL:-https://localhost}"
API_URL="${BASE_URL}/api"
INSECURE_FLAG="-k" # Skip cert verification for local dev self-signed certs

echo "======================================================================"
echo " Starting Synthetic Platform Smoke Tests against: ${BASE_URL}"
echo "======================================================================"

test_passed=0
test_failed=0

assert_status() {
    local test_name="$1"
    local url="$2"
    local expected_code="$3"
    local method="${4:-GET}"
    local body="${5:-}"
    local headers="${6:-}"

    echo -n "==> Testing ${test_name} [${method} ${url}]... "
    
    local cmd="curl -s -o /dev/null -w '%{http_code}' ${INSECURE_FLAG} -X ${method}"
    if [ -n "${headers}" ]; then
        cmd="${cmd} ${headers}"
    fi
    if [ -n "${body}" ]; then
        cmd="${cmd} -H 'Content-Type: application/json' -d '${body}'"
    fi
    cmd="${cmd} '${url}'"

    local status_code
    status_code=$(eval "${cmd}" || echo "000")

    if [ "${status_code}" -eq "${expected_code}" ]; then
        echo "PASSED (HTTP ${status_code})"
        test_passed=$((test_passed + 1))
    else
        echo "FAILED (Expected HTTP ${expected_code}, got ${status_code})"
        test_failed=$((test_failed + 1))
    fi
}

# 1. Gateway & Frontend Probes
assert_status "Gateway Liveness" "${BASE_URL}/healthz" 200

# 2. Backend Liveness & Readiness Probes
assert_status "Backend Liveness" "${API_URL}/healthz" 200
assert_status "Backend Readiness" "${API_URL}/readyz" 200

# 3. Observability Metrics
assert_status "Prometheus Backend Metrics" "${BASE_URL}/metrics" 200

# 4. Authentication Flow (Valid Admin Login)
assert_status "Admin Authentication" "${API_URL}/auth/login" 200 "POST" '{"email":"admin@platform.local","password":"Password123!"}'

# 5. Authentication Failure (Invalid Password Rate Limiting Path)
assert_status "Unauthorized Login Rejection" "${API_URL}/auth/login" 400 "POST" '{"email":"admin@platform.local","password":"WrongPassword!"}'

echo "======================================================================"
echo " Smoke Test Summary: ${test_passed} Passed, ${test_failed} Failed"
echo "======================================================================"

if [ "${test_failed}" -gt 0 ]; then
    exit 1
fi
exit 0
