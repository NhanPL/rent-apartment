# Rent Apartment - Production Readiness Backlog

## 1. Mục tiêu

Tài liệu này tổng hợp các công việc cần thực hiện để đưa hệ thống từ mức MVP nội bộ
lên mức sẵn sàng triển khai production công khai.

Mục tiêu chính:

- Bảo vệ tài khoản, dữ liệu định danh và dữ liệu tài chính.
- Bảo đảm dữ liệu hóa đơn, thanh toán và hợp đồng có thể truy vết.
- Giảm rủi ro lỗi nghiệp vụ do transaction, concurrency hoặc migration.
- Tăng khả năng bảo trì của frontend và backend.
- Bổ sung test, monitoring, backup và quy trình triển khai.
- Chuẩn hóa trải nghiệm người dùng trên toàn bộ hệ thống.

## 2. Quy ước mức độ ưu tiên

- `P0 - Release blocker`: Phải hoàn thành trước khi public production.
- `P1 - High`: Nên hoàn thành trước hoặc ngay sau lần phát hành production đầu tiên.
- `P2 - Medium`: Cải thiện khả năng bảo trì, hiệu năng và trải nghiệm.
- `P3 - Nice to have`: Có thể thực hiện sau khi hệ thống đã vận hành ổn định.

## 3. Điều kiện cho phép phát hành production

Chỉ nên public production khi đáp ứng toàn bộ điều kiện sau:

- [ ] Không còn tài khoản có thể đăng nhập mà không cần mật khẩu hoặc phương thức xác thực hợp lệ.
- [ ] Refresh token có rotation, revoke và không còn lưu trong `localStorage`.
- [ ] Login và các API nhạy cảm đã có rate limit.
- [ ] CORS và security headers được cấu hình đúng theo môi trường.
- [ ] CCCD và bằng chứng thanh toán không thể truy cập bằng URL công khai vĩnh viễn.
- [ ] Invoice và payment đã phát hành không thể bị hard-delete.
- [ ] Mọi thao tác tài chính quan trọng đều có audit log.
- [ ] Migration được kiểm thử tự động trên PostgreSQL thật.
- [ ] Các luồng nghiệp vụ chính có E2E test.
- [ ] Có backup tự động và đã kiểm thử khôi phục dữ liệu.
- [ ] Có logging, error tracking, health check và cảnh báo vận hành.
- [ ] Không còn lỗ hổng mức critical/high từ dependency scan.

---

# P0 - Security And Privacy

## AUTH-001 - Loại bỏ đăng nhập không cần mật khẩu

**Hiện trạng**

Backend đang chấp nhận đăng nhập khi `password_hash` là `NULL` hoặc chuỗi rỗng.

**Công việc**

- [x] Sửa hàm xác thực để tài khoản không có password hash luôn bị từ chối đăng nhập.
- [x] Không cho phép request login thiếu trường `password` trong luồng đăng nhập bằng mật khẩu.
- [x] Đổi validation của password từ optional thành required.
- [x] Xác định trạng thái tài khoản chưa kích hoạt, ví dụ `PENDING_ACTIVATION`.
- [x] Không sử dụng `is_active=true` cho tài khoản chưa thiết lập mật khẩu.
- [x] Viết migration xử lý các tài khoản đang có `password_hash IS NULL` hoặc rỗng.
- [x] Không tự động tạo mật khẩu mặc định dễ đoán.
- [x] Trả về thông báo đăng nhập chung, không tiết lộ tài khoản có tồn tại hay không.
- [x] Gỡ bỏ hoặc sửa các test đang kỳ vọng tài khoản passwordless đăng nhập thành công.

**Tiêu chí nghiệm thu**

- [x] Tài khoản có `password_hash=NULL` nhận HTTP `401`.
- [x] Tài khoản có `password_hash=''` nhận HTTP `401`.
- [x] Tài khoản bị khóa hoặc chưa kích hoạt nhận HTTP `401`.
- [x] Tài khoản hợp lệ vẫn đăng nhập bình thường.
- [x] Không có API nào trả password hash về client.

## AUTH-002 - Xây dựng quy trình kích hoạt tài khoản tenant

**Công việc**

- [x] Khi manager tạo tenant, tạo tài khoản ở trạng thái chờ kích hoạt.
- [x] Sinh activation token ngẫu nhiên bằng nguồn random an toàn.
- [x] Chỉ lưu hash của activation token trong database.
- [x] Đặt thời hạn token, đề xuất 24-48 giờ.
- [x] Gửi liên kết kích hoạt qua email nếu SMTP được cấu hình.
- [x] Cho phép manager gửi lại lời mời.
- [x] Khi gửi lại, vô hiệu hóa activation token cũ.
- [x] Tạo trang tenant thiết lập mật khẩu lần đầu.
- [x] Yêu cầu nhập mật khẩu mới và xác nhận mật khẩu.
- [x] Kích hoạt tài khoản chỉ sau khi đặt mật khẩu thành công.
- [x] Không cho phép sử dụng activation token quá hạn hoặc đã dùng.
- [x] Ghi audit log cho tạo tài khoản, gửi lời mời và kích hoạt.

**Tiêu chí nghiệm thu**

- [x] Tenant chưa kích hoạt không đăng nhập được.
- [x] Token chỉ dùng được một lần.
- [x] Token hết hạn bị từ chối.
- [x] Sau khi kích hoạt, tenant đăng nhập được bằng mật khẩu vừa đặt.
- [x] Manager nhìn thấy trạng thái kích hoạt của tenant.

## AUTH-003 - Quên mật khẩu và đặt lại mật khẩu

**Công việc**

- [ ] Thêm API yêu cầu reset password.
- [ ] Thêm API xác nhận reset password.
- [ ] Sinh reset token ngẫu nhiên và chỉ lưu hash.
- [ ] Đặt thời hạn reset token, đề xuất 15-30 phút.
- [ ] Phản hồi giống nhau dù email có tồn tại hay không.
- [ ] Thêm giới hạn tần suất gửi reset password.
- [ ] Tạo trang nhập mật khẩu mới và xác nhận mật khẩu.
- [ ] Vô hiệu hóa toàn bộ reset token cũ sau khi reset thành công.
- [ ] Thu hồi toàn bộ phiên đăng nhập sau khi reset.
- [ ] Gửi email thông báo mật khẩu đã được thay đổi.
- [ ] Ghi audit log cho yêu cầu và hoàn thành reset password.

