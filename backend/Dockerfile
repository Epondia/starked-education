# =============================================================================
# StarkEd Backend — Production Multi-Stage Dockerfile
# =============================================================================

# ─── Stage 1: Dependencies ────────────────────────────────────────────────
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
COPY requirements.txt ./

RUN npm ci

# ─── Stage 2: Builder ────────────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 py3-pip make g++

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install Python dependencies
RUN pip install -r requirements.txt 2>/dev/null || true

RUN npm run build

# ─── Stage 3: Runner ─────────────────────────────────────────────────────
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Install runtime dependencies
RUN apk add --no-cache python3 py3-pip wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy built artifacts (only what's needed at runtime)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Install Python runtime deps
COPY requirements.txt ./
RUN pip install -r requirements.txt 2>/dev/null || true

# Create logs directory
RUN mkdir -p logs && chown appuser:nodejs logs

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
