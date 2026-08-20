# syntax=docker/dockerfile:1
# =============================================================================
# StarkEd Education Platform — Production Multi-Stage Dockerfile
# =============================================================================
# This Dockerfile builds the frontend (Next.js) and backend (Node.js/Express)
# in separate stages, then serves them behind an Nginx reverse proxy.
# =============================================================================

# ─── Stage 0: Base Node image ──────────────────────────────────────────────
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ─── Stage 1: Frontend dependencies ────────────────────────────────────────
FROM base AS frontend-deps
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

# ─── Stage 2: Frontend builder ─────────────────────────────────────────────
FROM node:18-alpine AS frontend-builder
WORKDIR /app
COPY --from=frontend-deps /app/node_modules ./node_modules
COPY frontend/ .

# Next.js telemetry opt-out
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# ─── Stage 3: Backend dependencies ─────────────────────────────────────────
FROM base AS backend-deps
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

# ─── Stage 4: Backend builder ──────────────────────────────────────────────
FROM node:18-alpine AS backend-builder
WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/ .

# Install Python dependencies if requirements.txt exists
COPY backend/requirements.txt ./
RUN apk add --no-cache python3 py3-pip && \
    pip install -r requirements.txt 2>/dev/null || true

RUN npm run build

# ─── Stage 5: Backend runner ───────────────────────────────────────────────
FROM node:18-alpine AS backend-runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy built backend
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package.json ./
COPY backend/requirements.txt ./

# Install Python only if needed at runtime
RUN apk add --no-cache python3 py3-pip && \
    pip install -r requirements.txt 2>/dev/null || true

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]

# ─── Stage 6: Frontend runner ──────────────────────────────────────────────
FROM node:18-alpine AS frontend-runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built frontend
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static ./.next/static
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/package.json ./

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]

# ─── Stage 7: Production Nginx reverse-proxy (default target) ─────────────★
FROM nginx:alpine AS production

# Install wget for health checks
RUN apk add --no-cache wget

# Create nginx config using RUN with shell heredoc for broader compatibility
RUN rm /etc/nginx/conf.d/default.conf
RUN cat > /etc/nginx/conf.d/starked.conf <<'NGINX_CONF'
upstream frontend {
    server frontend:3000;
}

upstream backend {
    server backend:3001;
}

server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
NGINX_CONF

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
