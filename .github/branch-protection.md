# Branch protection

Protect the production branch in **Settings > Rules > Rulesets** and require pull requests plus the following status checks:

- `Quality Gate`
- `Gitleaks`
- `Analyze JavaScript and TypeScript`

`Quality Gate` succeeds only after backend type checking/build, backend unit tests, PostgreSQL integration tests, frontend lint/build, frontend unit tests with coverage, Playwright critical workflows, and both dependency audits pass.

Also enable:

- Require branches to be up to date before merging.
- Block force pushes and branch deletion.
- Require conversation resolution.
- Require at least one approval for production changes.

Repository rules are managed in GitHub and cannot be enforced by a workflow file alone. Keep the required check names above synchronized with the workflow job names.
