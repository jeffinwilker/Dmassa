# Dmassa

Plataforma de disparo em massa via WhatsApp usando **Evolution API**.

Foco em **anti-ban**: delays aleatórios, descanso periódico, spintax como biblioteca reutilizável,
validação prévia de números, simulação de "digitando...", rotação ponderada entre chips,
opt-out automático e janela de horário permitido.

## Stack

- **Next.js 15** (App Router) — frontend e API
- **PostgreSQL 16** — dados
- **Redis 7 + BullMQ** — fila de disparos (a partir da Fase 3)
- **MinIO** — armazenamento de mídias
- **Evolution API v2** — provedor WhatsApp
- **Prisma** — ORM
- **iron-session + bcryptjs** — autenticação
- **Tailwind CSS** — UI

## Roadmap

- ✅ **Fase 1** — Fundação: docker-compose, schema, cliente Evolution, layout + Instâncias, **autenticação**, prep VPS
- ⏳ **Fase 2** — Contatos, Tags e Biblioteca Spintax
- ⏳ **Fase 3** — Campanhas, worker BullMQ, anti-ban completo
- ⏳ **Fase 4** — Agendamento, relatórios, aquecimento de chip

---

## Rodar localmente (Windows/Mac com Docker Desktop)

```powershell
copy .env.example .env
# edite .env: senhas, SESSION_PASSWORD, WEBHOOK_TOKEN

docker compose up -d       # Postgres, Redis, MinIO, Evolution
npm install
npm run db:push
npm run db:seed
npm run dev                # http://localhost:3000
```

Login inicial: use `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` do `.env`.

---

## Deploy em VPS (Ubuntu 22.04 / 24.04)

Arquitetura: **Caddy no host** (HTTPS auto) → **Next.js via PM2 no host** (:3000) → **Postgres/Redis/MinIO/Evolution em Docker** (bindados em 127.0.0.1).

### 0. Requisitos

- VPS com Ubuntu 22.04+ (mínimo 2 GB RAM, 2 vCPU, 40 GB disco)
- Acesso SSH como usuário sudoer (não root)
- IP público
- (Opcional) Domínio próprio. **Sem domínio, use `sslip.io`**: seu-ip-com-hifens.sslip.io funciona com Let's Encrypt.

### 1. Setup do VPS (uma vez só)

Conecte no VPS via SSH e rode:

```bash
# Como usuario NAO-root com sudo:
curl -fsSL https://raw.githubusercontent.com/SEU_USUARIO/dmassa/main/infra/setup-vps.sh -o setup.sh
bash setup.sh
```

Ou, se ainda não commitou no GitHub, faça upload manual do repositório e:

```bash
cd /opt/dmassa       # onde clonou o projeto
bash infra/setup-vps.sh
```

Este script instala **Docker, Node 20 (via nvm), PM2, Caddy**, configura **UFW** (só libera 22/80/443) e cria diretórios de log.

**Após o setup, faça logout e login novamente** para o grupo `docker` ativar.

### 2. Clonar e configurar

```bash
sudo mkdir -p /opt/dmassa
sudo chown $USER:$USER /opt/dmassa
cd /opt/dmassa
git clone <seu-repo> .
cp .env.example .env
```

**Edite `.env`** definindo:

| Variável | O que colocar |
|---|---|
| `POSTGRES_PASSWORD` | senha forte (32+ chars) |
| `REDIS_PASSWORD` | senha forte |
| `MINIO_ROOT_PASSWORD` | senha forte |
| `EVOLUTION_API_KEY` | `openssl rand -hex 32` |
| `SESSION_PASSWORD` | `openssl rand -base64 48` (mínimo 32 chars) |
| `WEBHOOK_TOKEN` | `openssl rand -hex 24` |
| `SEED_ADMIN_EMAIL` | seu email |
| `SEED_ADMIN_PASSWORD` | senha forte pra login |
| `WEBHOOK_URL` | `https://SEU-DOMINIO/api/webhooks/evolution?token=$WEBHOOK_TOKEN` |
| `NEXTAUTH_URL` | (removido, ignore) |

**Sem domínio?** Descubra seu IP com `curl ifconfig.me` e use como host, por exemplo IP `203.0.113.42` vira `203-0-113-42.sslip.io`. Configure:
```env
WEBHOOK_URL=https://203-0-113-42.sslip.io/api/webhooks/evolution?token=SEU_TOKEN
```

### 3. Subir infra + app

```bash
# 1. Infra em Docker (bindada em 127.0.0.1)
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml ps

# 2. Deps e banco
npm ci
npx prisma generate
npx prisma migrate deploy       # ou: npm run db:push (para setup inicial)
npm run db:seed                 # cria usuario admin

# 3. Build e inicia via PM2
npm run build
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                     # segue o comando que ele imprimir
```

