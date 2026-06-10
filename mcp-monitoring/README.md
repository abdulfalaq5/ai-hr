# MCP Monitoring Server

Read-only MCP (Model Context Protocol) server untuk monitoring infrastruktur server.
Digunakan bersama OpenClaw untuk observasi kondisi server secara AI-powered.

## Features

- ✅ **READ-ONLY** — tidak ada tool yang dapat memodifikasi sistem
- 🐳 **Docker-native** — semua service berjalan di container
- 🔒 **Secure** — non-root container, no-new-privileges
- 📊 **11 monitoring tools** — CPU, Memory, Disk, Network, Docker, PostgreSQL, RabbitMQ, Nginx, Cloudflare, Logs

## Tools

| Tool | Deskripsi |
|------|-----------|
| `get_cpu_usage` | CPU usage dari /proc/stat + load average |
| `get_memory_usage` | Memory & swap dari /proc/meminfo |
| `get_disk_usage` | Mount points dari /proc/mounts |
| `get_network_status` | Network stats dari /proc/net/dev |
| `get_docker_containers` | List semua Docker containers |
| `get_docker_stats` | Resource usage semua running containers |
| `get_postgres_status` | PostgreSQL status & metrics |
| `get_rabbitmq_status` | RabbitMQ queues, messages, nodes |
| `get_nginx_status` | Nginx process & connection stats |
| `get_cloudflared_status` | Cloudflare tunnel status via API |
| `read_recent_logs` | Baca log file terakhir (allowlist protected) |

## Quick Start

```bash
# Clone
git clone <repo-url>
cd server-ai-monitoring

# Setup environment
cp .env.example .env
nano .env   # isi semua variable

# Pastikan network docker sudah ada
docker network create infra_net

# Run
docker compose up -d
```

## Endpoints

- `GET /health` — health check
- `POST /mcp` — MCP protocol endpoint (untuk OpenClaw)
- `GET /mcp` — MCP SSE endpoint

## Security

- Container berjalan sebagai non-root user (`mcpuser`)
- Host mounts semua `:ro` (read-only)
- Tidak ada tool yang dapat execute shell commands
- Log reader menggunakan strict allowlist untuk mencegah path traversal
