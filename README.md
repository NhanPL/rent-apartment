# Rent Apartment Management System

Tài liệu này mô tả cách chạy, cách sử dụng và flow nghiệp vụ hiện tại của hệ thống quản lý phòng trọ/căn hộ cho thuê.

## 1. Tổng quan

Rent Apartment là hệ thống web gồm hai vai trò chính:

- `MANAGER`: quản lý tòa nhà, phòng, khách thuê, hợp đồng, chỉ số điện nước, phí cố định, hóa đơn, thanh toán và báo cáo.
- `TENANT`: xem thông tin phòng đang thuê, bạn cùng phòng, giấy tờ cá nhân, chỉ số điện nước, hóa đơn và thanh toán.

Tech stack hiện tại:

- Frontend: React, TypeScript, Vite, Ant Design.
- Backend: Node.js, Express, TypeScript.
- Database: PostgreSQL.
- Upload file: Cloudinary signed upload.
- Thanh toán online: VNPAY sandbox/production tùy cấu hình.

## 2. Cấu trúc thư mục

```text
rent-apartment/
|-- backend/              # Express API, auth, business services
|-- front-end/            # React/Vite UI
|-- migrations/           # SQL schema migrations
|-- seeds/                # Demo data tùy chọn
|-- docs/                 # Tài liệu kỹ thuật bổ sung
|-- database.sql          # Schema tổng hợp tham khảo
`-- README.md             # Tài liệu hướng dẫn sử dụng hiện tại
```

## 3. Chạy hệ thống local

### 3.1. Yêu cầu

- Node.js 20+.
- npm.
- PostgreSQL local hoặc Supabase/PostgreSQL remote.
- Tài khoản Cloudinary nếu cần upload file.
- Tài khoản VNPAY sandbox nếu cần test thanh toán online.
- SMTP account để backend gửi email tài khoản tenant.

### 3.2. Cài dependencies

```sh
cd backend
npm install

cd ../front-end
npm install
```

### 3.3. Cấu hình backend

Tạo file `backend/.env` từ `.env.example` ở root và cập nhật các biến phù hợp.

```sh
copy ..\.env.example .env
```

Các biến bắt buộc tối thiểu cho backend:

```env
PORT=4000
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
JWT_ACCESS_SECRET=<your_access_secret>
JWT_REFRESH_SECRET=<your_refresh_secret>
CLIENT_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
PUBLIC_API_BASE_URL=http://localhost:4000/api
SMTP_HOST=<smtp_host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp_user>
SMTP_PASS=<smtp_password>
SMTP_FROM_NAME=Rent Apartment
SMTP_FROM_EMAIL=<from_email>
```

Các biến tùy chọn:

- `DEFAULT_BANK_CODE`, `DEFAULT_BANK_ACCOUNT_NO`, `DEFAULT_BANK_ACCOUNT_NAME`: thông tin mặc định khi tạo yêu cầu chuyển khoản.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: dùng cho upload file.
- `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL`, `VNPAY_RETURN_URL`, `VNPAY_IPN_URL`: dùng cho thanh toán VNPAY.

### 3.4. Cấu hình frontend

Tạo file `front-end/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

### 3.5. Khởi tạo database

Chạy migration từ thư mục `backend/`:

```sh
npm run db:migrate
```

Nạp dữ liệu demo nếu cần:

```sh
npm run db:seed
```

Dữ liệu demo tạo sẵn hai tài khoản:

- Manager: `manager@example.com` / `password`
- Tenant: `tenant@example.com` / `password`

Chi tiết migration, dry-run và restore nằm trong `docs/database-migrations.md`.

### 3.6. Chạy ứng dụng

Terminal 1:

```sh
cd backend
npm run dev
```

Terminal 2:

```sh
cd front-end
npm run dev
```

Mở frontend tại:

```text
http://localhost:5173
```

Health check backend:

```text
http://localhost:4000/health
```

## 4. Đăng nhập và phân quyền

Người dùng đăng nhập bằng email hoặc username. Sau khi đăng nhập:

- Manager được chuyển tới `/dashboard`.
- Tenant được chuyển tới `/my-room`.
- Người chưa đăng nhập luôn bị chuyển về `/login`.
- Tenant không truy cập được các màn quản trị của manager.
- Manager không truy cập tenant portal `/my-room`.

Token đăng nhập được lưu ở localStorage. Khi access token hết hạn, frontend tự gọi refresh token; nếu refresh thất bại, người dùng được đưa về màn đăng nhập.

## 5. Hướng dẫn sử dụng cho Manager

### 5.1. Dashboard

Đường dẫn: `/dashboard`

