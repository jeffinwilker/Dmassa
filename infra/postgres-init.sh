#!/bin/bash
set -e

# Cria bancos adicionais separados por vírgula em POSTGRES_MULTIPLE_DATABASES.
# O banco padrão POSTGRES_DB já é criado pela imagem; aqui garantimos os extras.

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  echo "Criando bancos adicionais: $POSTGRES_MULTIPLE_DATABASES"
  for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
    echo "  -> $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
      SELECT 'CREATE DATABASE $db'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
      GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
  done
fi