**Tiêu chí nghiệm thu**

- [ ] Không thể dò tìm email đăng ký qua API.
- [ ] Reset token hết hạn hoặc đã dùng không thể tái sử dụng.
- [ ] Tất cả refresh token cũ bị vô hiệu hóa sau khi reset.

## AUTH-004 - Thiết kế lại access token và refresh token

**Công việc**

- [ ] Giảm access token TTL xuống khoảng 10-15 phút.
- [ ] Chuyển refresh token sang cookie `HttpOnly`.
- [ ] Bật `Secure` trong staging và production.
- [ ] Cấu hình `SameSite` phù hợp với kiến trúc deploy.
- [ ] Không lưu refresh token trong `localStorage`.
- [ ] Cân nhắc không lưu access token lâu dài; ưu tiên giữ trong memory.
- [ ] Tạo bảng session hoặc refresh token trong database.
- [ ] Chỉ lưu hash của refresh token.
- [ ] Lưu `user_id`, `expires_at`, `revoked_at`, `created_at` và thông tin thiết bị cần thiết.
- [ ] Rotation refresh token sau mỗi lần refresh.
- [ ] Phát hiện refresh token reuse và thu hồi cả token family.
- [ ] Thu hồi session khi logout.
- [ ] Thu hồi mọi session khi đổi/reset mật khẩu.
- [ ] Cho phép vô hiệu hóa tất cả thiết bị.
- [ ] Dọn dẹp session hết hạn định kỳ.

**Tiêu chí nghiệm thu**

- [ ] Refresh token không xuất hiện trong local storage hoặc JavaScript runtime.
- [ ] Token đã logout không refresh được.
- [ ] Refresh token cũ không dùng lại được sau rotation.
- [ ] Access token hết hạn được refresh đúng một lần khi có nhiều request đồng thời.

## AUTH-005 - Tăng cường chính sách mật khẩu

**Công việc**

- [ ] Thống nhất độ dài tối thiểu và tối đa ở frontend/backend.
- [ ] Cho phép passphrase dài, tránh giới hạn quá ngắn.
- [ ] Kiểm tra mật khẩu mới khác mật khẩu hiện tại.
- [ ] Không log password hoặc request body chứa password.
- [ ] Cân nhắc kiểm tra mật khẩu phổ biến/bị lộ.
- [ ] Hiển thị lỗi rõ ràng nhưng không tiết lộ dữ liệu nhạy cảm.
- [ ] Đăng xuất người dùng khỏi tất cả phiên sau khi đổi mật khẩu.

## SEC-001 - Chuẩn hóa CORS

**Công việc**

- [ ] Xóa middleware CORS viết tay hoặc middleware `cors` bị trùng.
- [ ] Chỉ giữ một nguồn cấu hình CORS.
- [ ] Parse danh sách allowed origins từ environment.
- [ ] Không sử dụng wildcard khi gửi credential.
- [ ] Chỉ cho phép các HTTP methods cần thiết.
- [ ] Chỉ cho phép các headers cần thiết.
- [ ] Trả `Vary: Origin` khi origin được xác định động.
- [ ] Cấu hình riêng cho development, staging và production.
- [ ] Thêm test cho allowed origin và denied origin.
- [ ] Kiểm tra preflight request.

## SEC-002 - Rate limit và chống brute force

**Công việc**

- [ ] Thêm global rate limit ở mức hợp lý.
- [ ] Thêm giới hạn nghiêm ngặt cho `/api/auth/login`.
- [ ] Thêm giới hạn cho `/api/auth/refresh`.
- [ ] Thêm giới hạn cho forgot/reset password.
- [ ] Thêm giới hạn cho API tạo upload signature.
- [ ] Thêm giới hạn cho submit payment proof.
- [ ] Theo dõi số lần login sai theo IP và định danh tài khoản.
- [ ] Thêm delay tăng dần hoặc khóa tạm thời sau nhiều lần thất bại.
- [ ] Không khóa tài khoản vĩnh viễn chỉ dựa trên IP.
- [ ] Ghi log sự kiện nghi ngờ brute force.
- [ ] Bảo đảm rate limit hoạt động đúng sau reverse proxy.
- [ ] Cấu hình `trust proxy` theo môi trường deploy.

## SEC-003 - Security headers và request hardening

**Công việc**

- [ ] Thêm `helmet`.
- [ ] Cấu hình Content Security Policy phù hợp với Ant Design, Cloudinary và VietQR.
- [ ] Bật `X-Content-Type-Options`.
- [ ] Bật chính sách chống clickjacking.
- [ ] Cấu hình Referrer Policy.
- [ ] Cấu hình HSTS ở production.
- [ ] Giới hạn kích thước JSON body toàn cục.
- [ ] Đặt giới hạn riêng cho từng loại upload.
- [ ] Không tin tưởng MIME type do frontend cung cấp nếu backend nhận file trực tiếp.
- [ ] Chuẩn hóa validation UUID, query, params và body.
- [ ] Không trả stack trace hoặc SQL error ra production.

## SEC-004 - Bảo vệ file CCCD và bằng chứng

**Công việc**

- [ ] Chuyển tenant documents sang Cloudinary private/authenticated delivery.
- [ ] Chuyển payment proofs sang private/authenticated delivery.
- [ ] Chuyển utility evidence sang private/authenticated delivery.
- [ ] Chuyển contract documents sang private/authenticated delivery.
- [ ] Không lưu public URL vĩnh viễn làm quyền truy cập duy nhất.
- [ ] Lưu `public_id`, `resource_type`, version và metadata cần thiết.
- [ ] Backend tạo signed URL có thời hạn khi người dùng có quyền xem.
- [ ] Tenant chỉ xem được tài liệu thuộc chính tenant đó.
- [ ] Manager chỉ xem được tài liệu thuộc phạm vi quản lý.
- [ ] Kiểm tra quyền lại tại thời điểm tạo signed URL.
- [ ] Ghi audit log khi xem/tải/xóa CCCD.
- [ ] Cấu hình thời gian lưu giữ cho từng loại tài liệu.
- [ ] Xóa file trên Cloudinary sau khi transaction database thành công.
- [ ] Có cơ chế retry/cleanup nếu database và Cloudinary không đồng bộ.
- [ ] Thêm job phát hiện orphan assets và orphan database records.
- [ ] Không đưa URL nhạy cảm vào log, analytics hoặc error tracking.

