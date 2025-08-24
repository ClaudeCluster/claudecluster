# GitHub Actions Workflows

This directory contains the CI/CD workflows for ClaudeCluster.

## Workflows

### CI (`ci.yml`)
Main continuous integration pipeline that runs on push and pull requests to `main` and `develop` branches.

**Jobs:**
- **lint-and-typecheck**: Runs ESLint and TypeScript type checking
- **build**: Builds all packages using TurboRepo
- **test**: Runs test suite with coverage reporting to Codecov
- **security**: Runs pnpm security audit (pushes only)
- **matrix-test**: Tests on Node.js 18, 20, 21 (pull requests only)

### Release (`release.yml`)
Automated release pipeline for the `main` branch using semantic-release.

**Features:**
- Generates changelog from conventional commits
- Creates GitHub releases
- Publishes packages to npm (when configured)
- Runs full CI pipeline before release

### Dependencies (`deps.yml`)
Automated dependency management that runs weekly.

**Features:**
- Checks for outdated dependencies
- Updates dependencies automatically
- Runs tests to ensure compatibility
- Creates pull request with updates

## Requirements

### Environment Variables
- `CODECOV_TOKEN`: For uploading test coverage (optional)
- `NPM_TOKEN`: For publishing packages to npm (release workflow)

### Node.js Version
All workflows use Node.js 18 as specified in `package.json` engines field.

### Package Manager
Uses pnpm 8.15.0 with caching for faster builds.

## Branch Strategy
- `main`: Production releases, runs release workflow
- `develop`: Development branch, runs full CI
- Feature branches: Run CI on pull requests to main/develop