Manager dùng dashboard để xem nhanh tình hình vận hành theo tháng và theo tòa nhà:

- Tổng số tòa nhà, phòng, tenant.
- Phòng đang thuê, phòng trống, phòng bảo trì/inactive.
- Hóa đơn chưa thanh toán, tổng công nợ.
- Doanh thu tháng từ các payment thành công.
- Biểu đồ trạng thái phòng, billing trend và phân bổ phòng theo tòa.
- Danh sách tenant mới và hóa đơn chưa thanh toán gần đây.

Có thể lọc theo tháng và tòa nhà, sau đó bấm refresh để tải lại dữ liệu.

### 5.2. Buildings và Rooms

Đường dẫn: `/buildings`

Flow sử dụng:

1. Bấm `Add` hoặc `Add Building` để tạo tòa nhà.
2. Chọn một tòa nhà trong danh sách để xem chi tiết.
3. Trong tab phòng của tòa nhà, bấm `Add Room` để tạo phòng.
4. Dùng bộ lọc/search để tìm phòng theo mã phòng hoặc trạng thái.
5. Với từng phòng, manager có thể xem chi tiết, sửa hoặc xóa.

Thông tin phòng gồm mã phòng, tầng, diện tích, trạng thái, tiền thuê mặc định, tiền cọc mặc định và số người tối đa. Danh sách phòng cũng hiển thị occupancy, trạng thái hóa đơn gần nhất và trạng thái chỉ số điện nước gần nhất nếu có.

Đường dẫn chi tiết phòng: `/rooms/:id`

Tại chi tiết phòng, manager có thể:

- Xem thông tin phòng và tenant đang ở.
- Xem danh sách hóa đơn của phòng.
- Bấm `Generate Invoice` để xuất hóa đơn tháng hiện tại cho phòng.
- Bấm `Payment Request` để tạo nhanh yêu cầu thanh toán cho hóa đơn có thể thu.
- Sửa hoặc xóa phòng.
- Mở chi tiết hóa đơn từ bảng invoices.

### 5.3. Tenants

Đường dẫn: `/tenants`

Manager dùng màn này để quản lý hồ sơ người thuê:

- Tạo tenant mới bằng `Add Tenant`.
- Cập nhật thông tin cá nhân, email, số điện thoại, giấy tờ, địa chỉ và trạng thái.
- Tạo tài khoản đăng nhập tenant khi tenant có email.
- Gắn hợp đồng/phòng ngay trong form tạo tenant nếu cần.
- Xem hợp đồng hiện tại, hóa đơn và thanh toán liên quan.
- Export hợp đồng thuê dạng DOCX bằng `Export` hoặc `Export Contract`.
- Xóa tenant theo cơ chế soft delete.

Khi tạo tenant có email, backend sinh mật khẩu ngẫu nhiên và gửi email chào mừng qua SMTP đã cấu hình.

### 5.4. Contracts

Đường dẫn: `/contracts`

Manager dùng màn contracts để quản lý hợp đồng thuê và ở ghép:

1. Bấm `New Contract`.
2. Chọn tòa nhà, phòng, tenant chính, tenant ở ghép nếu có.
3. Nhập mã hợp đồng, ngày bắt đầu, ngày kết thúc, ngày vào ở, tiền thuê, tiền cọc và ngày chốt tiền.
4. Lưu hợp đồng ở trạng thái phù hợp.
5. Với hợp đồng `DRAFT`, bấm `Activate` khi sẵn sàng cho thuê.

Trong chi tiết hợp đồng, manager có thể:

- Xem phòng, tenant, số người đang ở và trạng thái.
- Thêm tenant vào hợp đồng.
- Đổi tenant chính.
- Remove tenant khỏi hợp đồng.
- Upload tài liệu hợp đồng qua Cloudinary.
- Kết thúc hợp đồng bằng `End`.
- Hủy hợp đồng bằng `Cancel`.

Quy tắc quan trọng:

- Một phòng chỉ có tối đa một hợp đồng `ACTIVE` tại một thời điểm.
- Chỉ hợp đồng `ACTIVE` được tính là đang ở, được dùng khi tenant nhập chỉ số và khi xuất hóa đơn.
- Mỗi hợp đồng chỉ có một tenant chính.
- Số tenant active không được vượt quá `max_occupants` của phòng.

### 5.5. Utilities

Đường dẫn: `/utilities`

Màn này gồm hai nhóm việc:

- Quản lý đơn giá điện/nước theo tòa nhà và ngày hiệu lực.
- Duyệt chỉ số điện/nước tenant gửi lên.

Flow đơn giá:

