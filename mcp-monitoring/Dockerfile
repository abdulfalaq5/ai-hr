# =============================================================================
# MCP Monitoring Server - Dockerfile
# =============================================================================
# Multi-stage build: builder → production
# Node.js 22 Slim (Debian)
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json ./
RUN npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000 && npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-bookworm-slim AS production

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only production dependencies
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Use existing node user for security
USER node

EXPOSE 9003

# Health endpoint check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9003/health || exit 1

CMD ["node", "dist/server.js"]
