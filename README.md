# ClaudeCluster

ClaudeCluster is an open-source orchestration framework that transforms Claude Code into a scalable coding cluster. A single Driver coordinates multiple Worker instances in parallel, distributing coding tasks (scaffolding, refactoring, testing, docs, etc.) and aggregating results for faster delivery.

> Status: pre-release (design + prototyping). APIs and implementation details will evolve.

---

## Why ClaudeCluster?

- **Parallelism** → Run multiple Claude Code sessions at once for maximum throughput.
- **Scalability** → Spin up workers locally or across Kubernetes nodes.
- **Transparency** → Live logs, progress streaming, and artifacts per task.
- **Enterprise-ready** → Patent-safe Apache 2.0 license, structured governance.

---

## Architecture Overview

```mermaid
flowchart TD
  A[Driver (Claude Code)] -->|Splits tasks| B1[Worker 1 (Claude Code)]
  A -->|Splits tasks| B2[Worker 2 (Claude Code)]
  A -->|Splits tasks| B3[Worker 3 (Claude Code)]
  B1 -->|Progress + artifacts| A
  B2 -->|Progress + artifacts| A
  B3 -->|Progress + artifacts| A
  A -->|Aggregated results| C[Application repo / PRs]
```

### Single Claude Code Instance (baseline)

```mermaid
flowchart TD
  S[Claude Code (single instance)] -->|Executes tasks sequentially| R[Application repo / PRs]
```

### Core concepts

- **Driver**: Receives a high-level goal, plans a task graph, and orchestrates execution.
- **Worker**: Runs an isolated Claude Code session to execute a specific task.
- **Task**: A well-scoped unit of work (e.g., scaffold feature, refactor module, add tests, write docs).
- **Artifacts**: Outputs from tasks (diffs, files, logs, test results) captured and aggregated by the Driver.

---

## Features (planned)

- **Parallel orchestration** of multiple Claude Code sessions
- **Task graph + scheduling** with retries, deduplication, and map/merge patterns
- **Live progress streaming** and structured logs
- **Per-task artifacts**: files, diffs, test reports, benchmarks
- **Pluggable runners**: Local process, Docker, Kubernetes
- **Interfaces**: CLI and HTTP API for integration into CI/CD and tools
- **Observability**: Metrics and traces (OpenTelemetry), audit-friendly logs
- **Policy & safety**: token budgeting, network/FS guardrails, secrets management
- **Enterprise**: multi-tenant projects, role-based access, approvals

---

## Quickstart

This project is in active development. Packaged releases and a CLI are coming soon.

For now:

1. Watch and star the repo to follow updates
2. Track design progress and open questions in Issues/Discussions
3. Share use-cases and requirements to help shape the MVP

> Prerequisites (planned): Claude access, Docker (optional), Kubernetes cluster (optional)

---

## How it works (high level)

1. The Driver receives a goal (e.g., "Implement Dark Mode with tests and docs").
2. The Driver plans a task graph (scaffold UI, refactor theming, write tests, draft docs).
3. Tasks are scheduled to Workers and executed in parallel.
4. Workers stream progress and produce artifacts.
5. The Driver aggregates artifacts and prepares final outputs (diffs/PRs, reports).

---

## Roadmap

- [x] License (Apache-2.0)
- [ ] Public design spec and RFCs
- [ ] CLI: `claudecluster` (init, run, observe)
- [ ] Worker adapter for Claude Code sessions
- [ ] Local runner (process-based)
- [ ] Docker runner
- [ ] Kubernetes runner
- [ ] Artifact store (files, diffs, test reports)
- [ ] Web dashboard (live logs, task graph, artifacts)
- [ ] Git integrations (PRs, review summaries)
- [ ] Secrets management + policy guardrails
- [ ] Observability (metrics, traces)
- [ ] SDKs (TypeScript/Python)
- [ ] Test harness + sample projects

If you depend on a specific item, please open an Issue to upvote and discuss.

---

## Contributing

Contributions are welcome! This project is early—design docs, prototypes, and doc improvements are especially helpful.

1. Open an Issue to discuss ideas, bugs, or features
2. For larger changes, start with an RFC Issue to converge on design
3. Submit a PR with focused edits and clear rationale

Please read `docs/CONTRIBUTING.md` for our contribution process, DCO sign-off, and conventional commits. All contributions are licensed under Apache-2.0; see `LICENSE` and `NOTICE`.

---

## Community & Support

- Use GitHub Issues for bugs and feature requests
- Use Discussions (when enabled) for design and questions

---

## License

Licensed under the Apache License, Version 2.0. See the `LICENSE` file for details.

---

## Trademarks

"Claude" and "Claude Code" are trademarks of their respective owners. This project is community-led and not affiliated with or endorsed by Anthropic.

