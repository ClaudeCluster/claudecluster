# Code Style and Conventions

## TypeScript Standards
- **Strict mode enabled** with composite projects
- **100% type coverage** required
- All packages use shared `tsconfig.base.json`
- Build outputs in `dist/` directories

## Code Quality Tools
- **ESLint**: TypeScript support with strict rules
- **Prettier**: Consistent code formatting
- **Husky**: Git hooks with pre-commit validation
- **lint-staged**: Auto-format on commit

## Package Structure
```
packages/
├── packageName/
│   ├── src/           # Source code
│   ├── dist/          # Build output
│   ├── package.json   # Package config
│   └── tsconfig.json  # TypeScript config
```

## Workspace Dependencies
Use workspace protocol for internal dependencies:
```json
{
  "dependencies": {
    "@claudecluster/core": "workspace:*"
  }
}
```

## Naming Conventions
- **Files**: kebab-case (e.g., `execution-provider.ts`)
- **Classes**: PascalCase (e.g., `ExecutionProvider`)
- **Functions/Variables**: camelCase (e.g., `getExecutor`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_WORKERS`)
- **Interfaces**: PascalCase with descriptive names

## Testing Strategy
- **Jest** for unit testing with ts-jest
- **E2E testing** with multiple suites (smoke, integration, resilience, performance)
- **>90% coverage** requirement
- **Test files**: `*.test.ts` or `*.spec.ts`