1. Bấm `New Rate`.
2. Chọn tòa nhà.
3. Nhập ngày hiệu lực, đơn giá điện và đơn giá nước.
4. Lưu. Khi xuất hóa đơn, hệ thống dùng đơn giá mới nhất có `effective_from` nhỏ hơn hoặc bằng tháng hóa đơn.

Flow duyệt chỉ số:

1. Tenant gửi chỉ số tháng từ tenant portal.
2. Manager vào tab readings, lọc theo tháng/tòa/phòng/trạng thái.
3. Mở detail để xem chỉ số cũ, chỉ số mới và evidence.
4. Bấm `Approve` để chấp nhận hoặc `Reject` và nhập lý do.
5. Chỉ số đã `APPROVED` hoặc `INVOICED` không còn được tenant sửa trực tiếp.

Trạng thái chỉ số hiện tại: `SUBMITTED`, `APPROVED`, `REJECTED`, `INVOICED`.

### 5.6. Fixed Charges

Đường dẫn: `/fixed-charges`

Màn này quản lý các phí cố định như wifi, rác, giữ xe hoặc phí khác.

Các tab chính:

- `Catalog`: danh mục loại phí, gồm mã phí, tên phí và cách tính `FLAT`, `PER_PERSON`, `PER_VEHICLE`.
- `Building Defaults`: cấu hình phí mặc định theo tòa nhà.
- `Room Overrides`: ghi đè phí theo phòng.
- `Contract Overrides`: ghi đè phí theo hợp đồng.
- `Monthly Extras`: nhập số người/số xe phát sinh theo tháng.
- `Resolved Charges`: preview các phí sẽ được áp dụng cho một hợp đồng trong một tháng.

Thứ tự ưu tiên khi tính hóa đơn:

1. Contract override.
2. Room override.
3. Building default.

### 5.7. Invoices

Đường dẫn: `/invoices`

Manager dùng màn này để tạo, phát hành và theo dõi hóa đơn.

Các thao tác chính:

- `Generate Monthly`: sinh hóa đơn theo tháng cho tất cả hợp đồng active, một tòa nhà hoặc một phòng.
- `Create Manual Invoice`: tạo hóa đơn thủ công.
- Lọc hóa đơn theo tháng, trạng thái hóa đơn, trạng thái thanh toán, tòa nhà, phòng và tenant.
- Mở `Invoice detail` để xem items, adjustments, payments và payment request.
- `Issue`: phát hành hóa đơn.
- `Mark overdue`: đánh dấu quá hạn.
- `Void`: hủy hóa đơn.
- `Create payment request`: tạo yêu cầu chuyển khoản cho tenant.
- `Cancel request` hoặc `Expire request`: cập nhật yêu cầu thanh toán hiện có.

Khi sinh hóa đơn tháng, hệ thống tổng hợp:

- Tiền thuê phòng từ hợp đồng.
- Điện/nước từ chỉ số đã duyệt và đơn giá hiệu lực.
- Phí cố định đã resolve theo thứ tự ưu tiên.
- Các khoản khác nếu có trong hóa đơn thủ công.

Hệ thống chặn sinh trùng hóa đơn theo `contract_id + month`; các invoice đã tồn tại sẽ được đưa vào danh sách skipped.

### 5.8. Payments

Đường dẫn: `/payments`

Manager dùng màn này để review thanh toán chuyển khoản thủ công:

1. Xem danh sách payment requests.
2. Mở detail để xem hóa đơn, số tiền yêu cầu, trạng thái request, thông tin ngân hàng và biên lai tenant đã upload.
3. Với proof đang chờ, bấm approve để xác nhận hoặc reject và nhập lý do.
4. Khi proof được approve, backend tạo payment thành công và cập nhật số tiền đã thanh toán của invoice.
5. Nếu invoice đã thu đủ, trạng thái invoice chuyển sang `PAID`.

Màn này cũng hiển thị danh sách approved payments của từng request để đối soát lịch sử.

### 5.9. Reports

Đường dẫn: `/reports`

Manager dùng reports để xem và xuất dữ liệu vận hành:

- `Revenue`: doanh thu theo tháng và theo tòa nhà.
- `Debt`: công nợ theo hóa đơn chưa thanh toán/quá hạn.
- `Occupancy`: tỷ lệ lấp đầy theo tòa nhà.

Bộ lọc gồm khoảng tháng, tòa nhà và trạng thái hóa đơn. Có thể bấm `Export CSV` để tải dữ liệu của tab đang chọn.

## 6. Hướng dẫn sử dụng cho Tenant

### 6.1. My Room

Đường dẫn: `/my-room`

