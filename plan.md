# Plan – Hệ thống quản lý phòng trọ (Web/App)

> Bản plan này tổng hợp **chức năng + kiến trúc dữ liệu + công nghệ** theo toàn bộ nội dung đã chốt.  
> Có bổ sung: **Cloudinary** (upload file) và **Responsive Mobile/PC** (Ant Design).  
> Có loại bỏ: **Scheduler/Jobs** và **Audit trail nâng cao** (để làm sau vì hệ thống còn nhỏ).

---

## 1) Công nghệ & mục tiêu triển khai

### 1.1 Tech stack
- **Frontend:** ReactJS + TypeScript + Ant Design
- **Backend:** NodeJS + ExpressJS + PostgreSQL
- **Upload file:** Cloudinary (signed upload)

### 1.2 Mục tiêu sản phẩm (MVP)
- Chạy tốt trên **PC + Mobile**
- Quản lý được:
  - Tòa nhà, phòng
  - Người thuê + tài khoản đăng nhập tenant
  - Hợp đồng thuê + ở ghép
  - Điện/nước theo **chỉ số** (kWh/m³) + đơn giá theo tòa
  - Phí cố định tuỳ trọ (wifi/rác/xe…) có thể bật/tắt & override
  - Xuất hóa đơn tháng
  - Thanh toán tích hợp (VNPAY/MoMo)
  - In/lưu hợp đồng

---

## 2) Vai trò & quyền

### 2.1 Manager
- CRUD building/room/tenant/contract
- Quản lý đơn giá điện/nước, phí cố định
- Duyệt chỉ số điện/nước
- Xuất hóa đơn tháng
- Theo dõi thanh toán & trạng thái hóa đơn
- In/lưu hợp đồng
- Xem thống kê cơ bản

### 2.2 Tenant
- Đăng nhập
- Xem thông tin phòng/hợp đồng
- Nhập chỉ số điện/nước theo tháng
- Xem hóa đơn & thanh toán qua VNPAY/MoMo
- Xem lịch sử thanh toán

---

## 3) Cấu trúc dữ liệu (tóm tắt theo module)

### 3.1 Accounts & Profiles
- `app_user` (role: MANAGER/TENANT): login chung
- `manager_profile`: thông tin hiển thị của manager
- `tenant`: hồ sơ người thuê, liên kết `tenant.user_id -> app_user.id`

### 3.2 Buildings & Rooms
- `building`: thuộc `manager_user_id`
- `room`: thuộc `building_id`, chứa giá phòng mặc định, cọc mặc định, status, max occupants

### 3.3 Contract & Occupancy (ở ghép)
- `contract`: gắn 1 room, theo thời gian, có rent_price, deposit_amount, billing_day, status
- `contract_tenant`: danh sách tenant thuộc hợp đồng (is_primary + joined_at/left_at)
- Ràng buộc: 1 phòng chỉ có tối đa 1 contract ACTIVE tại 1 thời điểm

### 3.4 Utility (điện/nước)
- `utility_rate`: đơn giá theo tòa + effective_from
- `utility_reading`: chỉ số theo phòng + tháng (YYYY-MM-01), tenant nhập, manager duyệt

### 3.5 Fixed charges (WIFI/RÁC/XE… tuỳ trọ)
- `charge_catalog`: danh mục loại phí + cách tính (FLAT/PER_PERSON/PER_VEHICLE)
- `building_charge`: default theo tòa
- `room_charge_override`: override theo phòng
- `contract_charge_override`: override theo hợp đồng (ưu tiên cao nhất)
- `room_month_extra`: dữ liệu phát sinh theo tháng (persons_count/vehicles_count) phục vụ tính phí theo người/xe

### 3.6 Invoices
- `invoice`: hóa đơn theo contract + month (YYYY-MM-01), status
- `invoice_item`: dòng chi tiết (RENT/ELECTRIC/WATER/WIFI/TRASH/PARKING/OTHER…)

