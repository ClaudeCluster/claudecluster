# Multi-stage Dockerfile for ClaudeCluster MCP Server
# Uses Debian bookworm-slim for lightweight, stable base

FROM node:18.19-bookworm-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    # Clean up to reduce image size
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r claudeuser && useradd -r -g claudeuser claudeuser

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml* ./

# Copy shared package for workspace dependencies
COPY packages/shared/package.json ./packages/shared/
COPY packages/mcp/package.json ./packages/mcp/

# Install dependencies with production optimizations
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --prod

# Copy shared package source
COPY packages/shared/ ./packages/shared/

# Copy MCP server source code
COPY --chown=claudeuser:claudeuser packages/mcp/ ./packages/mcp/

# Build the shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build the MCP server
WORKDIR /app/packages/mcp
RUN pnpm build

# Create final runtime stage
FROM node:18.19-bookworm-slim AS runtime

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user
RUN groupadd -r claudeuser && useradd -r -g claudeuser -d /app claudeuser

# Set working directory
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Copy built applications from base stage
COPY --from=base --chown=claudeuser:claudeuser /app/node_modules ./node_modules
COPY --from=base --chown=claudeuser:claudeuser /app/packages/shared/dist ./packages/shared/dist
COPY --from=base --chown=claudeuser:claudeuser /app/packages/shared/package.json ./packages/shared/
COPY --from=base --chown=claudeuser:claudeuser /app/packages/mcp/dist ./packages/mcp/dist
COPY --from=base --chown=claudeuser:claudeuser /app/packages/mcp/package.json ./packages/mcp/
COPY --from=base --chown=claudeuser:claudeuser /app/package.json ./
COPY --from=base --chown=claudeuser:claudeuser /app/pnpm-workspace.yaml* ./

# Create directories for volumes
RUN mkdir -p /app/config && chown claudeuser:claudeuser /app/config
RUN mkdir -p /app/logs && chown claudeuser:claudeuser /app/logs

# Switch to non-root user
USER claudeuser

# Set working directory to MCP package
WORKDIR /app/packages/mcp

# Expose MCP server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info

# Start the MCP server
CMD ["pnpm", "start"]