**Tiêu chí nghiệm thu**

- [ ] Mở URL cũ khi chưa xác thực không xem được file.
- [ ] Signed URL hết hạn không còn sử dụng được.
- [ ] Manager A không lấy được URL tài liệu của manager B.
- [ ] Xóa tài liệu được ghi nhận trong audit log.

## SEC-005 - Ngăn CSV formula injection

**Công việc**

- [ ] Sanitize giá trị bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc carriage return.
- [ ] Áp dụng sanitizer cho mọi ô dữ liệu xuất CSV.
- [ ] Giữ đúng encoding UTF-8.
- [ ] Cân nhắc thêm BOM để Excel đọc tiếng Việt chính xác.
- [ ] Đặt `Content-Type` và `Content-Disposition` an toàn.
- [ ] Sanitize tên file tải xuống.
- [ ] Thêm test với payload công thức độc hại.

## SEC-006 - Secrets, database TLS và dependency security

**Công việc**

- [ ] Không commit file `.env`.
- [ ] Quét lịch sử Git để phát hiện secret từng bị commit.
- [ ] Rotate secret nếu có khả năng đã bị lộ.
- [ ] Dùng secret manager của nền tảng deploy.
- [ ] Bắt buộc JWT access secret và refresh secret khác nhau.
- [ ] Kiểm tra độ dài tối thiểu của JWT secrets.
- [ ] Bật xác thực TLS certificate cho PostgreSQL production.
- [ ] Không dùng `DB_SSL_REJECT_UNAUTHORIZED=false` làm mặc định production.
- [ ] Bổ sung dependency audit trong CI.
- [ ] Bật Dependabot hoặc công cụ tương đương.
- [ ] Bật secret scanning.
- [ ] Bật CodeQL hoặc static security analysis.
- [ ] Xử lý cảnh báo dependency sử dụng `url.parse()`.

---

# P0 - Financial And Data Integrity

## DATA-001 - Không hard-delete invoice đã phát hành

**Công việc**

- [ ] Phân loại rõ trạng thái invoice: `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`.
- [ ] Chỉ cho phép hard-delete invoice `DRAFT` chưa liên kết payment.
- [ ] Invoice `ISSUED`, `PARTIALLY_PAID` hoặc `PAID` chỉ được void.
- [ ] Bắt buộc nhập lý do void.
- [ ] Lưu người void và thời điểm void.
- [ ] Không xóa payment, payment request hoặc proof khi void invoice.
- [ ] Nếu cần điều chỉnh, tạo adjustment hoặc replacement invoice.
- [ ] Quy định rõ utility reading có được tái sử dụng sau khi void hay không.
- [ ] Không tự động trả utility reading về `APPROVED` nếu đã có lịch sử tài chính cần giữ.
- [ ] Cập nhật dashboard/reports để loại trừ hoặc thể hiện invoice void đúng cách.
- [ ] Cập nhật UI: dùng `Delete` cho draft và `Void` cho invoice đã phát hành.
- [ ] Thêm cảnh báo rõ ảnh hưởng của thao tác.

**Tiêu chí nghiệm thu**

- [ ] Không thể xóa vật lý invoice đã thanh toán.
- [ ] Invoice void vẫn xem được cùng lịch sử payment.
- [ ] Báo cáo doanh thu và công nợ xử lý invoice void chính xác.
- [ ] Thao tác void có audit log đầy đủ.

## DATA-002 - Payment ledger bất biến

**Công việc**

- [ ] Không update/xóa trực tiếp payment đã được approve.
- [ ] Nếu xác nhận sai, tạo reversal record.
- [ ] Lưu quan hệ giữa payment gốc và reversal.
- [ ] Tính số tiền đã thanh toán từ ledger hợp lệ.
- [ ] Không cho tổng số tiền approve vượt quá giới hạn nghiệp vụ.
- [ ] Khóa row invoice/payment request khi approve proof.
- [ ] Bảo đảm submit/approve lặp lại không tạo payment trùng.
- [ ] Thêm idempotency key cho thao tác nhạy cảm nếu cần.
- [ ] Ghi audit log cho submit, reject, approve và reverse payment.
- [ ] Báo cáo phải phân biệt payment, reversal và net payment.

## DATA-003 - Audit log

**Công việc**

- [ ] Tạo bảng `audit_log`.
- [ ] Lưu actor user ID và role.
- [ ] Lưu action code ổn định.
- [ ] Lưu entity type và entity ID.
- [ ] Lưu timestamp theo UTC.
- [ ] Lưu request ID.
- [ ] Lưu IP/user-agent ở mức cần thiết và phù hợp chính sách riêng tư.
- [ ] Lưu before/after snapshot cho trường quan trọng.
- [ ] Redact password, token, secret và URL nhạy cảm.
- [ ] Ghi log cho contract create/update/activate/end/cancel.
- [ ] Ghi log cho utility submit/approve/reject.
- [ ] Ghi log cho invoice create/issue/update/void.
- [ ] Ghi log cho payment proof submit/approve/reject.
- [ ] Ghi log cho tenant identity document view/create/delete.
- [ ] Ghi log cho user activate/deactivate/password change.
- [ ] Audit log không được sửa/xóa qua API thông thường.
- [ ] Thêm màn hình tra cứu audit cho manager/admin phù hợp.

## DATA-004 - Transaction, concurrency và idempotency

**Công việc**