Confirme que o app respondeu na porta 3000:
```bash
curl -I http://127.0.0.1:3000
```

### 4. Caddy (HTTPS)

```bash
# Configure APP_DOMAIN via variavel do systemd
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo tee /etc/systemd/system/caddy.service.d/env.conf > /dev/null <<EOF
[Service]
Environment="APP_DOMAIN=203-0-113-42.sslip.io"
EOF
sudo systemctl daemon-reload

# Instala Caddyfile do projeto
sudo cp infra/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Em ~30 segundos o Caddy pega o certificado do Let's Encrypt.
Teste: `https://SEU-DOMINIO` — você deve ver a tela de login.

### 5. Primeiro login e conectar chip

1. Acesse `https://SEU-DOMINIO`
2. Faça login com o email/senha do `SEED_ADMIN_*`
3. **Troque a senha** (a implementar na Fase 2 via UI; por ora edite direto: `pm2 stop dmassa-web && npm run db:seed`)
4. Vá em **Instâncias** > **Nova instância**
5. Escaneie o QR code

### 6. Backup automático

```bash
# Agendar backup diario as 3h da manha
(crontab -l 2>/dev/null; echo '0 3 * * * cd /opt/dmassa && bash infra/backup.sh >> /var/log/dmassa-backup.log 2>&1') | crontab -
```

Backups vão pra `/var/backups/dmassa` (rotação de 14 dias). Configure `RETENTION_DAYS` no ambiente pra mudar.

### 7. Deploys posteriores

Toda vez que quiser atualizar:

```bash
cd /opt/dmassa
bash infra/deploy.sh
```

Faz `git pull`, `npm ci`, `prisma migrate deploy`, `npm run build`, `pm2 reload` (zero downtime).

---

## Comandos úteis

```bash
# Logs
pm2 logs dmassa-web
docker compose -f docker-compose.prod.yml logs -f evolution
sudo journalctl -u caddy -f

# Status
pm2 status
docker compose -f docker-compose.prod.yml ps

# Restart total
pm2 reload all
docker compose -f docker-compose.prod.yml restart

# Prisma studio (sobre um tunnel SSH pra visualizar dados)
ssh -L 5555:localhost:5555 usuario@vps
# no VPS:
cd /opt/dmassa && npx prisma studio

# Console MinIO (via tunnel)
ssh -L 9001:localhost:9001 usuario@vps
# depois abra http://localhost:9001
```

---

## Segurança

- **Todas as portas de infra bindadas em 127.0.0.1** — Postgres, Redis, MinIO, Evolution não são acessíveis publicamente
- **UFW** só libera 22/80/443
- **Autenticação obrigatória** em todas as páginas e APIs (middleware)
- **Webhook do Evolution protegido por token** na URL
- **Cookie de sessão**: `httpOnly + secure + sameSite=lax`, assinado com `SESSION_PASSWORD`
- **Senhas em bcrypt** (custo 12)

**Nunca commitar `.env`.** Está no `.gitignore`.

---

## Estrutura

```
Dmassa/
├── docker-compose.yml            # dev local (portas expostas)
├── docker-compose.prod.yml       # VPS (portas em 127.0.0.1)
├── ecosystem.config.cjs          # PM2 (web + worker)
├── infra/
│   ├── Caddyfile                 # reverse proxy + HTTPS
│   ├── setup-vps.sh              # instala Docker, Node, PM2, Caddy
│   ├── deploy.sh                 # git pull + build + pm2 reload
│   ├── backup.sh                 # pg_dump + minio mirror
│   └── postgres-init.sh
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── src/
    ├── middleware.ts             # auth guard
    ├── app/
    │   ├── (app)/                # layout com sidebar (autenticado)
    │   │   ├── dashboard/
    │   │   ├── instances/        # Fase 1 ✅
    │   │   ├── contacts/         # Fase 2
    │   │   ├── spintax/          # Fase 2
    │   │   ├── campaigns/        # Fase 3
    │   │   ├── reports/          # Fase 4
    │   │   └── blacklist/        # Fase 3
    │   ├── login/                # pagina publica
    │   └── api/
    │       ├── auth/             # login, logout
    │       ├── instances/
    │       └── webhooks/evolution/
    ├── components/
    │   ├── ui/                   # button, input, dialog, etc.
    │   └── layout/
    ├── lib/
    │   ├── evolution/            # cliente HTTP tipado
    │   ├── session.ts            # iron-session
    │   ├── auth-owner.ts
    │   ├── prisma.ts
    │   └── utils.ts
    └── workers/                  # Fase 3 (BullMQ)
```
