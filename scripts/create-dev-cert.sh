#!/usr/bin/env bash
set -euo pipefail
ip="${1:?Gunakan: ./scripts/create-dev-cert.sh IP-LAN-KOMPUTER}"
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout certs/dev-key.pem -out certs/dev-cert.pem -subj "/CN=$ip" -addext "subjectAltName=IP:$ip,DNS:localhost,IP:127.0.0.1"
echo "Jalankan npm run dev:https, lalu percayai certs/dev-cert.pem pada HP testing."
