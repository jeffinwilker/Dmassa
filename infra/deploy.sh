#!/usr/bin/env bash
# =========================================================================
# Deploy script - rode do diretorio raiz do projeto no VPS
#
#   cd /opt/dmassa
#   bash infra/deploy.sh
#
# Faz: git pull, npm ci, prisma generate/migrate, next build, pm2 reload.
# =========================================================================
set -euo pipefail

echo ">>> [1/6] Verificando diretorio..."
if [ ! -f package.json ]; then
  echo "ERRO: rode este script do diretorio raiz do projeto." >&2
  exit 1
fi

# Marca inicio para possivel rollback manual
GIT_HEAD_BEFORE=$(git rev-parse HEAD)
echo "    HEAD atual: $GIT_HEAD_BEFORE"

echo ">>> [2/6] git pull..."
git fetch --all
git reset --hard origin/main

echo ">>> [3/6] npm ci..."
npm ci --no-audit --no-fund

echo ">>> [4/6] prisma generate + db push..."
# Usamos db push (schema-first) em vez de migrate deploy pra simplificar
# a Fase 1-2 (single-user, sem historico de migrations). db push adiciona
# novos campos e tabelas com seguranca; se detectar mudanca destrutiva
# (drop column/table) sem --accept-data-loss, o script falha e voce
# resolve manualmente.
npx prisma generate
npx prisma db push --skip-generate

echo ">>> [5/6] next build..."
npm run build

echo ">>> [6/6] pm2 reload dmassa-web..."
pm2 reload dmassa-web --update-env

# Se voce ja tiver o worker rodando, descomente:
# pm2 reload dmassa-worker --update-env

echo ""
echo "OK. Deploy concluido."
pm2 status