### 3.7 Payments (business) + Gateway transactions
- `payment`: thanh toán cho invoice (có thể nhiều lần)
- `payment_transaction`: log giao dịch VNPAY/MoMo (request/redirect/callback payload, signature_valid, provider_ref, status…)

### 3.8 Contract documents
- `contract_document`: lưu file PDF/scan hoặc data render

### 3.9 Views hỗ trợ query nhanh
- `vw_room_occupancy`: phòng đang có hợp đồng ACTIVE + số người
- `vw_tenant_current_room`: tenant hiện ở phòng nào
- `vw_room_invoice_status`: trạng thái hóa đơn theo phòng/tháng

---

## 4) Chức năng chi tiết (theo màn hình)

### 4.1 Manager – Buildings
- List + create/update/delete building
- Drill-down vào rooms của building

### 4.2 Manager – Rooms
- List rooms theo building, filter theo status
- Xem nhanh:
  - số người đang ở (occupancy)
  - tình trạng hóa đơn tháng hiện tại (đã phát hành/đã trả/chưa trả)
  - chỉ số điện/nước của tháng hiện tại (đã nhập/chưa nhập)

### 4.3 Manager – Tenants
- CRUD tenant (cá nhân + giấy tờ + status + note)
- Xem tenant đang ở phòng nào (nếu có hợp đồng ACTIVE)

### 4.4 Manager – Contracts
- Create contract cho room (start/end, rent_price, deposit, billing_day)
- Add/remove co-tenants (contract_tenant)
- End contract (ENDED) khi trả phòng
- In/lưu hợp đồng

### 4.5 Manager – Utility
- CRUD utility_rate (đơn giá)
- Xem/duyệt utility_reading theo tháng:
  - tenant nhập
  - manager verify

### 4.6 Manager – Fixed charges
- CRUD charge_catalog (WIFI/TRASH/PARKING…)
- Cấu hình phí theo tòa (building_charge)
- Override theo phòng (room_charge_override)
- Override theo hợp đồng (contract_charge_override)
- Nhập số người/số xe theo tháng (room_month_extra) nếu cần

### 4.7 Manager – Invoices
- Generate invoice theo tháng (thủ công: manager bấm “Xuất hóa đơn tháng”)
- Xem list invoice theo building/room/month/status
- Xem chi tiết invoice + items + tổng tiền
- Mark issued / void (tuỳ rule)
- Theo dõi trạng thái thanh toán

### 4.8 Manager – Payments
- Xem lịch sử payment + transaction
- Debug giao dịch gateway theo provider_ref/merchant_order_id

### 4.9 Tenant – Home (phòng của tôi)
- Xem tòa/phòng/hợp đồng đang ACTIVE
- Xem phí áp dụng
- Xem trạng thái hóa đơn hiện tại

### 4.10 Tenant – Nhập chỉ số điện/nước
- Form nhập chỉ số theo tháng (YYYY-MM)
- Lưu reported_by/at
- Chờ manager duyệt (nếu bật verify)

### 4.11 Tenant – Hóa đơn & Thanh toán
- List hóa đơn theo tháng
- Xem chi tiết hóa đơn
- Thanh toán qua VNPAY/MoMo:
  - tạo payment + payment_transaction
  - redirect tới gateway
  - callback cập nhật status + signature_valid
- Xem lịch sử thanh toán

---

## 5) Luồng nghiệp vụ chính

### 5.1 Onboarding tenant + contract
1) Manager tạo tenant (+ tạo app_user role TENANT nếu tenant cần login)
2) Manager tạo contract cho room
3) Thêm tenant vào contract_tenant (1 primary)

### 5.2 Nhập & duyệt chỉ số
1) Tenant nhập utility_reading(room_id, month)
2) Manager verify (optional)

### 5.3 Xuất hóa đơn tháng
1) Lấy contracts ACTIVE
2) Lấy utility_reading + utility_rate (effective_from <= month mới nhất)
3) Lấy phí cố định theo ưu tiên:
   - contract override → room override → building default
   - PER_PERSON/PER_VEHICLE: dùng room_month_extra hoặc suy ra từ contract_tenant
