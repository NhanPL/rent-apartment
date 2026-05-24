# Todo List

## P0 - Blocker

- [x] Fix frontend build errors.
  - [x] `front-end/src/services/apiClient.ts`: replace class constructor parameter properties because `erasableSyntaxOnly` is enabled.
  - [x] `front-end/src/pages/buildings/components/DetailPanel.tsx`: remove unused `useMemo`.
  - [x] `front-end/src/pages/payments/PaymentsPage.tsx`: remove or use `electricUsage` and `waterUsage`.
  - [x] `front-end/src/services/dashboardService.ts`: narrow unpaid invoice statuses to `ISSUED` and `OVERDUE`.
  - [x] `front-end/src/services/paymentsService.ts`: handle nullable `reading` safely.
  - [x] `front-end/src/services/rentalContractDocx.ts`: convert `Uint8Array` to a Blob-compatible `ArrayBuffer`.

- [x] Fix frontend lint errors.
  - [x] Split non-component exports out of `front-end/src/features/auth/AuthContext.tsx`.
  - [x] Split non-component exports out of `front-end/src/pages/payments/components/invoiceFormShared.tsx`.
  - [x] Refactor synchronous `setState` calls inside effects in `UpsertDrawer.tsx`.
  - [x] Refactor synchronous `setState` calls inside effects in `RoomsUpsertDrawer.tsx`.
  - [x] Fix hook dependency warnings in `DetailPanel.tsx` and `RoomDetailPage.tsx`.
  - [x] Remove unused `_contractId` parameters in `tenantRoomService.ts`.
  - [x] Replace empty `TenantListResponse` interface with a type alias.

## P1 - Security And Data Isolation

- [x] Scope manager data by `building.manager_user_id`.
  - [x] Buildings list/detail/update.
  - [x] Rooms list/detail/update/occupancy.
  - [x] Contracts list/detail/create.
  - [x] Invoices list/detail/adjustments.
  - [x] Payment requests list/detail/review.

- [x] Restrict tenant-visible data.
  - [x] Ensure tenants can only see their own invoices.
  - [x] Ensure tenants can only see their own payment requests.
  - [x] Ensure tenants can only see or submit utility readings for their current room.
  - [x] Ensure utility evidence upload checks ownership or manager role.

- [x] Add Zod validation for backend request bodies.
  - [x] Buildings.
  - [x] Rooms.
  - [x] Contracts.
  - [x] Tenants.
  - [x] Utility readings.
  - [x] Invoices.
  - [x] Payments.
  - [x] Upload metadata.

## P2 - Business Rules

- [ ] Decide and document contract status semantics.
  - [ ] Clarify whether `DRAFT` counts as current occupancy.
  - [ ] Make tenant current-room queries consistent with invoice/export/utility logic.
  - [ ] Update `vw_tenant_current_room` and related backend queries accordingly.

- [ ] Fix room filter query naming.
  - [ ] Align frontend `building_id` with backend `buildingId`, or support both.

- [ ] Harden tenant status updates.
  - [ ] Prevent `PATCH /tenants/:id` from bypassing delete guards by setting `status='DELETED'`.
  - [ ] Decide allowed tenant status transitions.
  - [ ] Keep `DELETE /tenants/:id` as the only soft-delete path.

- [ ] Review room occupancy rules.
  - [ ] Enforce max occupants if needed.
  - [ ] Prevent overlapping active contracts consistently at DB and service levels.

## P3 - Product Completion

- [ ] Replace frontend mock/in-memory services with real API calls.
  - [ ] `paymentsService.ts`.
  - [ ] `dashboardService.ts`.
  - [ ] `tenantRoomService.ts`.
  - [ ] Building/room mock data in routes/pages.

- [ ] Implement Cloudinary upload flow.
  - [ ] Add signed upload endpoint.
  - [ ] Store uploaded metadata in DB.
  - [ ] Connect tenant documents and contract documents.

- [ ] Build fixed charges module.
  - [ ] CRUD `charge_catalog`.
  - [ ] CRUD `building_charge`.
  - [ ] CRUD `room_charge_override`.
  - [ ] CRUD `contract_charge_override`.
  - [ ] Support `room_month_extra` for per-person and per-vehicle charges.

- [ ] Complete monthly invoice generation.
  - [ ] Include rent.
  - [ ] Include electricity and water.
  - [ ] Include fixed charges.
  - [ ] Include monthly extras.
  - [ ] Create invoice items with clear codes and metadata.

- [ ] Complete payment flow.
  - [ ] Decide current MVP path: manual proof, VNPAY, MoMo, or staged rollout.
  - [ ] If using gateway, implement transaction create, callback, signature verify, and status sync.
  - [ ] Support partial payments if required.

- [ ] Improve dashboard.
  - [ ] Replace mock data with API-backed stats.
  - [ ] Show occupancy, revenue, unpaid invoices, and recent activity.

## P4 - Tests And Quality

- [ ] Add backend tests.
  - [ ] Auth login/refresh/me.
  - [ ] RBAC and tenant data isolation.
  - [ ] Tenant create/update/delete.
  - [ ] Contract create/update/occupancy.
  - [ ] Utility reading submit/approve/reject.
  - [ ] Invoice generation.
  - [ ] Payment proof submit/review.

- [ ] Add frontend tests or smoke checks.
  - [ ] Auth flow.
  - [ ] Main route rendering.
  - [ ] Tenant form payload mapping.
  - [ ] Payment/invoice form calculations.

- [ ] Add CI checks.
  - [ ] Backend `npm run check`.
  - [ ] Backend `npm run build`.
  - [ ] Frontend `npm run build`.
  - [ ] Frontend `npm run lint`.

## P5 - Developer Experience And Documentation

- [ ] Fix environment documentation.
  - [ ] Align backend `PORT=4000` with frontend `VITE_API_BASE_URL`.
  - [ ] Add missing SMTP variables to `.env.example`.
  - [ ] Document required and optional env vars.

- [ ] Fix `plan.md` encoding.
  - [ ] Re-save as UTF-8.
  - [ ] Verify Vietnamese text renders correctly.

- [ ] Expand `README.md`.
  - [ ] Project overview.
  - [ ] Prerequisites.
  - [ ] Database setup.
  - [ ] Env setup.
  - [ ] Backend dev/build/start commands.
  - [ ] Frontend dev/build commands.
  - [ ] Demo account or seed data instructions.

- [ ] Add migration strategy.
  - [ ] Split `database.sql` into versioned migrations or adopt a migration tool.
  - [ ] Add repeatable seed/demo data separately from schema.

## Current Verification Snapshot

- Backend:
  - [x] `npm run check` passes.
  - [x] `npm run build` passes.

- Frontend:
  - [x] `npm run build` passes.
  - [x] `npm run lint` passes.
