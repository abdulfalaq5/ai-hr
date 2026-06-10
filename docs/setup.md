# Setup Guide - server-ai-monitoring

## Prerequisites

- Ubuntu 22.04 LTS atau lebih baru
- Akses root/sudo
- Git terinstall
- Port 9000 dan 9001 tersedia

---

## 1. Install Docker & Docker Compose

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group (no sudo needed)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 2. Create Docker Network

Project ini menggunakan network `infra_net` yang harus dibuat terlebih dahulu
(atau sudah ada dari service lain seperti nginx/postgres).

```bash
# Buat network jika belum ada
docker network create infra_net

# Verifikasi
docker network ls | grep infra_net
```

---

## 3. Clone Project

```bash
# Clone repo
git clone <your-repo-url> /opt/server-ai-monitoring
cd /opt/server-ai-monitoring
```

---

## 4. Konfigurasi Environment

```bash
# Copy template
cp .env.example .env

# Edit dengan editor favorit
nano .env
```

Isi semua variable wajib:

```env
# AI Endpoint (Sambanova atau OpenAI compatible)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.sambanova.ai/v1
OPENAI_MODEL=Meta-Llama-3.1-405B-Instruct

# PostgreSQL monitoring (buat user read-only dulu!)
POSTGRES_MONITOR_HOST=postgres    # nama container atau IP
POSTGRES_MONITOR_PORT=5432
POSTGRES_MONITOR_DB=yourdb
POSTGRES_MONITOR_USER=monitor_ro
POSTGRES_MONITOR_PASSWORD=strongpassword

# RabbitMQ monitoring
RABBITMQ_MONITOR_HOST=rabbitmq    # nama container atau IP
RABBITMQ_MONITOR_PORT=15672
RABBITMQ_MONITOR_USER=monitor_ro
RABBITMQ_MONITOR_PASSWORD=strongpassword

# Cloudflare (opsional)
CLOUDFLARE_API_TOKEN=your-readonly-token
CLOUDFLARE_ZONE_ID=your-zone-id
```

---

## 5. Siapkan PostgreSQL Read-Only User (Opsional)

Jika PostgreSQL sudah berjalan di network yang sama:

```bash
# Masuk ke container postgres
docker exec -it <postgres-container-name> psql -U postgres

# Buat monitoring user
CREATE USER monitor_ro WITH PASSWORD 'strongpassword';
GRANT CONNECT ON DATABASE yourdb TO monitor_ro;
\c yourdb
GRANT USAGE ON SCHEMA public TO monitor_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO monitor_ro;
\q
```

---

## 6. Siapkan RabbitMQ Monitoring User (Opsional)

```bash
# Masuk ke container rabbitmq
docker exec -it <rabbitmq-container-name> rabbitmqctl add_user monitor_ro strongpassword
docker exec -it <rabbitmq-container-name> rabbitmqctl set_user_tags monitor_ro monitoring
docker exec -it <rabbitmq-container-name> rabbitmqctl set_permissions -p / monitor_ro "" "" ".*"
```

---

## 7. Jalankan Services

```bash
cd /opt/server-ai-monitoring

# Build dan jalankan
docker compose up -d

# Lihat logs
docker compose logs -f

# Cek status
docker compose ps
```

---

## 8. Verifikasi

```bash
# Test health endpoint MCP server
curl http://localhost:9000/health
# Expected: {"status":"healthy","service":"mcp-monitoring","version":"1.0.0"}

# Test MCP endpoint
curl -X POST http://localhost:9003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## 9. Integrasi ke ai-spv

Karena service ini dikhususkan untuk MCP server monitoring, Anda perlu menghubungkannya ke instance **ai-spv** (atau AI controller utama Anda) yang berjalan di mesin yang sama atau mesin lain.

Tambahkan konfigurasi berikut ke agent ai-spv Anda:
```json
{
  "mcpServers": {
    "server-monitoring": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "url": "http://<IP_SERVER_MONITORING>:9003/mcp"
    }
  }
}
```

Pastikan port `9003` dapat diakses dari jaringan di mana `ai-spv` berjalan.

---

## 10. Update Project

```bash
cd /opt/server-ai-monitoring

# Pull perubahan terbaru
git pull

# Rebuild dan restart
docker compose up -d --build

# Hapus image lama
docker image prune -f
```

---

## Troubleshooting

### MCP server tidak bisa membaca /proc
```bash
# Cek apakah mount berhasil
docker exec mcp-monitoring ls /host_proc/

# Cek permission
docker exec mcp-monitoring cat /host_proc/stat
```

### Docker socket error
```bash
# Pastikan socket ada
ls -la /var/run/docker.sock

# Cek grup docker
docker exec mcp-monitoring ls -la /var/run/docker.sock
```

### PostgreSQL connection refused
```bash
# Test koneksi dari dalam container
docker exec mcp-monitoring wget -qO- http://localhost:9000/health

# Cek apakah postgres container di network yang sama
docker network inspect infra_net
```

### Container gagal start
```bash
# Lihat logs detail
docker compose logs mcp-monitoring
docker compose logs openclaw

# Cek apakah infra_net sudah ada
docker network ls | grep infra_net
# Jika belum: docker network create infra_net
```

### Build gagal
```bash
# Bersihkan cache dan rebuild
docker compose build --no-cache
docker compose up -d
```