- [ ] Rà soát mọi luồng có từ hai thao tác ghi database trở lên.
- [ ] Bao transaction cho tạo hợp đồng và gán tenant.
- [ ] Bao transaction cho utility approval và invoice generation.
- [ ] Bao transaction cho issue invoice và payment request.
- [ ] Bao transaction cho approve payment và cập nhật invoice status.
- [ ] Dùng `SELECT ... FOR UPDATE` ở nơi có nguy cơ xử lý đồng thời.
- [ ] Thêm unique constraints cho nghiệp vụ chỉ được tạo một lần.
- [ ] Xử lý PostgreSQL unique violation thành thông báo có nghĩa.
- [ ] Bảo đảm retry request không nhân đôi invoice hoặc payment.
- [ ] Thêm integration test gửi request đồng thời.

## DATA-005 - Chính sách lưu giữ và quyền riêng tư

**Công việc**

- [ ] Xác định thời gian lưu CCCD, contract document và payment proof.
- [ ] Xác định dữ liệu phải giữ vì lý do kế toán/pháp lý.
- [ ] Thêm quy trình xóa hoặc ẩn danh dữ liệu tenant khi phù hợp.
- [ ] Không cascade-delete dữ liệu tài chính quan trọng.
- [ ] Tạo chức năng export dữ liệu tenant khi cần.
- [ ] Ghi nhận sự đồng ý/chính sách sử dụng dữ liệu cá nhân.
- [ ] Phân quyền trường dữ liệu nhạy cảm ở API và UI.
- [ ] Mask số CCCD trên danh sách; chỉ hiển thị đầy đủ khi thực sự cần.

---

# P1 - Automated Testing And CI

## TEST-001 - PostgreSQL integration tests

**Công việc**

- [ ] Thêm PostgreSQL service container vào CI.
- [ ] Tạo database riêng cho mỗi test run.
- [ ] Chạy toàn bộ migrations trước integration tests.
- [ ] Không mock SQL trong nhóm integration tests.
- [ ] Test foreign keys, check constraints và unique indexes.
- [ ] Test transaction rollback khi một bước thất bại.
- [ ] Test date/timezone với UTC và múi giờ ứng dụng.
- [ ] Test numeric/money precision.
- [ ] Test query filtering theo manager ownership.
- [ ] Test migration từ database rỗng.
- [ ] Test checksum phát hiện migration bị chỉnh sửa.
- [ ] Dọn database sau test.

## TEST-002 - Backend authorization tests

**Công việc**

- [ ] Test manager A không list dữ liệu manager B.
- [ ] Test manager A không xem chi tiết dữ liệu manager B.
- [ ] Test manager A không update/xóa dữ liệu manager B.
- [ ] Test tenant chỉ xem được phòng/hợp đồng/invoice của mình.
- [ ] Test tenant không gọi được manager API.
- [ ] Test manager không giả mạo tenant để submit proof.
- [ ] Test quyền xem/xóa từng loại upload.
- [ ] Test tài khoản inactive/pending không truy cập API.
- [ ] Test token hết hạn, sai chữ ký và token đã revoke.
- [ ] Test UUID hoặc query parameter không hợp lệ.

## TEST-003 - Playwright E2E

**Luồng rental registration**

- [ ] Manager chọn phòng khả dụng.
- [ ] Manager tạo hoặc chọn tenant hợp lệ.
- [ ] Manager tạo reservation/draft contract.
- [ ] Manager bổ sung nhiều giấy tờ.
- [ ] Manager xóa giấy tờ trước khi lưu.
- [ ] Manager handover và activate hợp đồng.
- [ ] Kiểm tra trạng thái phòng sau từng bước.

**Luồng utility**

- [ ] Tenant nhập chỉ số điện/nước và chọn ảnh.
- [ ] File chỉ upload khi lưu form.
- [ ] Tenant không submit lại khi reading đang chờ duyệt.
- [ ] Manager xem evidence và reject.
- [ ] Tenant cập nhật lại sau reject.
- [ ] Manager approve reading.
- [ ] Manager tạo invoice từ reading.

**Luồng invoice và payment**

- [ ] Manager tạo và issue invoice.
- [ ] QR hiển thị đúng ngân hàng, số tài khoản, số tiền và nội dung.
- [ ] Tenant xem invoice tháng hiện tại và tháng cũ.
- [ ] Tenant submit payment proof.
- [ ] Manager reject proof và tenant submit lại.
- [ ] Manager approve partial payment.
- [ ] Manager approve đủ tiền và invoice chuyển `PAID`.
- [ ] Invoice đã thanh toán không bị hard-delete.

**Luồng authentication**

- [ ] Login đúng/sai mật khẩu.
- [ ] Tenant chưa kích hoạt không login được.
- [ ] Refresh token rotation hoạt động.
- [ ] Logout làm refresh token mất hiệu lực.
- [ ] Đổi mật khẩu đăng xuất toàn bộ phiên.
- [ ] Forgot/reset password hoạt động.

## TEST-004 - Frontend test quality

- [ ] Loại bỏ warning `getComputedStyle` trong test hoặc cấu hình mock hợp lý.
- [ ] Sửa lint warning trong Dashboard.
- [ ] Giảm thời gian import/render test.
- [ ] Không tăng timeout chỉ để che test chậm.
- [ ] Test loading, empty, error và retry state.
- [ ] Test thông báo lỗi lấy từ API.
- [ ] Test double-click submit không gửi request trùng.
- [ ] Test upload failure và rollback UI.
- [ ] Test thay đổi ngôn ngữ trên các form chính.
- [ ] Đặt coverage threshold ban đầu hợp lý.
- [ ] Xuất coverage report trong CI.

## TEST-005 - CI quality gates

- [ ] Gộp typecheck, lint, unit test, integration test và build thành required checks.
- [ ] Không cho merge khi có lint warning nếu đã thống nhất zero-warning policy.
- [ ] Chạy migration test với PostgreSQL.
- [ ] Chạy E2E smoke trên build production.
- [ ] Cache dependency đúng cách.
- [ ] Upload test report khi job thất bại.
- [ ] Thêm dependency audit.
- [ ] Thêm secret scanning.
- [ ] Thêm CodeQL/static analysis.
- [ ] Thống nhất Node version bằng `engines`, `.nvmrc` hoặc Volta.
- [ ] Kiểm tra lockfile không bị thay đổi sau `npm ci`.

---

# P1 - Backend Architecture

## BE-001 - Tách route, service và repository

**Công việc**

