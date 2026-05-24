# Business Rules

## Contract status semantics

- `DRAFT`: preparation state only. It does not count as current occupancy, current room, invoice eligibility, or utility-reading eligibility.
- `ACTIVE`: the only status that counts as current occupancy and the tenant current room. Utility submissions and invoice generation use active contracts only.
- `ENDED`: historical contract. It is retained for reporting but does not count as current occupancy.
- `CANCELLED`: voided contract. It is retained for audit/history but does not count as current occupancy.

## Tenant status updates

- Managers may set tenant status to `ACTIVE`, `MOVED_OUT`, or `BLACKLIST` through `PATCH /tenants/:id`.
- `DELETED` is reserved for `DELETE /tenants/:id` soft delete and cannot be set through PATCH.
- A tenant cannot be marked `MOVED_OUT` while still attached to an active contract.

## Room occupancy

- A room can have at most one `ACTIVE` contract at a time.
- `max_occupants` is enforced when creating an active contract with tenants.
- `max_occupants` cannot be lowered below the number of tenants currently attached to the room's active contract.
