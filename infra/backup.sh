#!/usr/bin/env bash
# =========================================================================
# Backup do Postgres (Dmassa + Evolution) e das midias do MinIO.
# Retencao: mantem os N mais recentes (default 14 dias).
#
# Uso manual:   bash infra/backup.sh
# Cron diario:  0 3 * * *  /opt/dmassa/infra/backup.sh >> /var/log/dmassa-backup.log 2>&1
# =========================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dmassa}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# Carrega .env se existir (pra pegar POSTGRES_USER)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-dmassa}"
TS=$(date +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/minio"

echo "[$(date -Is)] Iniciando backup..."

# ---- Postgres (ambas as databases) --------------------------------------
for db in dmassa evolution; do
  OUT="$BACKUP_DIR/postgres/${db}_${TS}.sql.gz"
  echo "  pg_dump $db -> $OUT"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --clean --if-exists \
    | gzip -9 > "$OUT"
done

# ---- MinIO (midias) -----------------------------------------------------
# Usa mc para copiar o bucket inteiro
MINIO_BUCKET="${MINIO_BUCKET:-dmassa-media}"
MC_ALIAS="local"
MC="docker run --rm --network host \
  -e MC_HOST_${MC_ALIAS}=http://${MINIO_ROOT_USER:-dmassa}:${MINIO_ROOT_PASSWORD:-dmassa-minio-secret}@127.0.0.1:${MINIO_PORT:-9000} \
  -v $BACKUP_DIR/minio:/backup minio/mc:latest"
MINIO_OUT="$BACKUP_DIR/minio/media_${TS}.tar.gz"
echo "  minio $MINIO_BUCKET -> $MINIO_OUT"
$MC mirror --quiet --overwrite "${MC_ALIAS}/${MINIO_BUCKET}" "/backup/current" || true
tar -C "$BACKUP_DIR/minio" -czf "$MINIO_OUT" current 2>/dev/null || true

# ---- Retencao -----------------------------------------------------------
echo "  Removendo backups > ${RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -type f -name "media_*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -Is)] Backup finalizado. Arquivos em $BACKUP_DIR"
du -sh "$BACKUP_DIR"/* 2>/dev/null || true