- [ ] Route chỉ phụ trách HTTP parsing, auth, validation và response.
- [ ] Service phụ trách business rules và transaction orchestration.
- [ ] Repository phụ trách SQL và mapping database row.
- [ ] Tách SQL ra khỏi `contracts.routes.ts`.
- [ ] Tách SQL ra khỏi `tenants.routes.ts`.
- [ ] Tách SQL ra khỏi `rental-registration.routes.ts`.
- [ ] Chia nhỏ `fixed-charges.service.ts`.
- [ ] Chia nhỏ `invoices.service.ts`.
- [ ] Chia nhỏ `dashboard.service.ts`.
- [ ] Chia nhỏ `reports.service.ts`.
- [ ] Không tạo abstraction chung nếu chỉ được dùng một lần.
- [ ] Giữ transaction boundary ở service layer.

## BE-002 - Type safety tại database boundary

- [ ] Thay `Record<string, any>` bằng interface/type cụ thể.
- [ ] Thay `payload: any` bằng DTO cụ thể.
- [ ] Thay `client: any` bằng `PoolClient`.
- [ ] Khai báo kiểu result cho từng query.
- [ ] Mapping rõ `numeric`, `date` và `timestamptz`.
- [ ] Không để frontend phụ thuộc trực tiếp tên cột database nếu không cần.
- [ ] Thay `SELECT *` bằng danh sách cột rõ ràng.
- [ ] Thêm exhaustive checking cho status enums.
- [ ] Đồng bộ status giữa TypeScript và PostgreSQL.

## BE-003 - Validation và error contract

- [ ] Tạo schema Zod cho body của mọi mutation API.
- [ ] Tạo schema cho route params.
- [ ] Tạo schema cho query filters.
- [ ] Chuẩn hóa format lỗi: `code`, `message`, `fieldErrors`, `requestId`.
- [ ] Dùng error code ổn định thay vì frontend phụ thuộc hoàn toàn message.
- [ ] Map PostgreSQL constraint errors sang lỗi nghiệp vụ có nghĩa.
- [ ] Không trả SQL, stack trace hoặc thông tin nội bộ.
- [ ] Bảo đảm lỗi 401, 403, 404 và 409 được dùng nhất quán.
- [ ] Thêm test cho error contract.
- [ ] Viết tài liệu danh sách error codes.

## BE-004 - API pagination, filtering và sorting

- [ ] Chuẩn hóa `page`, `pageSize`, `sortBy`, `sortOrder`.
- [ ] Đặt giới hạn tối đa cho `pageSize`.
- [ ] Thêm pagination cho invoices.
- [ ] Thêm pagination cho payments.
- [ ] Thêm pagination cho reports detail.
- [ ] Thêm pagination cho utility readings nếu dữ liệu tăng lớn.
- [ ] Trả `total`, `page`, `pageSize`, `items`.
- [ ] Thêm database indexes cho filters phổ biến.
- [ ] Kiểm tra query plan cho bảng lớn.
- [ ] Debounce tìm kiếm phía frontend.

## BE-005 - OpenAPI và API versioning

- [ ] Viết OpenAPI cho auth, tenants, contracts, utilities, invoices và payments.
- [ ] Mô tả request/response schemas.
- [ ] Mô tả error codes.
- [ ] Mô tả yêu cầu role cho từng endpoint.
- [ ] Sinh API documentation trong development/staging.
- [ ] Không public Swagger production nếu không có kiểm soát truy cập.
- [ ] Xác định chiến lược versioning API trước khi có client bên ngoài.

---

# P1 - Database And Migration

## DB-001 - Một nguồn schema duy nhất

- [ ] Chọn thư mục `migrations` làm source of truth.
- [ ] Không hướng dẫn chạy `database.sql` trực tiếp cho database mới.
- [ ] Nếu cần `database.sql`, sinh tự động từ migrations.
- [ ] Không chỉnh sửa migration đã chạy.
- [ ] Viết migration mới cho mọi thay đổi schema.
- [ ] Cập nhật README dùng `npm run db:migrate`.
- [ ] Cập nhật tài liệu seed dùng `npm run db:seed`.
- [ ] Loại bỏ thông tin seed/demo đã lỗi thời.

## DB-002 - Constraint và index audit

- [ ] Kiểm tra unique active contract trên mỗi room.
- [ ] Kiểm tra một primary tenant trên mỗi contract.
- [ ] Kiểm tra một utility reading trên room/month.
- [ ] Kiểm tra một invoice hợp lệ trên contract/month theo nghiệp vụ.
- [ ] Kiểm tra payment amount luôn dương.
- [ ] Kiểm tra meter reading không giảm nếu không có reset meter.
- [ ] Kiểm tra contract dates hợp lệ.
- [ ] Kiểm tra invoice due date không trước issue date.
- [ ] Thêm index cho manager ownership joins.
- [ ] Thêm index cho month/status filters.
- [ ] Thêm index cho payment request/proof lookup.
- [ ] Loại bỏ index trùng hoặc không được sử dụng.

## DB-003 - Migration và rollback

- [ ] Viết checklist backup trước migration rủi ro.
- [ ] Phân loại migration backward-compatible và breaking.
- [ ] Dùng expand-migrate-contract cho thay đổi lớn.
- [ ] Không khóa bảng lâu trong giờ cao điểm.
- [ ] Kiểm thử migration với dữ liệu gần production.
- [ ] Document rollback bằng restore hoặc forward-fix.
- [ ] Tự động ghi version ứng dụng cùng migration.
- [ ] Có bước xác nhận migration thành công sau deploy.

---

# P1 - Operations And Deployment

## OPS-001 - Structured logging

- [ ] Dùng logger có cấu trúc như Pino.
- [ ] Sinh request ID hoặc nhận request ID từ gateway.
- [ ] Log method, route, status code và duration.
- [ ] Log user ID/role khi phù hợp.
- [ ] Không log password, token, CCCD đầy đủ hoặc signed URL.
- [ ] Dùng log level theo môi trường.
- [ ] Chuẩn hóa error serialization.
- [ ] Liên kết application log với audit log bằng request ID.

## OPS-002 - Error monitoring và metrics

