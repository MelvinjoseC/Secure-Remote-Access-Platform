#!/bin/bash
set -e

# Directory for certificates
CERT_DIR="./certs"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    echo "Certificates already exist. Skipping generation."
    exit 0
fi

echo "Generating SSL Certificates..."

# 1. Generate Root CA Key & Certificate
openssl genrsa -out "$CERT_DIR/ca.key" 2048
openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -subj "/CN=SecureRemoteAccessCA" -days 3650 -out "$CERT_DIR/ca.crt"

# 2. Generate Server Key
openssl genrsa -out "$CERT_DIR/server.key" 2048

# 3. Create SAN Config
cat > "$CERT_DIR/san.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = California
L = San Francisco
O = Dev
CN = localhost

[v3_req]
keyUsage = digitalSignature, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = signaling
DNS.3 = dashboard-backend
DNS.4 = dashboard-frontend
IP.1 = 127.0.0.1
EOF

# 4. Generate CSR (Certificate Signing Request)
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" -config "$CERT_DIR/san.cnf"

# 5. Sign Server Certificate with Root CA
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -out "$CERT_DIR/server.crt" -days 365 -sha256 \
    -extfile "$CERT_DIR/san.cnf" -extensions v3_req

# Cleanup temporary CSR and config
rm "$CERT_DIR/server.csr" "$CERT_DIR/san.cnf"

echo "Certificates successfully generated in $CERT_DIR"
