# Security Guide - server-ai-monitoring

## Prinsip Keamanan

Project ini dirancang dengan prinsip **defense in depth** dan **least privilege**.

---

## 1. READ-ONLY Enforcement

### Tools yang DILARANG (tidak pernah diimplementasikan)
Sesuai security policy, tools berikut TIDAK BOLEH dan TIDAK AKAN pernah ada:

| Tool Terlarang | Alasan |
|---|---|
| `restart_server` | Dapat menyebabkan downtime |
| `reboot_server` | Dapat menyebabkan downtime |
| `shutdown_server` | Dapat menyebabkan downtime |
| `execute_shell` | Arbitrary code execution |
| `delete_file` | Data loss |
| `docker_restart` | Service disruption |
| `docker_stop` | Service disruption |
| `docker_remove` | Data loss |
| `chmod` / `chown` | Permission escalation |
| `sudo` | Privilege escalation |
| `systemctl_restart` | Service disruption |

### Tools yang ADA (hanya read)
Semua 11 tools hanya melakukan observasi:
- Membaca `/proc`, `/sys` (read-only mount)
- Membaca `/var/log` (read-only mount)
- Query SELECT ke PostgreSQL (read-only credentials)
- GET request ke RabbitMQ Management API
- GET request ke Cloudflare API (read-only token)
- Query Docker API (hanya list & stats, tidak ada create/stop/remove)

---

## 2. Container Security

### Non-root User
```dockerfile
RUN addgroup -S mcpgroup && adduser -S mcpuser -G mcpgroup
USER mcpuser
```
Container berjalan sebagai user `mcpuser` yang tidak memiliki privilege apapun.

### No New Privileges
```yaml
security_opt:
  - no-new-privileges:true
```
Mencegah container mendapatkan privilege tambahan melalui setuid/setgid.

### Read-Only Host Mounts
```yaml
volumes:
  - /var/log:/host_logs:ro
  - /proc:/host_proc:ro
  - /sys:/host_sys:ro
  - /var/run/docker.sock:/var/run/docker.sock:ro
```
Semua host mount bersifat read-only (`:ro`).

### Tmpfs untuk /tmp
```yaml
tmpfs:
  - /tmp:size=50m,mode=1777
```
Hanya `/tmp` yang writable, dibatasi 50MB, tidak di-persist ke host.

---

## 3. Docker Socket

Docker socket (`/var/run/docker.sock`) di-mount read-only, namun Docker API sendiri
tidak memiliki konsep "read-only" per se. Keamanannya dijaga dari sisi aplikasi:

- Hanya memanggil `docker.listContainers()` dan `container.stats()`
- **Tidak pernah** memanggil: `container.stop()`, `container.remove()`, `container.start()`, `container.kill()`
- Tidak ada tool yang menerima container ID sebagai input untuk operasi destruktif

> ⚠️ **Catatan**: Pada production yang sangat sensitif, pertimbangkan menggunakan Docker socket proxy
> seperti [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)
> untuk membatasi Docker API calls di level proxy.

---

## 4. Log Reader Security

Tool `read_recent_logs` menggunakan **strict allowlist**:

```typescript
const ALLOWED_LOG_PATHS: Record<string, string> = {
  syslog: 'syslog',
  kern: 'kern.log',
  auth: 'auth.log',
  nginx_access: 'nginx/access.log',
  // ...
};
```

- Path traversal (`../../etc/passwd`) dicegah oleh allowlist
- Double-check dengan `startsWith(config.host.logs)` setelah path join
- Jumlah baris dibatasi max 500 line

---

## 5. Credentials

### PostgreSQL
- Gunakan user **read-only** yang hanya punya privilege `CONNECT` dan `SELECT`
- Buat user khusus monitoring:
```sql
CREATE USER monitor_ro WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE yourdb TO monitor_ro;
GRANT USAGE ON SCHEMA public TO monitor_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor_ro;
```

### RabbitMQ
- Gunakan user dengan tag `monitoring` (bukan `administrator`)
- User `monitoring` hanya bisa read via Management API

### Cloudflare
- Buat API token dengan permission minimal:
  - `Zone:Read`
  - `Cloudflare Tunnel:Read`
  - `Analytics:Read`
- Jangan gunakan Global API Key

---

## 6. Network Security

- Semua service terisolasi dalam Docker network `infra_net`
- MCP server tidak expose port ke internet langsung
- Hanya OpenClaw yang berkomunikasi dengan MCP server (internal network)
- Gunakan firewall (ufw) untuk membatasi akses port 9000 dari luar

```bash
# Contoh UFW rules
ufw deny 9000  # MCP server tidak perlu diakses dari internet
ufw allow 9001 # OpenClaw UI (atau batasi ke IP tertentu)
```

---

## 7. Secret Management

- **JANGAN** commit `.env` ke git
- `.env` sudah ada di `.gitignore`
- Pada production, pertimbangkan:
  - Docker Secrets
  - HashiCorp Vault
  - AWS Secrets Manager / GCP Secret Manager

---

## 8. Audit & Monitoring

Semua tool calls di-log dengan format:
```
[INFO] 2024-01-01T00:00:00.000Z [tool] get_cpu_usage called
```

Log ini dapat dimonitor untuk mendeteksi:
- Frekuensi request yang tidak wajar
- Tool calls dari sumber tidak dikenal
