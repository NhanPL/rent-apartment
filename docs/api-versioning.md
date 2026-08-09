# API Versioning Strategy

## Current State

The React frontend is the only supported API client today and uses the unversioned `/api` base path. The OpenAPI document describes that deployed contract as version `1.0.0-internal`. This path is a temporary first-party compatibility surface, not a promise to external consumers.

## External Client Baseline

Before an external client is accepted, the backend must expose the same stable contract under `/api/v1` and publish an OpenAPI document whose primary server is `/api/v1`. External clients must never be onboarded against the unversioned `/api` path.

The version is carried in the URL because it is visible in logs, gateways, browser tooling and support reports:

```text
https://api.example.com/api/v1/invoices
```

Only the major contract version belongs in the URL. Application releases and additive API revisions continue within that major version and are tracked by the OpenAPI `info.version` value.

## Compatibility Rules

Changes allowed within `/api/v1`:

- Add an optional request property.
- Add a response property while clients are required to ignore unknown properties.
- Add an endpoint or optional query filter.
- Add a new enum only when consumers have documented unknown-value handling; otherwise treat it as breaking.
- Correct documentation without changing runtime behavior.

Changes requiring `/api/v2`:

- Remove or rename an endpoint, property, status or error code.
- Change a property type, nullability or meaning.
- Make an optional request field required.
- Change authentication, role or ownership requirements incompatibly.
- Change pagination shape or default ordering in a way that can alter client behavior.
- Reuse an existing error code for a different condition.

Security fixes may tighten behavior without a new major version when preserving the old behavior would expose data or credentials. Such changes require release notes and direct consumer notification.

## Deprecation Process

1. Publish the replacement contract and migration guide.
2. Mark deprecated OpenAPI operations with `deprecated: true`.
3. Return `Deprecation: true`, a standards-based `Sunset` timestamp and a `Link` header to the migration guide where practical.
4. Support the old major version for at least 90 days unless a security or legal requirement demands earlier removal.
5. Measure remaining traffic by API major version before shutdown.
6. Remove the old version only after named consumers have migrated or explicitly accepted the shutdown.

## Ownership And Release Gate

- Backend owners update OpenAPI in the same pull request as route behavior.
- CI validates the document and verifies every documented operation declares `x-required-role` and error responses.
- A breaking-change check against the last released OpenAPI document is required once `/api/v1` is external.
- Generated SDKs, if introduced, are generated from a tagged OpenAPI artifact rather than the live documentation endpoint.
- Production Swagger UI remains disabled by default. Enabling it requires `OPENAPI_DOCS_ENABLED=true`, `OPENAPI_DOCS_USERNAME`, and an `OPENAPI_DOCS_PASSWORD` of at least 16 characters.

## Migration Checklist

Before the first external integration:

1. Mount authenticated domain routers under `/api/v1`.
2. Resolve refresh-cookie path behavior for `/api/v1/auth/refresh`.
3. Point the first-party frontend at `/api/v1` and keep `/api` as a time-limited compatibility alias.
4. Change the OpenAPI primary server to `/api/v1`.
5. Add an OpenAPI breaking-change check to CI.
6. Announce and then remove the unversioned alias after the migration window.
