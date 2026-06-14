# TODO - Rent Apartment Management System

File này tổng hợp các việc còn thiếu/chưa hoàn chỉnh sau khi rà lại frontend, backend, database schema và roadmap hiện tại.

## Trạng thái kiểm tra gần nhất

- [x] Backend `npm run check` pass.
- [x] Backend `npm run build` pass.
- [x] Frontend `npm run lint` pass.
- [x] Frontend `npm run build` pass.
- [ ] Frontend build đang cảnh báo bundle lớn khoảng `1.25 MB`; cần code-splitting khi thêm nhiều màn mới.

## P0 - Blocker / Cần chốt trước

### P0.1 - Chốt ownership và data isolation cho tenant

- [x] [DB] Thêm ownership cho tenant, ví dụ `tenant.manager_user_id`, hoặc bảng liên kết tenant-manager.
- [x] [DB] Viết migration/backfill ownership cho tenant hiện có.
- [x] [BE] Sửa `GET /api/tenants` để tenant chưa có active contract không bị manager khác nhìn thấy.
- [x] [BE] Sửa `GET/PATCH/DELETE /api/tenants/:id` dùng ownership rõ ràng, không chỉ dựa vào active contract.
- [x] [BE] Sửa các route phụ `/tenants/:id/contracts`, `/invoices`, `/payments`, `/export-contract` theo ownership.
- [ ] [QA] Test case manager A không xem/sửa/xóa được tenant của manager B.

### P0.2 - Sửa cấu hình môi trường và tài liệu chạy local

