#!/usr/bin/env bash
# =========================================================================
# Setup inicial de um VPS Ubuntu 22.04 / 24.04 pra rodar o Dmassa.
# Instala: Docker, Node 20 (via nvm), PM2, Caddy, git, ufw.
#
# ATENCAO: rode como usuario NAO-root que tenha sudo (ex: ubuntu).
# =========================================================================
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "ERRO: Nao rode como root. Crie um usuario e adicione ao sudo." >&2
  exit 1
fi

echo ">>> [1/8] Atualizando pacotes..."
sudo apt update
sudo apt upgrade -y

echo ">>> [2/8] Instalando basicos..."
sudo apt install -y curl git ufw ca-certificates gnupg lsb-release build-essential

echo ">>> [3/8] Instalando Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "    Docker instalado. Voce precisara relogar pra rodar 'docker' sem sudo."
fi

echo ">>> [4/8] Instalando Node 20 via nvm..."
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  nvm install 20
  nvm alias default 20
fi

echo ">>> [5/8] Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  npm install -g pm2
fi

echo ">>> [6/8] Instalando Caddy..."
if ! command -v caddy &> /dev/null; then
  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt update
  sudo apt install -y caddy
fi

echo ">>> [7/8] Configurando firewall (UFW)..."
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP (Caddy)'
sudo ufw allow 443/tcp comment 'HTTPS (Caddy)'
sudo ufw --force enable

echo ">>> [8/8] Criando diretorios..."
sudo mkdir -p /var/log/caddy
sudo chown -R caddy:caddy /var/log/caddy 2>/dev/null || true

echo ""
echo "=========================================================================="
echo "Setup concluido. Proximos passos:"
echo ""
echo "  1) Faca LOGOUT e login novamente (para efetivar o grupo docker)"
echo "  2) Clone o projeto:  git clone <seu-repo> /opt/dmassa && cd /opt/dmassa"
echo "  3) cp .env.example .env  e edite:"
echo "     - Senhas fortes (Postgres, Redis, MinIO, Evolution, SESSION)"
echo "     - APP_DOMAIN (ex: 123-45-67-89.sslip.io se sem dominio)"
echo "     - WEBHOOK_URL = https://\$APP_DOMAIN/api/webhooks/evolution?token=..."
echo "  4) docker compose -f docker-compose.prod.yml --env-file .env up -d"
echo "  5) npm ci && npx prisma migrate deploy && npm run db:seed && npm run build"
echo "  6) pm2 start ecosystem.config.cjs && pm2 save && pm2 startup"
echo "  7) sudo cp infra/Caddyfile /etc/caddy/Caddyfile"
echo "     sudo nano /etc/caddy/Caddyfile   # ajuste APP_DOMAIN"
echo "     sudo systemctl reload caddy"
echo "  8) Agende backup diario:"
echo "     (crontab -l 2>/dev/null; echo '0 3 * * * cd /opt/dmassa && bash infra/backup.sh >> /var/log/dmassa-backup.log 2>&1') | crontab -"
echo ""
echo "=========================================================================="
