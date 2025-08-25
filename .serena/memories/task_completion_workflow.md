# Task Completion Workflow

## Before Committing
1. **Run code quality checks**:
   ```bash
   pnpm lint:fix    # Fix linting issues
   pnpm format      # Format code
   pnpm types:check # TypeScript validation
   ```

2. **Run tests**:
   ```bash
   pnpm test                # Unit tests
   pnpm test:coverage      # With coverage
   pnpm build              # Ensure builds pass
   ```

3. **Package-specific validation**:
   ```bash
   pnpm --filter @claudecluster/PACKAGE_NAME test
   pnpm --filter @claudecluster/PACKAGE_NAME build
   ```

## Git Workflow
- Use **conventional commits** format
- Pre-commit hooks will automatically run lint and format
- Ensure all tests pass before pushing

## Integration Testing
For tasks affecting multiple packages:
```bash
pnpm test:e2e:smoke        # Quick integration test
pnpm docker:build          # Test Docker builds
pnpm docker:health         # Validate health checks
```

## Task Master Integration
- Update task status: `task-master set-status --id=X --status=done`
- Log implementation notes: `task-master update-subtask --id=X --prompt="notes"`
- Check for next tasks: `task-master next`

## Documentation Updates
- Update relevant README files if APIs changed
- Add/update JSDoc comments for public APIs
- Update type definitions and interfaces