- [x] [DOC] Sửa `.env.example`: backend dùng `PORT=4000` thì frontend nên là `VITE_API_BASE_URL=http://localhost:4000/api`.
- [x] [DOC] Thêm biến `FRONTEND_URL`.
- [x] [DOC] Thêm đầy đủ biến SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`.
- [x] [BE] Quyết định SMTP là bắt buộc hay optional ở môi trường dev.
- [x] [DOC] Viết lại `README.md`: prerequisites, database setup, env setup, backend/frontend commands, demo account/seed.

### P0.3 - Dọn route placeholder và tên module

- [x] [FE] `/contracts` đang là placeholder; hoặc ẩn route, hoặc làm màn thật.
- [x] [FE] `/reports` đang là placeholder; hoặc ẩn route, hoặc làm màn thật.
- [x] [FE] `/rooms` có trong config nhưng sidebar không có màn list riêng; chốt có cần route list rooms không.
- [x] [FE] Màn `PaymentsPage` hiện quản lý invoice nhiều hơn payment; cân nhắc đổi tên thành `InvoicesPage` hoặc tách `Invoices` và `Payments`.

## P1 - MVP core flow

### P1.1 - Contract module hoàn chỉnh

- [x] [BE] Thêm `PATCH /api/contracts/:id` để cập nhật hợp đồng.
- [x] [BE] Thêm `POST /api/contracts/:id/activate`.
- [x] [BE] Thêm `POST /api/contracts/:id/end` để trả phòng, set `ENDED`, `move_out_date`, `left_at`.
- [x] [BE] Thêm `POST /api/contracts/:id/cancel` cho hợp đồng bị hủy.
- [x] [BE] Thêm API add/remove co-tenants trong `contract_tenant`.
- [x] [BE] Enforce chỉ có 1 primary tenant trong hợp đồng.
- [x] [BE] Enforce `max_occupants` khi thêm co-tenant.
- [x] [FE] Làm màn `/contracts`: list, filter theo building/room/status/tenant.
- [x] [FE] Làm contract detail drawer/page: tenant list, room, dates, rent, deposit, status history cơ bản.
- [x] [FE] Làm form create/update/end/cancel contract.
- [x] [FE] Từ Tenant detail cho phép đi tới Contract detail thay vì chỉ hiển thị `contract_id`.

### P1.2 - Utility rate và utility reading workflow

- [x] [BE] Thêm CRUD `utility_rate` theo building và `effective_from`.
- [x] [BE] Thêm endpoint manager list readings có filter building/room/month/status.
- [x] [BE] Thêm endpoint lấy reading detail kèm evidence.
- [x] [BE] Validate không thể approve reading nếu không thuộc manager.
- [x] [FE] Làm màn manager duyệt chỉ số điện/nước.
- [x] [FE] Cho manager approve/reject reading, nhập lý do reject.
- [x] [FE] Tenant portal hiển thị trạng thái reading: submitted/approved/rejected/invoiced.
- [x] [FE] Tenant upload ảnh evidence cho điện/nước sau khi có upload flow.

### P1.3 - Invoice module đúng nghĩa

- [x] [BE] Thêm service generate invoice theo tháng cho 1 room.
- [x] [BE] Thêm service generate invoice theo tháng cho toàn building.
- [x] [BE] Thêm service generate invoice theo tháng cho tất cả active contracts của manager.
- [x] [BE] Invoice generation phải gồm rent + electricity + water.
- [x] [BE] Invoice generation phải dùng `utility_rate` hiệu lực mới nhất theo tháng.
- [x] [BE] Chặn generate trùng invoice theo `contract_id + month`.
- [x] [BE] Tách rõ manual invoice và generated invoice trong metadata/item source.
- [x] [BE] Thêm action issue/void/mark overdue nếu cần.
- [x] [FE] Tách màn `Invoices`: list invoice, detail invoice items, create manual invoice, generate monthly invoice.
- [x] [FE] Trong room detail, invoice table cần mở được invoice detail.
- [x] [FE] Trong tenant portal, bill detail phải hiển thị đúng rent/electric/water/other thay vì đang map về `0`.

### P1.4 - Manual bank transfer payment flow

- [x] [BE] Hoàn thiện `payment_request`: create, cancel, expire.
- [x] [BE] Cho manager tạo payment request từ invoice.
- [x] [BE] Cho tenant xem payment request hiện tại của invoice.
- [x] [BE] Cho tenant submit payment proof kèm file metadata.
- [x] [BE] Cho manager approve/reject proof, nhập lý do reject.
- [x] [BE] Khi approve proof, cập nhật payment và invoice theo tổng số tiền đã thanh toán.
- [x] [BE] Chốt rule partial payment: cho phép hay không.
- [x] [FE] Manager có nút "Create payment request" trên invoice detail.
- [x] [FE] Tenant có màn/khối thanh toán invoice: QR/bank info, transfer note, upload proof.
- [x] [FE] Manager có màn review payment proofs.
- [x] [FE] Hiển thị payment history theo invoice.

### P1.5 - Tenant portal sửa dữ liệu hiển thị

- [x] [BE] Sửa `/api/me/current-bill` trả invoice items hoặc projection đủ rent/electric/water/other/paid_at.
- [x] [BE] Sửa `/api/me/payment-status` trả payment status và paid date chính xác.
- [x] [BE] Sửa `/api/me/roommates` trả `joined_at` và `is_primary`.
- [x] [FE] Bỏ các fallback fake `joined_at: today`, `is_primary: false`, `max_occupants: 1`.
- [x] [FE] Hiển thị hóa đơn gần đây có detail drawer.
- [x] [FE] Tenant không được submit utility reading mới nếu reading tháng đó đã `APPROVED` hoặc `INVOICED`.

## P2 - Product completion

### P2.1 - Fixed charges module

- [x] [BE] CRUD `charge_catalog`: wifi, rác, xe, phí khác.
- [x] [BE] CRUD `building_charge`.
- [x] [BE] CRUD `room_charge_override`.
- [x] [BE] CRUD `contract_charge_override`.
- [x] [BE] CRUD `room_month_extra` cho persons/vehicles theo tháng.
- [x] [BE] Viết service resolve fixed charges theo priority: contract override -> room override -> building default.
- [x] [BE] Invoice generation phải include fixed charges.
- [x] [FE] Màn cấu hình phí theo building.
- [x] [FE] Màn override phí theo room/contract.
- [x] [FE] Form nhập persons/vehicles theo tháng nếu dùng phí theo người/xe.

### P2.2 - Upload và Cloudinary

- [x] [BE] Thêm signed upload endpoint, ví dụ `GET /api/uploads/signature`.
- [x] [BE] Thêm validation folder/resource type/allowed mime/size.
- [x] [BE] Lưu metadata vào bảng đúng ngữ cảnh: tenant document, utility evidence, payment proof, contract document.
- [x] [FE] Tích hợp upload trực tiếp Cloudinary.
- [x] [FE] Tenant upload CCCD/ảnh giấy tờ.
- [x] [FE] Tenant upload utility evidence.
- [x] [FE] Tenant upload payment proof.
- [x] [FE] Manager upload scan/PDF hợp đồng.

### P2.3 - Dashboard thật

- [x] [BE] Thêm endpoint `/api/dashboard/summary`.
- [x] [BE] Thống kê total buildings/rooms/tenants.
- [x] [BE] Thống kê occupied/vacant/maintenance/inactive rooms.
- [x] [BE] Thống kê doanh thu tháng, unpaid, overdue.
- [x] [BE] Recent tenants và recent unpaid invoices.
- [x] [FE] Thay mock `dashboardService.ts` bằng API thật.
- [x] [FE] Bỏ hard-code tháng `2025-03`.
- [x] [FE] Dashboard filter theo month/building.

### P2.4 - Reports

- [x] [BE] Report doanh thu theo tháng/building.
- [x] [BE] Report công nợ unpaid/overdue.
- [x] [BE] Report occupancy theo building.
- [x] [BE] Export CSV/XLSX nếu cần.
- [x] [FE] Làm màn `/reports`.
- [x] [FE] Bộ filter month range/building/status.

### P2.5 - Buildings/Rooms polish

- [x] [FE] `BuildingEntity.status` hiện suy từ `has_active_rooms`; chốt status building thật hay bỏ status.
- [x] [FE] Bỏ hard-code `manager: "Current manager"` hoặc backend trả manager profile.
- [x] [BE] Room list nên trả occupancy count và invoice/reading status để tránh frontend gọi N+1.
- [x] [FE] Room table mobile nên chuyển card list hoặc tối ưu responsive.
- [x] [FE] Room detail thêm actions tạo invoice/payment request nhanh.

## P3 - Online gateway payment

### P3.1 - VNPAY

- [x] [BE] Thêm env VNPAY config.
- [x] [BE] Tạo payment + payment_transaction status `CREATED`.
- [x] [BE] Sinh redirect URL.
- [x] [BE] Verify return/callback signature.
- [x] [BE] Update transaction/payment/invoice idempotent.
- [x] [FE] Tenant chọn thanh toán VNPAY từ invoice.
- [x] [FE] Payment result screen.

### P3.2 - MoMo

- [ ] [BE] Thêm env MoMo config.
- [ ] [BE] Tạo transaction MoMo.
- [ ] [BE] Verify callback signature.
- [ ] [BE] Đồng bộ status.
- [ ] [FE] Tenant chọn thanh toán MoMo.

## P4 - Tests, CI, maintainability

### P4.1 - Backend tests

- [x] [BE] Thêm test framework: Vitest/Jest + Supertest.
- [x] [BE] Test auth login/refresh/me.
- [x] [BE] Test RBAC manager/tenant.
- [x] [BE] Test tenant data isolation.
- [x] [BE] Test tenant create/update/delete.
- [x] [BE] Test contract create/update/end/occupancy.
- [x] [BE] Test utility reading submit/approve/reject.
- [x] [BE] Test invoice generation.
- [x] [BE] Test payment request/proof approve/reject.

### P4.2 - Frontend tests

- [x] [FE] Thêm Vitest + Testing Library hoặc Playwright smoke.
- [x] [FE] Test auth route guard.
- [x] [FE] Test main route rendering.
- [x] [FE] Test tenant form payload mapping.
- [x] [FE] Test invoice form calculation.
- [x] [FE] Test tenant utility reading validation.

### P4.3 - CI

- [x] [CI] GitHub Actions backend `npm run check`.
- [x] [CI] GitHub Actions backend `npm run build`.
- [x] [CI] GitHub Actions frontend `npm run lint`.
- [x] [CI] GitHub Actions frontend `npm run build`.
- [x] [CI] Thêm test jobs khi có test suite.

### P4.4 - Migration strategy

- [ ] [DB] Tách `database.sql` thành migrations versioned.
- [ ] [DB] Tách schema và seed/demo data.
- [ ] [DB] Thêm script migrate local.
- [ ] [DB] Document rollback/restore tối thiểu.

### P4.5 - Frontend performance

- [ ] [FE] Code-split các màn lớn: tenants, payments/invoices, dashboard.
- [ ] [FE] Lazy-load route components.
- [ ] [FE] Tách vendor chunk Ant Design nếu cần.
- [ ] [FE] Theo dõi lại bundle warning sau khi split.

## Sprint đề xuất

### Sprint 0 - Hardening nền tảng

- [ ] P0.1 Tenant ownership/data isolation.
- [ ] P0.2 Env + README.
- [ ] P0.3 Route/module naming.

### Sprint 1 - Core rental workflow

- [ ] P1.1 Contract module.
- [ ] P1.2 Utility rate/reading workflow.
- [ ] P1.3 Invoice generation bản đầu.

### Sprint 2 - Payment và tenant portal

- [ ] P1.4 Manual bank transfer payment.
- [ ] P1.5 Tenant portal data correctness.
- [ ] P2.3 Dashboard API thật.

### Sprint 3 - Phí cố định, upload, báo cáo

- [ ] P2.1 Fixed charges.
- [ ] P2.2 Cloudinary upload.
- [ ] P2.4 Reports.
- [ ] P2.5 Buildings/Rooms polish.

### Sprint 4 - Gateway và quality

- [ ] P3.1 VNPAY.
- [ ] P3.2 MoMo.
- [ ] P4 Tests/CI/migrations/performance.

## Ghi chú kỹ thuật đã phát hiện

- `TODO.md` cũ từng có checklist đã hoàn thành cho build/lint/security/business rules; các việc còn lại chủ yếu nằm ở product completion, tests và docs.
- Database schema đã có nhiều bảng nâng cao nhưng backend/frontend chưa dùng hết: fixed charges, payment transaction, contract document.
- Frontend có một prototype cũ trong `front-end/src/features/buildings/*`; route hiện tại đang dùng `front-end/src/pages/buildings/*`.
- Auth hiện lưu JWT trong `localStorage`; đủ cho MVP nội bộ, nhưng nếu public production nên cân nhắc httpOnly cookie/session hardening.
- Logout hiện stateless, refresh token chưa có revoke/rotation persistence.
