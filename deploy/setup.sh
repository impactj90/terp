#!/usr/bin/env bash
set -euo pipefail

# One-time setup for a fresh Hetzner VPS (Ubuntu 24.04)

echo "=== Updating packages ==="
apt-get update && apt-get upgrade -y

echo "=== Installing Docker ==="
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Setting up firewall ==="
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== Creating app directory ==="
mkdir -p /opt/terp

echo "=== Generating .env.prod ==="
if [ ! -f /opt/terp/.env.prod ]; then
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 48)

    cat > /opt/terp/.env.prod <<EOF
# Database
DB_PASSWORD=${DB_PASSWORD}

# API
JWT_SECRET=${JWT_SECRET}
API_BASE_URL=http://$(curl -4s https://ifconfig.me)
FRONTEND_URL=http://localhost:3000

# Domain (set when ready, enables auto-SSL via Caddy)
API_DOMAIN=:80
EOF
    echo "Generated /opt/terp/.env.prod with random secrets"
else
    echo "/opt/terp/.env.prod already exists, skipping"
fi

echo ""
echo "========================================="
echo "  Server setup complete!"
echo "  App directory: /opt/terp"
echo "  Next: make prod-deploy SERVER=<this-ip>"
echo "========================================="