- [ ] Tích hợp Sentry hoặc công cụ tương đương.
- [ ] Gắn release version vào error report.
- [ ] Gắn environment staging/production.
- [ ] Redact dữ liệu cá nhân trước khi gửi.
- [ ] Theo dõi request error rate.
- [ ] Theo dõi response latency.
- [ ] Theo dõi database pool usage.
- [ ] Theo dõi login failures.
- [ ] Theo dõi upload failures.
- [ ] Theo dõi invoice/payment failures.
- [ ] Thiết lập cảnh báo theo ngưỡng.

## OPS-003 - Health check và graceful shutdown

- [ ] Giữ `/health` cho liveness.
- [ ] Thêm `/ready` kiểm tra database và dependency bắt buộc.
- [ ] Readiness trả fail khi database không dùng được.
- [ ] Lưu HTTP server instance.
- [ ] Xử lý `SIGTERM` và `SIGINT`.
- [ ] Ngừng nhận request mới khi shutdown.
- [ ] Chờ request hiện tại hoàn thành trong timeout.
- [ ] Đóng PostgreSQL pool.
- [ ] Flush logger/error monitoring.
- [ ] Thoát process sau `uncaughtException`.
- [ ] Thoát hoặc restart an toàn sau `unhandledRejection` nghiêm trọng.

## OPS-004 - Container và environments

- [ ] Tạo Dockerfile multi-stage cho backend.
- [ ] Chạy bằng non-root user.
- [ ] Chỉ copy artifact cần thiết vào production image.
- [ ] Thêm `.dockerignore`.
- [ ] Pin Node major version.
- [ ] Tạo cấu hình development, test, staging và production rõ ràng.
- [ ] Validate environment variables khi startup.
- [ ] Phân biệt environment bắt buộc và tùy chọn.
- [ ] Sửa mâu thuẫn cấu hình SMTP giữa code và README.
- [ ] Có staging sử dụng cấu hình gần giống production.

## OPS-005 - Backup và disaster recovery

- [ ] Thiết lập backup PostgreSQL tự động.
- [ ] Xác định retention hằng ngày/hằng tuần/hằng tháng.
- [ ] Mã hóa backup.
- [ ] Lưu backup khác vùng hoặc khác tài khoản hạ tầng.
- [ ] Kiểm thử restore định kỳ.
- [ ] Ghi nhận RPO và RTO mục tiêu.
- [ ] Backup hoặc có chiến lược phục hồi Cloudinary assets.
- [ ] Viết runbook xử lý mất database.
- [ ] Viết runbook xử lý deploy lỗi.
- [ ] Viết runbook rotate secrets.

## OPS-006 - Background jobs

- [ ] Chọn cơ chế job phù hợp với quy mô triển khai.
- [ ] Cập nhật invoice quá hạn theo lịch hoặc tính trạng thái động nhất quán.
- [ ] Hết hạn payment request đúng thời điểm.
- [ ] Gửi reminder trước/sau hạn thanh toán.
- [ ] Dọn refresh sessions hết hạn.
- [ ] Dọn activation/reset tokens hết hạn.
- [ ] Retry email thất bại có giới hạn.
- [ ] Cleanup orphan Cloudinary assets.
- [ ] Job phải idempotent.
- [ ] Theo dõi trạng thái và lỗi của job.

---

# P2 - Frontend Architecture And UX

## FE-001 - Chia nhỏ page components

**Contracts**

- [ ] Tách contract filters.
- [ ] Tách contract table.
- [ ] Tách create/edit form.
- [ ] Tách status action toolbar.
- [ ] Tách document management.
- [ ] Tách data-fetching hook.

**Invoices**

- [ ] Tách invoice filters và list.
- [ ] Tách invoice detail.
- [ ] Tách invoice form.
- [ ] Tách invoice calculation.
- [ ] Tách issue/void/payment actions.
- [ ] Tách VietQR display.
- [ ] Tách data-fetching hook.

**Tenant room**

- [ ] Tách room/contract summary.
- [ ] Tách utility reading form.
- [ ] Tách current invoice.
- [ ] Tách invoice history.
- [ ] Tách payment proof form.
- [ ] Tách document/evidence preview.

**Fixed charges và rental registration**

- [ ] Tách catalog, assignment và monthly extras.
- [ ] Tách từng bước rental registration thành component độc lập.
- [ ] Đưa validation và payload mapping ra khỏi page component.

## FE-002 - Chuẩn hóa routing

- [ ] Cài và cấu hình React Router.
- [ ] Khai báo route tree tập trung.
- [ ] Tạo protected route.
- [ ] Tạo role-based route guard.
- [ ] Hỗ trợ route params bằng router.
- [ ] Hỗ trợ query params cho filters.
- [ ] Thêm trang `403`.
- [ ] Thêm trang `404`.
- [ ] Giữ đúng browser back/forward.
- [ ] Giữ filter khi mở chi tiết và quay lại.
- [ ] Cập nhật route tests.

## FE-003 - Chuẩn hóa server state

- [ ] Dùng TanStack Query hoặc giải pháp tương đương.
- [ ] Tạo query keys thống nhất.
- [ ] Cache danh sách building, room và tenant hợp lý.
- [ ] Invalidate dữ liệu sau mutation.
- [ ] Tránh refetch trùng.
- [ ] Xử lý retry theo loại lỗi.
- [ ] Không retry lỗi validation hoặc authorization.
- [ ] Hủy request khi component unmount hoặc filter đổi.
- [ ] Xử lý refresh token đồng thời ở một nơi.
- [ ] Dùng optimistic update chỉ cho thao tác có rollback rõ ràng.

## FE-004 - Chuẩn hóa i18n

- [ ] Chuyển sang `i18next`, `react-i18next` hoặc `react-intl`.
- [ ] Không dịch bằng cách clone toàn bộ React tree.
- [ ] Dùng translation keys ổn định.
- [ ] Chia locale theo namespace/feature.
- [ ] Lazy-load locale được chọn.
- [ ] Kiểm tra thiếu key trong CI.
- [ ] Hỗ trợ interpolation và pluralization chuẩn.
- [ ] Đồng bộ Ant Design locale.
- [ ] Đồng bộ ngày, số tiền và đơn vị theo locale.
- [ ] Loại bỏ aliases/string matching không cần thiết.
- [ ] Giảm chunk `Localized` khoảng 698 KB.

