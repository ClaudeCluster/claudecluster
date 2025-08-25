# Multi-stage build for ClaudeCluster MCP Server
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    git

# Set working directory
WORKDIR /build

# Copy workspace configuration first
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy package files for dependency resolution
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/core/package.json ./packages/core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/driver/package.json ./packages/driver/

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core ./packages/core
COPY packages/shared ./packages/shared
COPY packages/driver ./packages/driver
COPY packages/mcp ./packages/mcp

# Build packages in dependency order
RUN pnpm --filter @claudecluster/core build
RUN pnpm --filter @claudecluster/shared build
RUN pnpm --filter @claudecluster/driver build
RUN pnpm --filter @claudecluster/mcp build

# Production image
FROM node:18-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    bash \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder /build/packages/mcp/dist ./dist
COPY --from=builder /build/packages/mcp/package.json ./
COPY --from=builder /build/packages/core/dist ../core/dist
COPY --from=builder /build/packages/shared/dist ../shared/dist
COPY --from=builder /build/packages/driver/dist ../driver/dist
COPY --from=builder /build/node_modules ./node_modules

# Create necessary directories
RUN mkdir -p /app/logs && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3100}/health || exit 1

# Expose port
EXPOSE 3100

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]