Tenant portal tập trung toàn bộ thông tin người thuê cần thao tác:

- Thông tin tòa nhà, phòng, hợp đồng active.
- Bạn cùng phòng và tenant chính.
- Hóa đơn tháng hiện tại và lịch sử hóa đơn gần đây.
- Form nhập chỉ số điện/nước.
- Upload evidence cho chỉ số.
- Upload giấy tờ cá nhân.
- Thanh toán hóa đơn bằng VNPAY hoặc chuyển khoản thủ công nếu có payment request.

Nếu tenant chưa có hợp đồng active, màn hình sẽ hiển thị trạng thái không tìm thấy phòng hiện tại.

### 6.2. Upload giấy tờ cá nhân

Tenant có thể upload các loại giấy tờ:

- `IDENTITY_FRONT`
- `IDENTITY_BACK`
- `RESIDENCE`
- `OTHER`

Flow upload:

1. Chọn loại giấy tờ.
2. Bấm `Upload file`.
3. Frontend gọi backend lấy Cloudinary signature.
4. File được upload trực tiếp lên Cloudinary.
5. Tenant bấm lưu để backend ghi metadata vào database.

### 6.3. Nhập chỉ số điện/nước

Flow tenant nhập chỉ số:

1. Chọn tháng cần nhập.
2. Nhập chỉ số điện và nước hiện tại.
3. Bấm submit.
4. Nếu cần, upload evidence ở khối `Utility evidence`.
5. Chờ manager approve hoặc reject.

Tenant không được gửi lại chỉ số khi reading tháng đó đã ở trạng thái `APPROVED` hoặc `INVOICED`. Nếu bị reject, tenant xem lý do và gửi lại chỉ số/evidence phù hợp.

### 6.4. Xem hóa đơn

Tenant xem được:

- Hóa đơn tháng hiện tại.
- Trạng thái hóa đơn.
- Trạng thái thanh toán.
- Tiền thuê, điện, nước, phí khác.
- Lịch sử hóa đơn gần đây.
- Chi tiết items và payments khi mở hóa đơn.

### 6.5. Thanh toán VNPAY

Điều kiện: invoice còn tiền phải trả và backend đã cấu hình VNPAY.

Flow:

1. Tenant bấm `Pay with VNPAY`.
2. Backend tạo payment và payment transaction.
3. Frontend redirect tenant sang trang thanh toán VNPAY.
4. Sau khi thanh toán, VNPAY trả về `/payment-result`.
5. Backend verify chữ ký return/IPN và cập nhật transaction, payment, invoice.
6. Tenant xem kết quả thanh toán trên màn `Payment Result`.

### 6.6. Thanh toán chuyển khoản thủ công

Điều kiện: manager đã tạo payment request cho invoice.

Flow:

1. Tenant xem thông tin ngân hàng, số tiền cần chuyển, nội dung chuyển khoản và QR nếu có.
2. Tenant chuyển khoản ngoài hệ thống.
3. Tenant nhập số tiền đã chuyển, thời gian chuyển, mã tham chiếu nếu có.
4. Tenant upload biên lai và bấm `Gửi biên lai`.
5. Request chuyển sang trạng thái chờ manager duyệt.
6. Manager approve hoặc reject proof ở màn `/payments`.
7. Nếu approve, hóa đơn được cộng tiền thanh toán.

## 7. Flow nghiệp vụ tổng thể

### 7.1. Flow thiết lập dữ liệu ban đầu

```text
Manager đăng nhập
  -> tạo Building
  -> tạo Room
  -> tạo Utility Rate
  -> tạo Fixed Charge Catalog
  -> cấu hình Building Defaults / Room Overrides / Contract Overrides
```

### 7.2. Flow đưa tenant vào ở

```text
Manager tạo Tenant
  -> hệ thống tạo app_user TENANT và gửi email nếu có email
  -> Manager tạo Contract cho Room
  -> gắn primary tenant và co-tenants
  -> Activate contract
  -> Room được tính là occupied
  -> Tenant đăng nhập và thấy phòng tại /my-room
```

### 7.3. Flow chỉ số điện/nước

```text
Tenant nhập chỉ số tháng
  -> upload evidence nếu cần
  -> Reading = SUBMITTED
  -> Manager kiểm tra ở /utilities
  -> Approve: Reading = APPROVED
  -> Reject: Reading = REJECTED, tenant xem lý do và gửi lại
  -> Khi hóa đơn dùng reading này, Reading = INVOICED
```

### 7.4. Flow xuất hóa đơn tháng