## FE-005 - Error, loading và submit behavior

- [ ] Mọi mutation phải có trạng thái loading.
- [ ] Disable submit trong lúc request đang chạy.
- [ ] Chống double-click tạo request trùng.
- [ ] Hiển thị validation error tại field liên quan.
- [ ] Hiển thị business error bằng ngôn ngữ đang chọn.
- [ ] Hiển thị fallback message khi API không trả error code.
- [ ] Không hiển thị raw SQL/backend stack.
- [ ] Cho phép retry ở lỗi mạng tạm thời.
- [ ] Giữ dữ liệu form sau khi submit thất bại.
- [ ] Chỉ đóng modal/drawer khi thao tác thành công.
- [ ] Chuẩn hóa success notification.
- [ ] Chuẩn hóa empty state và skeleton/loading state.

## FE-006 - Accessibility

- [ ] Kiểm tra toàn bộ thao tác bằng bàn phím.
- [ ] Bảo đảm focus chuyển đúng khi mở modal/drawer.
- [ ] Trả focus về nút mở sau khi đóng.
- [ ] Thêm accessible name cho icon buttons.
- [ ] Kiểm tra label của form fields.
- [ ] Không chỉ dùng màu sắc để thể hiện trạng thái.
- [ ] Kiểm tra color contrast.
- [ ] Thêm `aria-live` cho thông báo quan trọng.
- [ ] Kiểm tra bảng trên screen reader.
- [ ] Kiểm tra zoom 200%.
- [ ] Tôn trọng reduced motion.

## FE-007 - Responsive và hiệu năng

- [ ] Kiểm tra desktop, tablet và mobile cho mọi page.
- [ ] Không để action buttons tràn hoặc chồng nhau.
- [ ] Dùng responsive table/list phù hợp.
- [ ] Tối ưu ảnh login theo viewport.
- [ ] Dùng WebP/AVIF nếu phù hợp.
- [ ] Lazy-load ảnh và preview.
- [ ] Tách bundle i18n và Ant Design components hợp lý.
- [ ] Đặt bundle budget trong CI.
- [ ] Phân tích bundle sau mỗi thay đổi lớn.
- [ ] Virtualize danh sách khi dữ liệu rất lớn.

## FE-008 - Dọn code cũ

- [ ] Xác nhận route không còn dùng `front-end/src/features/buildings`.
- [ ] Xóa prototype buildings cũ.
- [ ] Xóa service, type và CSS không còn tham chiếu.
- [ ] Xóa route/page payment gateway không còn sử dụng.
- [ ] Xóa cấu hình VNPay/MoMo nếu sản phẩm không còn hỗ trợ.
- [ ] Xóa translations và tests cho chức năng đã loại bỏ.
- [ ] Không để TODO đánh dấu hoàn thành sai với source hiện tại.

---

# P2 - Product Completion

## PRODUCT-001 - Làm rõ phạm vi ba màn hình billing

- [ ] `Monthly Billing`: chỉ phục vụ chuẩn bị và tạo hóa đơn hàng loạt theo tháng.
- [ ] `Invoices`: quản lý vòng đời hóa đơn, issue, void, detail và adjustments.
- [ ] `Payments`: quản lý yêu cầu thanh toán, proofs, approve/reject và reconciliation.
- [ ] Không lặp lại cùng một action ở nhiều màn hình nếu không cần thiết.
- [ ] Điều hướng xuyên suốt từ reading sang invoice rồi payment.
- [ ] Hiển thị trạng thái và next action rõ ràng.
- [ ] Thống nhất thuật ngữ giữa frontend, backend và tài liệu.

## PRODUCT-002 - Notification

- [ ] Thông báo tenant khi tài khoản được tạo.
- [ ] Thông báo khi utility reading bị reject.
- [ ] Thông báo khi invoice được issue.
- [ ] Thông báo trước ngày đến hạn.
- [ ] Thông báo khi payment proof bị reject.
- [ ] Thông báo khi payment được approve.
- [ ] Cho phép cấu hình email notification.
- [ ] Không gửi trùng notification khi job retry.
- [ ] Lưu trạng thái gửi để hỗ trợ kiểm tra lỗi.

## PRODUCT-003 - Báo cáo và đối soát

- [ ] Định nghĩa rõ công thức doanh thu.
- [ ] Phân biệt invoiced revenue và collected cash.
- [ ] Phân biệt outstanding, overdue và void.
- [ ] Hỗ trợ lọc theo tháng, building, room và tenant.
- [ ] Hiển thị payment reversal đúng cách.
- [ ] Thêm báo cáo payment reconciliation.
- [ ] Thêm export CSV an toàn.
- [ ] Cân nhắc XLSX nếu có yêu cầu nghiệp vụ thực tế.
- [ ] Gắn timezone và currency rõ ràng.

## PRODUCT-004 - Tenant lifecycle

- [ ] Phân biệt tenant profile và user account.
- [ ] Hiển thị trạng thái invitation/activation.
- [ ] Cho phép manager resend invitation.
- [ ] Cho phép deactivate account mà không xóa tenant history.
- [ ] Không xóa tenant đang có hợp đồng hoặc dữ liệu tài chính.
- [ ] Có quy trình kết thúc thuê và lưu lịch sử.
- [ ] Có chính sách tenant quay lại thuê trong tương lai.

---

# P2 - Documentation

## DOC-001 - README

- [ ] Cập nhật prerequisites và Node version chính thức.
- [ ] Hướng dẫn chạy migrations thay cho `database.sql`.
- [ ] Hướng dẫn chạy seed đúng với source hiện tại.
- [ ] Mô tả tài khoản demo và chỉ bật trong development.
- [ ] Liệt kê environment variables bắt buộc/tùy chọn.
- [ ] Sửa mô tả SMTP để khớp validation.
- [ ] Hướng dẫn chạy frontend/backend/tests.
- [ ] Hướng dẫn build production.
- [ ] Hướng dẫn deploy và health check.

## DOC-002 - Kiến trúc và nghiệp vụ

