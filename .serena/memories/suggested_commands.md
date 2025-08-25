# Essential Development Commands

## Daily Development
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (watch builds)
pnpm dev

# Run tests
pnpm test
pnpm test:coverage

# Code quality
pnpm lint
pnpm lint:fix
pnpm format
pnpm types:check
```

## Package-Specific Development
```bash
# Work on core package
pnpm --filter @claudecluster/core build
pnpm --filter @claudecluster/core test
pnpm --filter @claudecluster/core dev

# Work on worker package
pnpm --filter @claudecluster/worker build
pnpm --filter @claudecluster/worker dev
pnpm --filter @claudecluster/worker start

# Work on driver package
pnpm --filter @claudecluster/driver dev
```

## Testing
```bash
# E2E tests (multiple suites)
pnpm test:e2e:smoke
pnpm test:e2e:integration
pnpm test:e2e:resilience
pnpm test:e2e:performance
pnpm test:e2e:all

# Local vs Cloud testing
pnpm test:e2e:local
pnpm test:e2e:cloud
```

## Docker Development
```bash
# Start full ClaudeCluster stack
pnpm docker:up

# Build Docker images
pnpm docker:build

# View logs and status
pnpm docker:logs
pnpm docker:status

# Stop and clean up
pnpm docker:down
pnpm docker:clean
```

## Cloud Deployment
```bash
# Deploy worker instances
pnpm cloud:deploy-worker-dev
pnpm cloud:deploy-worker-staging
pnpm cloud:deploy-worker-prod

# Deploy MCP server
pnpm cloud:deploy-mcp-dev
```