```text
Manager chọn Generate Monthly
  -> chọn scope: all active contracts / building / room
  -> backend lấy contract ACTIVE
  -> lấy utility reading đã duyệt
  -> lấy utility rate hiệu lực
  -> resolve fixed charges
  -> tạo invoice + invoice items
  -> skipped invoice đã tồn tại
  -> Manager issue invoice nếu cần
```

### 7.5. Flow thanh toán chuyển khoản thủ công

```text
Manager mở Invoice Detail
  -> Create payment request
  -> Tenant xem thông tin chuyển khoản tại /my-room
  -> Tenant chuyển khoản và upload proof
  -> Manager mở /payments
  -> Approve proof
  -> backend tạo payment SUCCEEDED
  -> invoice cập nhật paid amount
  -> nếu đủ tiền, invoice = PAID
```

### 7.6. Flow thanh toán VNPAY

```text
Tenant mở hóa đơn tại /my-room
  -> Pay with VNPAY
  -> backend tạo transaction CREATED
  -> redirect sang VNPAY
  -> VNPAY return/IPN
  -> backend verify signature
  -> payment = SUCCEEDED hoặc FAILED
  -> invoice = PAID nếu đã thu đủ
```

### 7.7. Flow trả phòng hoặc hủy hợp đồng

```text
Manager mở Contract Detail
  -> End contract khi tenant trả phòng
  -> hệ thống set ENDED, move_out_date, left_at
  -> Room không còn contract ACTIVE
  -> Tenant không còn current room
```

Nếu hợp đồng bị tạo sai hoặc không có hiệu lực, manager dùng `Cancel`; hợp đồng chuyển `CANCELLED` và được giữ lại cho lịch sử.

## 8. Trạng thái chính trong hệ thống

### Contract

- `DRAFT`: hợp đồng đang chuẩn bị, chưa tính là đang ở.
- `ACTIVE`: hợp đồng đang hiệu lực, được dùng cho occupancy, tenant portal, utility và invoice generation.
- `ENDED`: hợp đồng đã kết thúc.
- `CANCELLED`: hợp đồng bị hủy.

### Room

- `ACTIVE`: phòng có thể cho thuê.
- `MAINTENANCE`: phòng đang bảo trì.
- `INACTIVE`: phòng không sử dụng.

### Utility Reading

- `SUBMITTED`: tenant đã gửi, chờ duyệt.
- `APPROVED`: manager đã duyệt.
- `REJECTED`: manager từ chối, có lý do.
- `INVOICED`: chỉ số đã được dùng để xuất hóa đơn.

### Invoice

- `DRAFT`: hóa đơn nháp.
- `ISSUED`: đã phát hành.
- `PAID`: đã thanh toán đủ.
- `OVERDUE`: quá hạn.
- `VOID`: đã hủy.

### Payment Request

- `DRAFT`: yêu cầu thanh toán nháp.
- `WAITING_TRANSFER`: chờ tenant chuyển khoản và gửi biên lai.
- `TRANSFER_SUBMITTED`: tenant đã gửi biên lai, chờ manager duyệt.
- `VERIFIED`: yêu cầu đã được xác minh sau khi proof được approve và invoice đã thu đủ.
- `REJECTED`: biên lai bị từ chối.
- `CANCELLED`: manager hủy request.
- `EXPIRED`: request hết hạn.

### Payment Proof

- `PENDING`: biên lai tenant gửi đang chờ duyệt.
- `APPROVED`: biên lai đã được manager duyệt.
- `REJECTED`: biên lai bị manager từ chối.

### Payment

- `PENDING`: đang chờ xử lý.
- `SUCCEEDED`: thanh toán thành công.
- `FAILED`: thanh toán thất bại.
- `CANCELLED`: đã hủy.
- `REFUNDED`: đã hoàn tiền.

## 9. Kiểm tra chất lượng

Backend:

```sh
cd backend
npm run check
npm run build
npm run test
```

Frontend:

```sh
cd front-end
npm run lint
npm run build
npm run test
```

## 10. Ghi chú vận hành

- Seed demo chỉ nên dùng cho database local/disposable, không chạy trên production hoặc dữ liệu dùng chung.
- SMTP đang được validate bắt buộc ở backend config; nếu thiếu biến SMTP backend sẽ không khởi động.
- Upload file cần Cloudinary config. Nếu thiếu config, các luồng upload giấy tờ, evidence, payment proof và contract document sẽ không hoạt động đầy đủ.
- VNPAY cần cấu hình `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, return URL và IPN URL đúng môi trường.
- MoMo mới nằm trong roadmap/TODO, chưa phải luồng hoàn chỉnh trong hệ thống hiện tại.
