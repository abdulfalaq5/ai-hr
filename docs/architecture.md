# Architecture - server-ai-monitoring

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Ubuntu Server Host                      │
│                                                             │
│  ┌──────────────────┐        ┌────────────────────────────┐ │
│  │    OpenClaw       │        │    MCP Monitoring Server   │ │
│  │  (AI Agent UI)   │◄──────►│    (Node.js + TypeScript)  │ │
│  │  port 9001       │  MCP   │    port 9000               │ │
│  │                  │ HTTP   │                            │ │
│  └──────────────────┘        └────────────┬───────────────┘ │
│                                           │                  │
│  ┌────────────────────────────────────────▼───────────────┐  │
│  │                  infra_net (Docker Network)             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Host Read-Only Mounts:                                       │
│  /proc ──────────────────► /host_proc (ro)                   │
│  /sys  ──────────────────► /host_sys  (ro)                   │
│  /var/log ───────────────► /host_logs (ro)                   │
│  /var/run/docker.sock ───► /var/run/docker.sock (ro)         │
│                                                               │
│  External APIs (HTTPS):                                       │
│  Cloudflare API ◄──────────────────────────────────────────  │
│                                                               │
│  Internal Services (via ENV):                                 │
│  PostgreSQL ◄───────────────────────────────────────────────  │
│  RabbitMQ Management API ◄─────────────────────────────────  │
└─────────────────────────────────────────────────────────────┘
```

## Components

### OpenClaw (AI Agent)
- Web UI untuk berinteraksi dengan AI agent
- Terhubung ke Sambanova/OpenAI-compatible endpoint
- Menggunakan MCP untuk mengakses monitoring tools
- Port: 9001

### MCP Monitoring Server
- Node.js 22 + TypeScript
- Implements Model Context Protocol
- Transport: Streamable HTTP
- 11 read-only monitoring tools
- Port: 9000

## Data Flow

```
User → OpenClaw UI → AI Model (Sambanova) → MCP Tool Call
                                               ↓
                              MCP Monitoring Server
                               (reads host data)
                                    ↓
                        /proc, /sys, /var/log,
                        docker.sock, PostgreSQL,
                        RabbitMQ, Cloudflare API
```

## Network

Semua service menggunakan `infra_net` Docker network yang bersifat `external: true`.
Ini memungkinkan MCP server berbagi network dengan service lain (nginx, postgres, rabbitmq, dll)
yang sudah berjalan di network yang sama.

## Security Boundary

```
┌─────────────────────────────────┐
│         READ-ONLY ZONE          │
│                                 │
│  MCP Monitoring Server          │
│  ● No write to host             │
│  ● No shell execution           │
│  ● No file modification         │
│  ● Non-root container user      │
│  ● no-new-privileges flag       │
└─────────────────────────────────┘
```