- [ ] Tạo sơ đồ frontend/backend/database/external services.
- [ ] Mô tả authentication/session lifecycle.
- [ ] Mô tả rental registration state machine.
- [ ] Mô tả contract state machine.
- [ ] Mô tả utility reading state machine.
- [ ] Mô tả invoice/payment state machine.
- [ ] Mô tả manager ownership và tenant authorization.
- [ ] Mô tả file upload lifecycle.
- [ ] Ghi lại architectural decisions quan trọng.

## DOC-003 - Runbooks

- [ ] Runbook deploy phiên bản mới.
- [ ] Runbook chạy migration.
- [ ] Runbook rollback/forward-fix.
- [ ] Runbook restore database.
- [ ] Runbook Cloudinary lỗi.
- [ ] Runbook email lỗi.
- [ ] Runbook payment reconciliation.
- [ ] Runbook khóa tài khoản bị xâm nhập.
- [ ] Runbook rotate JWT/Cloudinary/SMTP/database secrets.

---

# P3 - Cải tiến sau production

- [ ] Thêm trang quản lý session và thiết bị đăng nhập.
- [ ] Thêm 2FA cho manager.
- [ ] Thêm web push hoặc in-app notification.
- [ ] Thêm bulk actions có kiểm soát cho invoice/payment.
- [ ] Thêm import tenant/building/room từ file.
- [ ] Thêm template hóa đơn và branding theo manager.
- [ ] Thêm dashboard vận hành theo thời gian thực.
- [ ] Thêm feature flags cho chức năng mới.
- [ ] Thêm performance/load testing.
- [ ] Thêm accessibility automation trong CI.
- [ ] Thêm localization cho email và tài liệu xuất.

---

# 4. Kế hoạch triển khai đề xuất

## Sprint 1 - Security Foundation

- [ ] AUTH-001: Chặn passwordless login.
- [x] AUTH-002: Invitation và activation.
- [ ] AUTH-004: Refresh token rotation và cookie.
- [ ] AUTH-005: Password policy/session revoke.
- [ ] SEC-001: CORS.
- [ ] SEC-002: Rate limit.
- [ ] SEC-003: Security headers.
- [ ] SEC-006: Secrets và database TLS.

**Đầu ra bắt buộc**

- [ ] Authentication integration tests pass.
- [ ] Không còn token dài hạn trong `localStorage`.
- [ ] Security checklist được review.

## Sprint 2 - Privacy And Financial Integrity

- [ ] SEC-004: Private Cloudinary assets.
- [ ] SEC-005: CSV injection.
- [ ] DATA-001: Void invoice.
- [ ] DATA-002: Immutable payment ledger.
- [ ] DATA-003: Audit log.
- [ ] DATA-004: Transaction/concurrency.
- [ ] DATA-005: Data retention.

**Đầu ra bắt buộc**

- [ ] Không thể truy cập CCCD/payment proof bằng public URL.
- [ ] Không thể hard-delete financial history.
- [ ] Critical actions có audit log.

## Sprint 3 - Testing And Operations

- [ ] TEST-001: PostgreSQL integration tests.
- [ ] TEST-002: Authorization tests.
- [ ] TEST-003: Playwright E2E.
- [ ] TEST-004: Frontend test quality.
- [ ] TEST-005: CI gates.
- [ ] OPS-001: Structured logging.
- [ ] OPS-002: Error monitoring.
- [ ] OPS-003: Health/graceful shutdown.
- [ ] OPS-004: Container/environments.
- [ ] OPS-005: Backup/restore.

**Đầu ra bắt buộc**

- [ ] CI kiểm tra migration với PostgreSQL thật.
- [ ] Critical E2E flows pass.
- [ ] Restore backup được diễn tập thành công.
- [ ] Có cảnh báo khi backend/database lỗi.

## Sprint 4 - Architecture And UX

- [ ] BE-001 đến BE-005.
- [ ] DB-001 đến DB-003.
- [ ] FE-001 đến FE-008.
- [ ] PRODUCT-001 đến PRODUCT-004.
- [ ] DOC-001 đến DOC-003.

**Đầu ra bắt buộc**

- [ ] Không còn page/service khổng lồ chưa có lý do rõ ràng.
- [ ] Bundle không còn chunk vượt budget đã thống nhất.
- [ ] Các màn hình có loading/error/empty state nhất quán.
- [ ] Tài liệu khớp với source và quy trình deploy thực tế.

---

# 5. Definition Of Done

Một task chỉ được đánh dấu hoàn thành khi:

- [ ] Business rule và acceptance criteria đã được xác nhận.
- [ ] Code đã được review.
- [ ] Không làm mất hoặc thay đổi dữ liệu ngoài dự kiến.
- [ ] Unit test phù hợp đã được thêm/cập nhật.
- [ ] Integration hoặc E2E test được thêm nếu task thay đổi luồng nghiệp vụ.
- [ ] Typecheck, lint, test và build đều pass.
- [ ] Không còn warning mới chưa được giải thích.
- [ ] Migration đã được thử trên database mới và database có dữ liệu.
- [ ] Error message có nghĩa và hỗ trợ cả hai ngôn ngữ.
- [ ] Loading, success, failure và retry state đã được kiểm tra.
- [ ] Authorization đã được kiểm tra với manager A, manager B và tenant.
- [ ] Dữ liệu nhạy cảm không xuất hiện trong log hoặc response không cần thiết.
- [ ] Documentation và environment example đã được cập nhật.
- [ ] Có kế hoạch rollback hoặc forward-fix.
- [ ] Đã kiểm tra trên desktop và mobile nếu thay đổi frontend.

---

# 6. Mục tiêu điểm số sau khi hoàn thành

| Hạng mục | Hiện tại | Mục tiêu |
|---|---:|---:|
| Độ đầy đủ nghiệp vụ | 8.0/10 | 9.0/10 |
| Frontend và UX | 7.2/10 | 8.5/10 |
| Backend và database | 7.0/10 | 8.8/10 |
| Kiến trúc và maintainability | 6.2/10 | 8.5/10 |
| Test và CI | 6.8/10 | 9.0/10 |
| Bảo mật và riêng tư | 4.5/10 | 9.0/10 |
| Vận hành production | 4.8/10 | 8.5/10 |
| Tổng thể | 6.6/10 | 8.8/10 |
