# Contributing to ClaudeCluster

Thanks for your interest in contributing! This project is in active development—design input, docs, and small focused improvements are especially valuable.

## Code of Conduct

By participating, you agree to uphold a respectful, inclusive environment. Be kind, constructive, and considerate.

## Developer Certificate of Origin (DCO)

We use the Developer Certificate of Origin (DCO) to confirm that contributions are made with the right to submit them. Each commit must be signed off.

- To sign off a commit:
  - Add `Signed-off-by: Your Name <you@example.com>` to the commit message, or
  - Use the `-s` flag with git: `git commit -s -m "feat: add X"`

Your sign-off certifies the DCO at https://developercertificate.org/

## How to contribute

1. Open an Issue to discuss ideas, bugs, or features
2. For larger changes, start with an RFC Issue to converge on design
3. Create a branch from `main` and make focused changes with clear rationale
4. Ensure docs are updated when behavior or interfaces change
5. Use conventional commits (see below)
6. Submit a PR with context and checklists

## Conventional commits

Follow the conventional commit format:

- `feat(scope): add new capability`
- `fix(scope): correct a bug`
- `docs(scope): update documentation`
- `chore(scope): maintenance or tooling`
- `refactor(scope): code change without behavior change`
- `test(scope): add or update tests`

Examples:

- `feat(cli): add init command`
- `docs(readme): clarify quickstart steps`

## Development setup (early-stage)

- Primary language(s): TBD (SDKs planned for TypeScript/Python)
- Runners: Local/Docker/Kubernetes (planned)
- Observability: OpenTelemetry (planned)

Until the initial CLI and SDKs land, contributions are mostly docs, design docs, and prototypes.

## License and copyright

By contributing, you agree that your contributions are licensed under the Apache License, Version 2.0.

See `LICENSE` and `NOTICE` for details.