4) Tạo invoice + invoice_items + total
5) Chuyển trạng thái ISSUED (tuỳ flow)

### 5.4 Thanh toán qua gateway
1) Tenant chọn invoice → tạo payment (PENDING)
2) Tạo payment_transaction (CREATED) + sinh redirect_url
3) Gateway return/IPN → verify signature → update txn status
4) Update payment SUCCEEDED; nếu đủ tiền → invoice PAID

---

## 6) Upload file với Cloudinary (MVP-friendly)

### 6.1 Loại file
- Tenant: ảnh CCCD (front/back), portrait
- Contract: hợp đồng scan/pdf

### 6.2 Flow khuyến nghị (signed upload)
1) FE gọi BE: `GET /uploads/signature` (nhận signature + timestamp + params)
2) FE upload trực tiếp lên Cloudinary (nhanh, không tải server)
3) FE nhận `secure_url + public_id + metadata`
4) FE gửi BE lưu DB (ví dụ: tenant attachments / contract_document)

### 6.3 Trường nên lưu tối thiểu
- `secure_url`
- `public_id`
- `resource_type` (image/raw)
- `bytes`, `format` (tuỳ chọn)

---

## 7) Responsive Mobile/PC (Ant Design) – nguyên tắc UI bắt buộc

### 7.1 Quy tắc layout
- Mobile-first:
  - Form 1 cột, label top
  - Buttons full width, sticky footer actions
- Desktop:
  - Form 2 cột (hoặc 3 cột ở màn lớn)
  - Table đầy đủ cột

### 7.2 Breakpoints khuyến nghị
- Dùng Antd Grid + `useBreakpoint()`:
  - `xs`: mobile
  - `md`: tablet
  - `lg/xl`: desktop

### 7.3 Pattern cho list màn nhỏ
- Desktop: Antd `Table`
- Mobile: chuyển sang **Card list** (mỗi item 1 Card) để tránh table quá hẹp

### 7.4 Pattern cho form
- Ưu tiên `Drawer`:
  - Mobile: fullscreen / bottom placement
  - Desktop: right 720–840px
- Confirm khi đóng nếu form dirty

---

## 8) Những thứ sẽ làm sau (defer)
- Scheduler/jobs (tự chạy hàng tháng, auto overdue…)
- Audit trail nâng cao (ai sửa cái gì)
- Notification (email/Zalo/push)
- Late fee / penalty rules nâng cao
- Inventory tài sản/hư hỏng/khấu trừ cọc

---

## 9) Next steps triển khai (thứ tự tối ưu)

1) **Core CRUD**: Building, Room, Tenant, Contract (+ occupancy views)
2) **Utility**: utility_rate + utility_reading (tenant nhập + manager duyệt)
3) **Fixed charges**: catalog + configs (building/room/contract) + month extra
4) **Invoices**: generate invoice month + UI quản lý hóa đơn
5) **Payments**: VNPAY trước → MoMo sau (payment + transaction + callback)
6) **Responsive polish**: card list mobile, drawer form responsive, filter UX
7) **Dashboard basic**: phòng trống/đang thuê, doanh thu, công nợ

---

## 10) Gợi ý module code (để render ở CodeX)

### 10.1 Frontend
- `pages/tenants` (list + responsive + form drawer)
- `pages/rooms` (table desktop + cards mobile)
- `pages/invoices` (list + detail + payment entry)
- `components/responsive` (hooks + shared layout)
- `services/api` (axios/fetch + typed DTO)
- `mappers` (dto <-> form values)

### 10.2 Backend
- `routes/` (auth, buildings, rooms, tenants, contracts, utilities, invoices, payments, uploads)
- `middlewares/` (auth JWT, RBAC)
- `validators/` (Zod schemas)
- `services/` (business logic: invoice calc, payment verify)
- `db/` (queries + migrations)

