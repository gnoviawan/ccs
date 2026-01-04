# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install bun for faster builds
RUN npm install -g bun

# Copy package files
COPY package.json bun.lock* ./
COPY ui/package.json ui/bun.lock* ./ui/
COPY scripts/ ./scripts/

# Install dependencies
RUN bun install --frozen-lockfile
RUN cd ui && bun install --frozen-lockfile

# Copy source code
COPY src/ ./src/
COPY ui/src/ ./ui/src/
COPY ui/public/ ./ui/public/
COPY ui/index.html ./ui/
COPY ui/vite.config.ts ./ui/
COPY ui/tsconfig*.json ./ui/
COPY ui/components.json ./ui/
COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY lib/ ./lib/

# Build UI
RUN cd ui && bun run build

# Build CLI/Server
RUN bun run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN npm install -g bun

# Copy package files and scripts for production install
COPY package.json bun.lock* ./
COPY scripts/ ./scripts/

# Install production dependencies only (ignore prepare scripts like husky)
RUN bun install --production --frozen-lockfile --ignore-scripts

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/config ./config

# Create data directory for persistent config
RUN mkdir -p /data/.ccs

# Environment variables
ENV NODE_ENV=production
ENV CCS_CONFIG_DIR=/data/.ccs
ENV CCS_DATA_DIR=/data/.ccs

# Expose dashboard port
EXPOSE 3000

# Expose CLIProxy API port (if running embedded proxy)
EXPOSE 8317

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the dashboard server
CMD ["node", "dist/ccs.js", "config", "--no-open"]
