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

- [x] Không còn tài khoản có thể đăng nhập mà không cần mật khẩu hoặc phương thức xác thực hợp lệ.
- [x] Refresh token có rotation, revoke và không còn lưu trong `localStorage`.
- [x] Login và các API nhạy cảm đã có rate limit.
- [x] CORS và security headers được cấu hình đúng theo môi trường.
- [x] CCCD và bằng chứng thanh toán không thể truy cập bằng URL công khai vĩnh viễn.
- [x] Invoice và payment đã phát hành không thể bị hard-delete.
- [x] Mọi thao tác tài chính quan trọng đều có audit log.
- [x] Migration được kiểm thử tự động trên PostgreSQL thật.
- [x] Các luồng nghiệp vụ chính có E2E test.
- [x] Có backup tự động và đã kiểm thử khôi phục dữ liệu.
- [x] Có logging, error tracking, health check và cảnh báo vận hành.
- [x] Không còn lỗ hổng mức critical/high từ dependency scan.

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

- [x] Thêm API yêu cầu reset password.
- [x] Thêm API xác nhận reset password.
- [x] Sinh reset token ngẫu nhiên và chỉ lưu hash.
- [x] Đặt thời hạn reset token, đề xuất 15-30 phút.
- [x] Phản hồi giống nhau dù email có tồn tại hay không.
- [x] Thêm giới hạn tần suất gửi reset password.
- [x] Tạo trang nhập mật khẩu mới và xác nhận mật khẩu.
- [x] Vô hiệu hóa toàn bộ reset token cũ sau khi reset thành công.
- [x] Thu hồi toàn bộ phiên đăng nhập sau khi reset.
- [x] Gửi email thông báo mật khẩu đã được thay đổi.
- [x] Ghi audit log cho yêu cầu và hoàn thành reset password.

**Tiêu chí nghiệm thu**

- [x] Không thể dò tìm email đăng ký qua API.
- [x] Reset token hết hạn hoặc đã dùng không thể tái sử dụng.
- [x] Tất cả refresh token cũ bị vô hiệu hóa sau khi reset.

## AUTH-004 - Thiết kế lại access token và refresh token

**Công việc**

- [x] Giảm access token TTL xuống khoảng 10-15 phút.
- [x] Chuyển refresh token sang cookie `HttpOnly`.
- [x] Bật `Secure` trong staging và production.
- [x] Cấu hình `SameSite` phù hợp với kiến trúc deploy.
- [x] Không lưu refresh token trong `localStorage`.
- [x] Cân nhắc không lưu access token lâu dài; ưu tiên giữ trong memory.
- [x] Tạo bảng session hoặc refresh token trong database.
- [x] Chỉ lưu hash của refresh token.
- [x] Lưu `user_id`, `expires_at`, `revoked_at`, `created_at` và thông tin thiết bị cần thiết.
- [x] Rotation refresh token sau mỗi lần refresh.
- [x] Phát hiện refresh token reuse và thu hồi cả token family.
- [x] Thu hồi session khi logout.
- [x] Thu hồi mọi session khi đổi/reset mật khẩu.
- [x] Cho phép vô hiệu hóa tất cả thiết bị.
- [x] Dọn dẹp session hết hạn định kỳ.

**Tiêu chí nghiệm thu**

- [x] Refresh token không xuất hiện trong local storage hoặc JavaScript runtime.
- [x] Token đã logout không refresh được.
- [x] Refresh token cũ không dùng lại được sau rotation.
- [x] Access token hết hạn được refresh đúng một lần khi có nhiều request đồng thời.

## AUTH-005 - Tăng cường chính sách mật khẩu

**Công việc**

- [x] Thống nhất độ dài tối thiểu và tối đa ở frontend/backend.
- [x] Cho phép passphrase dài, tránh giới hạn quá ngắn.
- [x] Kiểm tra mật khẩu mới khác mật khẩu hiện tại.
- [x] Không log password hoặc request body chứa password.
- [x] Cân nhắc kiểm tra mật khẩu phổ biến/bị lộ.
- [x] Hiển thị lỗi rõ ràng nhưng không tiết lộ dữ liệu nhạy cảm.
- [x] Đăng xuất người dùng khỏi tất cả phiên sau khi đổi mật khẩu.

## SEC-001 - Chuẩn hóa CORS

**Công việc**

- [x] Xóa middleware CORS viết tay hoặc middleware `cors` bị trùng.
- [x] Chỉ giữ một nguồn cấu hình CORS.
- [x] Parse danh sách allowed origins từ environment.
- [x] Không sử dụng wildcard khi gửi credential.
- [x] Chỉ cho phép các HTTP methods cần thiết.
- [x] Chỉ cho phép các headers cần thiết.
- [x] Trả `Vary: Origin` khi origin được xác định động.
- [x] Cấu hình riêng cho development, staging và production.
- [x] Thêm test cho allowed origin và denied origin.
- [x] Kiểm tra preflight request.

## SEC-002 - Rate limit và chống brute force

**Công việc**

- [x] Thêm global rate limit ở mức hợp lý.
- [x] Thêm giới hạn nghiêm ngặt cho `/api/auth/login`.
- [x] Thêm giới hạn cho `/api/auth/refresh`.
- [x] Thêm giới hạn cho forgot/reset password.
- [x] Thêm giới hạn cho API tạo upload signature.
- [x] Thêm giới hạn cho submit payment proof.
- [x] Theo dõi số lần login sai theo IP và định danh tài khoản.
- [x] Thêm delay tăng dần hoặc khóa tạm thời sau nhiều lần thất bại.
- [x] Không khóa tài khoản vĩnh viễn chỉ dựa trên IP.
- [x] Ghi log sự kiện nghi ngờ brute force.
- [x] Bảo đảm rate limit hoạt động đúng sau reverse proxy.
- [x] Cấu hình `trust proxy` theo môi trường deploy.

## SEC-003 - Security headers và request hardening

**Công việc**

- [x] Thêm `helmet`.
- [x] Cấu hình Content Security Policy phù hợp với Ant Design, Cloudinary và VietQR.
- [x] Bật `X-Content-Type-Options`.
- [x] Bật chính sách chống clickjacking.
- [x] Cấu hình Referrer Policy.
- [x] Cấu hình HSTS ở production.
- [x] Giới hạn kích thước JSON body toàn cục.
- [x] Đặt giới hạn riêng cho từng loại upload.
- [x] Không tin tưởng MIME type do frontend cung cấp nếu backend nhận file trực tiếp.
- [x] Chuẩn hóa validation UUID, query, params và body.
- [x] Không trả stack trace hoặc SQL error ra production.

## SEC-004 - Bảo vệ file CCCD và bằng chứng

**Công việc**

- [x] Chuyển tenant documents sang Cloudinary private/authenticated delivery.
- [x] Chuyển payment proofs sang private/authenticated delivery.
- [x] Chuyển utility evidence sang private/authenticated delivery.
- [x] Chuyển contract documents sang private/authenticated delivery.
- [x] Không lưu public URL vĩnh viễn làm quyền truy cập duy nhất.
- [x] Lưu `public_id`, `resource_type`, version và metadata cần thiết.
- [x] Backend tạo signed URL có thời hạn khi người dùng có quyền xem.
- [x] Tenant chỉ xem được tài liệu thuộc chính tenant đó.
- [x] Manager chỉ xem được tài liệu thuộc phạm vi quản lý.
- [x] Kiểm tra quyền lại tại thời điểm tạo signed URL.
- [x] Ghi audit log khi xem/tải/xóa CCCD.
- [x] Cấu hình thời gian lưu giữ cho từng loại tài liệu.
- [x] Xóa file trên Cloudinary sau khi transaction database thành công.
- [x] Có cơ chế retry/cleanup nếu database và Cloudinary không đồng bộ.
- [x] Thêm job phát hiện orphan assets và orphan database records.
- [x] Không đưa URL nhạy cảm vào log, analytics hoặc error tracking.

**Tiêu chí nghiệm thu**

- [x] Mở URL cũ khi chưa xác thực không xem được file.
- [x] Signed URL hết hạn không còn sử dụng được.
- [x] Manager A không lấy được URL tài liệu của manager B.
- [x] Xóa tài liệu được ghi nhận trong audit log.

## SEC-005 - Ngăn CSV formula injection

**Công việc**

- [x] Sanitize giá trị bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc carriage return.
- [x] Áp dụng sanitizer cho mọi ô dữ liệu xuất CSV.
- [x] Giữ đúng encoding UTF-8.
- [x] Cân nhắc thêm BOM để Excel đọc tiếng Việt chính xác.
- [x] Đặt `Content-Type` và `Content-Disposition` an toàn.
- [x] Sanitize tên file tải xuống.
- [x] Thêm test với payload công thức độc hại.

## SEC-006 - Secrets, database TLS và dependency security

**Công việc**

- [x] Không commit file `.env`.
- [x] Quét lịch sử Git để phát hiện secret từng bị commit.
- [x] Rotate secret nếu có khả năng đã bị lộ.
- [x] Dùng secret manager của nền tảng deploy.
- [x] Bắt buộc JWT access secret và refresh secret khác nhau.
- [x] Kiểm tra độ dài tối thiểu của JWT secrets.
- [x] Bật xác thực TLS certificate cho PostgreSQL production.
- [x] Không dùng `DB_SSL_REJECT_UNAUTHORIZED=false` làm mặc định production.
- [x] Bổ sung dependency audit trong CI.
- [x] Bật Dependabot hoặc công cụ tương đương.
- [x] Bật secret scanning.
- [x] Bật CodeQL hoặc static security analysis.
- [x] Xử lý cảnh báo dependency sử dụng `url.parse()`.

---

# P0 - Financial And Data Integrity

## DATA-001 - Không hard-delete invoice đã phát hành

**Công việc**

- [x] Phân loại rõ trạng thái invoice: `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`.
- [x] Chỉ cho phép hard-delete invoice `DRAFT` chưa liên kết payment.
- [x] Invoice `ISSUED`, `PARTIALLY_PAID` hoặc `PAID` chỉ được void.
- [x] Bắt buộc nhập lý do void.
- [x] Lưu người void và thời điểm void.
- [x] Không xóa payment, payment request hoặc proof khi void invoice.
- [x] Nếu cần điều chỉnh, tạo adjustment hoặc replacement invoice.
- [x] Quy định rõ utility reading có được tái sử dụng sau khi void hay không.
- [x] Không tự động trả utility reading về `APPROVED` nếu đã có lịch sử tài chính cần giữ.
- [x] Cập nhật dashboard/reports để loại trừ hoặc thể hiện invoice void đúng cách.
- [x] Cập nhật UI: dùng `Delete` cho draft và `Void` cho invoice đã phát hành.
- [x] Thêm cảnh báo rõ ảnh hưởng của thao tác.

**Tiêu chí nghiệm thu**

- [x] Không thể xóa vật lý invoice đã thanh toán.
- [x] Invoice void vẫn xem được cùng lịch sử payment.
- [x] Báo cáo doanh thu và công nợ xử lý invoice void chính xác.
- [x] Thao tác void có audit log đầy đủ.

## DATA-002 - Payment ledger bất biến

**Công việc**

- [x] Không update/xóa trực tiếp payment đã được approve.
- [x] Nếu xác nhận sai, tạo reversal record.
- [x] Lưu quan hệ giữa payment gốc và reversal.
- [x] Tính số tiền đã thanh toán từ ledger hợp lệ.
- [x] Không cho tổng số tiền approve vượt quá giới hạn nghiệp vụ.
- [x] Khóa row invoice/payment request khi approve proof.
- [x] Bảo đảm submit/approve lặp lại không tạo payment trùng.
- [x] Thêm idempotency key cho thao tác nhạy cảm nếu cần.
- [x] Ghi audit log cho submit, reject, approve và reverse payment.
- [x] Báo cáo phải phân biệt payment, reversal và net payment.

## DATA-003 - Audit log

**Công việc**

- [x] Tạo bảng `audit_log`.
- [x] Lưu actor user ID và role.
- [x] Lưu action code ổn định.
- [x] Lưu entity type và entity ID.
- [x] Lưu timestamp theo UTC.
- [x] Lưu request ID.
- [x] Lưu IP/user-agent ở mức cần thiết và phù hợp chính sách riêng tư.
- [x] Lưu before/after snapshot cho trường quan trọng.
- [x] Redact password, token, secret và URL nhạy cảm.
- [x] Ghi log cho contract create/update/activate/end/cancel.
- [x] Ghi log cho utility submit/approve/reject.
- [x] Ghi log cho invoice create/issue/update/void.
- [x] Ghi log cho payment proof submit/approve/reject.
- [x] Ghi log cho tenant identity document view/create/delete.
- [x] Ghi log cho user activate/deactivate/password change.
- [x] Audit log không được sửa/xóa qua API thông thường.
- [x] Thêm màn hình tra cứu audit cho manager/admin phù hợp.

## DATA-004 - Transaction, concurrency và idempotency

**Công việc**

- [x] Rà soát mọi luồng có từ hai thao tác ghi database trở lên.
- [x] Bao transaction cho tạo hợp đồng và gán tenant.
- [x] Bao transaction cho utility approval và invoice generation.
- [x] Bao transaction cho issue invoice và payment request.
- [x] Bao transaction cho approve payment và cập nhật invoice status.
- [x] Dùng `SELECT ... FOR UPDATE` ở nơi có nguy cơ xử lý đồng thời.
- [x] Thêm unique constraints cho nghiệp vụ chỉ được tạo một lần.
- [x] Xử lý PostgreSQL unique violation thành thông báo có nghĩa.
- [x] Bảo đảm retry request không nhân đôi invoice hoặc payment.
- [x] Thêm integration test gửi request đồng thời.

## DATA-005 - Chính sách lưu giữ và quyền riêng tư

**Công việc**

- [x] Xác định thời gian lưu CCCD, contract document và payment proof.
- [x] Xác định dữ liệu phải giữ vì lý do kế toán/pháp lý.
- [x] Thêm quy trình xóa hoặc ẩn danh dữ liệu tenant khi phù hợp.
- [x] Không cascade-delete dữ liệu tài chính quan trọng.
- [x] Tạo chức năng export dữ liệu tenant khi cần.
- [x] Ghi nhận sự đồng ý/chính sách sử dụng dữ liệu cá nhân.
- [x] Phân quyền trường dữ liệu nhạy cảm ở API và UI.
- [x] Mask số CCCD trên danh sách; chỉ hiển thị đầy đủ khi thực sự cần.

---

# P1 - Automated Testing And CI

## TEST-001 - PostgreSQL integration tests

**Công việc**

- [x] Thêm PostgreSQL service container vào CI.
- [x] Tạo database riêng cho mỗi test run.
- [x] Chạy toàn bộ migrations trước integration tests.
- [x] Không mock SQL trong nhóm integration tests.
- [x] Test foreign keys, check constraints và unique indexes.
- [x] Test transaction rollback khi một bước thất bại.
- [x] Test date/timezone với UTC và múi giờ ứng dụng.
- [x] Test numeric/money precision.
- [x] Test query filtering theo manager ownership.
- [x] Test migration từ database rỗng.
- [x] Test checksum phát hiện migration bị chỉnh sửa.
- [x] Dọn database sau test.

## TEST-002 - Backend authorization tests

**Công việc**

- [x] Test manager A không list dữ liệu manager B.
- [x] Test manager A không xem chi tiết dữ liệu manager B.
- [x] Test manager A không update/xóa dữ liệu manager B.
- [x] Test tenant chỉ xem được phòng/hợp đồng/invoice của mình.
- [x] Test tenant không gọi được manager API.
- [x] Test manager không giả mạo tenant để submit proof.
- [x] Test quyền xem/xóa từng loại upload.
- [x] Test tài khoản inactive/pending không truy cập API.
- [x] Test token hết hạn, sai chữ ký và token đã revoke.
- [x] Test UUID hoặc query parameter không hợp lệ.

## TEST-003 - Playwright E2E

**Luồng rental registration**

- [x] Manager chọn phòng khả dụng.
- [x] Manager tạo hoặc chọn tenant hợp lệ.
- [x] Manager tạo reservation/draft contract.
- [x] Manager bổ sung nhiều giấy tờ.
- [x] Manager xóa giấy tờ trước khi lưu.
- [x] Manager handover và activate hợp đồng.
- [x] Kiểm tra trạng thái phòng sau từng bước.

**Luồng utility**

- [x] Tenant nhập chỉ số điện/nước và chọn ảnh.
- [x] File chỉ upload khi lưu form.
- [x] Tenant không submit lại khi reading đang chờ duyệt.
- [x] Manager xem evidence và reject.
- [x] Tenant cập nhật lại sau reject.
- [x] Manager approve reading.
- [x] Manager tạo invoice từ reading.

**Luồng invoice và payment**

- [x] Manager tạo và issue invoice.
- [x] QR hiển thị đúng ngân hàng, số tài khoản, số tiền và nội dung.
- [x] Tenant xem invoice tháng hiện tại và tháng cũ.
- [x] Tenant submit payment proof.
- [x] Manager reject proof và tenant submit lại.
- [x] Manager approve partial payment.
- [x] Manager approve đủ tiền và invoice chuyển `PAID`.
- [x] Invoice đã thanh toán không bị hard-delete.

**Luồng authentication**

- [x] Login đúng/sai mật khẩu.
- [x] Tenant chưa kích hoạt không login được.
- [x] Refresh token rotation hoạt động.
- [x] Logout làm refresh token mất hiệu lực.
- [x] Đổi mật khẩu đăng xuất toàn bộ phiên.
- [x] Forgot/reset password hoạt động.

## TEST-004 - Frontend test quality

- [x] Loại bỏ warning `getComputedStyle` trong test hoặc cấu hình mock hợp lý.
- [x] Sửa lint warning trong Dashboard.
- [x] Giảm thời gian import/render test.
- [x] Không tăng timeout chỉ để che test chậm.
- [x] Test loading, empty, error và retry state.
- [x] Test thông báo lỗi lấy từ API.
- [x] Test double-click submit không gửi request trùng.
- [x] Test upload failure và rollback UI.
- [x] Test thay đổi ngôn ngữ trên các form chính.
- [x] Đặt coverage threshold ban đầu hợp lý.
- [x] Xuất coverage report trong CI.

## TEST-005 - CI quality gates

- [x] Gộp typecheck, lint, unit test, integration test và build thành required checks.
- [x] Không cho merge khi có lint warning nếu đã thống nhất zero-warning policy.
- [x] Chạy migration test với PostgreSQL.
- [x] Chạy E2E smoke trên build production.
- [x] Cache dependency đúng cách.
- [x] Upload test report khi job thất bại.
- [x] Thêm dependency audit.
- [x] Thêm secret scanning.
- [x] Thêm CodeQL/static analysis.
- [x] Thống nhất Node version bằng `engines`, `.nvmrc` hoặc Volta.
- [x] Kiểm tra lockfile không bị thay đổi sau `npm ci`.

---

# P1 - Backend Architecture

## BE-001 - Tách route, service và repository

**Công việc**

- [x] Route chỉ phụ trách HTTP parsing, auth, validation và response.
- [x] Service phụ trách business rules và transaction orchestration.
- [x] Repository phụ trách SQL và mapping database row.
- [x] Tách SQL ra khỏi `contracts.routes.ts`.
- [x] Tách SQL ra khỏi `tenants.routes.ts`.
- [x] Tách SQL ra khỏi `rental-registration.routes.ts`.
- [x] Chia nhỏ `fixed-charges.service.ts`.
- [x] Chia nhỏ `invoices.service.ts`.
- [x] Chia nhỏ `dashboard.service.ts`.
- [x] Chia nhỏ `reports.service.ts`.
- [x] Không tạo abstraction chung nếu chỉ được dùng một lần.
- [x] Giữ transaction boundary ở service layer.

## BE-002 - Type safety tại database boundary

- [x] Thay `Record<string, any>` bằng interface/type cụ thể.
- [x] Thay `payload: any` bằng DTO cụ thể.
- [x] Thay `client: any` bằng `PoolClient`.
- [x] Khai báo kiểu result cho từng query.
- [x] Mapping rõ `numeric`, `date` và `timestamptz`.
- [x] Không để frontend phụ thuộc trực tiếp tên cột database nếu không cần.
- [x] Thay `SELECT *` bằng danh sách cột rõ ràng.
- [x] Thêm exhaustive checking cho status enums.
- [x] Đồng bộ status giữa TypeScript và PostgreSQL.

## BE-003 - Validation và error contract

- [x] Tạo schema Zod cho body của mọi mutation API.
- [x] Tạo schema cho route params.
- [x] Tạo schema cho query filters.
- [x] Chuẩn hóa format lỗi: `code`, `message`, `fieldErrors`, `requestId`.
- [x] Dùng error code ổn định thay vì frontend phụ thuộc hoàn toàn message.
- [x] Map PostgreSQL constraint errors sang lỗi nghiệp vụ có nghĩa.
- [x] Không trả SQL, stack trace hoặc thông tin nội bộ.
- [x] Bảo đảm lỗi 401, 403, 404 và 409 được dùng nhất quán.
- [x] Thêm test cho error contract.
- [x] Viết tài liệu danh sách error codes.

## BE-004 - API pagination, filtering và sorting

- [x] Chuẩn hóa `page`, `pageSize`, `sortBy`, `sortOrder`.
- [x] Đặt giới hạn tối đa cho `pageSize`.
- [x] Thêm pagination cho invoices.
- [x] Thêm pagination cho payments.
- [x] Thêm pagination cho reports detail.
- [x] Thêm pagination cho utility readings nếu dữ liệu tăng lớn.
- [x] Trả `total`, `page`, `pageSize`, `items`.
- [x] Thêm database indexes cho filters phổ biến.
- [x] Kiểm tra query plan cho bảng lớn.
- [x] Debounce tìm kiếm phía frontend.

## BE-005 - OpenAPI và API versioning

- [x] Viết OpenAPI cho auth, tenants, contracts, utilities, invoices và payments.
- [x] Mô tả request/response schemas.
- [x] Mô tả error codes.
- [x] Mô tả yêu cầu role cho từng endpoint.
- [x] Sinh API documentation trong development/staging.
- [x] Không public Swagger production nếu không có kiểm soát truy cập.
- [x] Xác định chiến lược versioning API trước khi có client bên ngoài.

---

# P1 - Database And Migration

## DB-001 - Một nguồn schema duy nhất

- [x] Chọn thư mục `migrations` làm source of truth.
- [x] Không hướng dẫn chạy `database.sql` trực tiếp cho database mới.
- [x] Nếu cần `database.sql`, sinh tự động từ migrations.
- [x] Không chỉnh sửa migration đã chạy.
- [x] Viết migration mới cho mọi thay đổi schema.
- [x] Cập nhật README dùng `npm run db:migrate`.
- [x] Cập nhật tài liệu seed dùng `npm run db:seed`.
- [x] Loại bỏ thông tin seed/demo đã lỗi thời.

## DB-002 - Constraint và index audit

- [x] Kiểm tra unique active contract trên mỗi room.
- [x] Kiểm tra một primary tenant trên mỗi contract.
- [x] Kiểm tra một utility reading trên room/month.
- [x] Kiểm tra một invoice hợp lệ trên contract/month theo nghiệp vụ.
- [x] Kiểm tra payment amount luôn dương.
- [x] Kiểm tra meter reading không giảm nếu không có reset meter.
- [x] Kiểm tra contract dates hợp lệ.
- [x] Kiểm tra invoice due date không trước issue date.
- [x] Thêm index cho manager ownership joins.
- [x] Thêm index cho month/status filters.
- [x] Thêm index cho payment request/proof lookup.
- [x] Loại bỏ index trùng hoặc không được sử dụng.

## DB-003 - Migration và rollback

- [x] Viết checklist backup trước migration rủi ro.
- [x] Phân loại migration backward-compatible và breaking.
- [x] Dùng expand-migrate-contract cho thay đổi lớn.
- [x] Không khóa bảng lâu trong giờ cao điểm.
- [x] Kiểm thử migration với dữ liệu gần production.
- [x] Document rollback bằng restore hoặc forward-fix.
- [x] Tự động ghi version ứng dụng cùng migration.
- [x] Có bước xác nhận migration thành công sau deploy.

---

# P1 - Operations And Deployment

## OPS-001 - Structured logging

- [x] Dùng logger có cấu trúc như Pino.
- [x] Sinh request ID hoặc nhận request ID từ gateway.
- [x] Log method, route, status code và duration.
- [x] Log user ID/role khi phù hợp.
- [x] Không log password, token, CCCD đầy đủ hoặc signed URL.
- [x] Dùng log level theo môi trường.
- [x] Chuẩn hóa error serialization.
- [x] Liên kết application log với audit log bằng request ID.

## OPS-002 - Error monitoring và metrics

- [x] Tích hợp Sentry hoặc công cụ tương đương.
- [x] Gắn release version vào error report.
- [x] Gắn environment staging/production.
- [x] Redact dữ liệu cá nhân trước khi gửi.
- [x] Theo dõi request error rate.
- [x] Theo dõi response latency.
- [x] Theo dõi database pool usage.
- [x] Theo dõi login failures.
- [x] Theo dõi upload failures.
- [x] Theo dõi invoice/payment failures.
- [x] Thiết lập cảnh báo theo ngưỡng.

## OPS-003 - Health check và graceful shutdown

- [x] Giữ `/health` cho liveness.
- [x] Thêm `/ready` kiểm tra database và dependency bắt buộc.
- [x] Readiness trả fail khi database không dùng được.
- [x] Lưu HTTP server instance.
- [x] Xử lý `SIGTERM` và `SIGINT`.
- [x] Ngừng nhận request mới khi shutdown.
- [x] Chờ request hiện tại hoàn thành trong timeout.
- [x] Đóng PostgreSQL pool.
- [x] Flush logger/error monitoring.
- [x] Thoát process sau `uncaughtException`.
- [x] Thoát hoặc restart an toàn sau `unhandledRejection` nghiêm trọng.

## OPS-004 - Container và environments

- [x] Tạo Dockerfile multi-stage cho backend.
- [x] Chạy bằng non-root user.
- [x] Chỉ copy artifact cần thiết vào production image.
- [x] Thêm `.dockerignore`.
- [x] Pin Node major version.
- [x] Tạo cấu hình development, test, staging và production rõ ràng.
- [x] Validate environment variables khi startup.
- [x] Phân biệt environment bắt buộc và tùy chọn.
- [x] Sửa mâu thuẫn cấu hình SMTP giữa code và README.
- [x] Có staging sử dụng cấu hình gần giống production.

## OPS-005 - Backup và disaster recovery

- [x] Thiết lập backup PostgreSQL tự động.
- [x] Xác định retention hằng ngày/hằng tuần/hằng tháng.
- [x] Mã hóa backup.
- [x] Lưu backup khác vùng hoặc khác tài khoản hạ tầng.
- [x] Kiểm thử restore định kỳ.
- [x] Ghi nhận RPO và RTO mục tiêu.
- [x] Backup hoặc có chiến lược phục hồi Cloudinary assets.
- [x] Viết runbook xử lý mất database.
- [x] Viết runbook xử lý deploy lỗi.
- [x] Viết runbook rotate secrets.

## OPS-006 - Background jobs

- [x] Chọn cơ chế job phù hợp với quy mô triển khai.
- [x] Cập nhật invoice quá hạn theo lịch hoặc tính trạng thái động nhất quán.
- [x] Hết hạn payment request đúng thời điểm.
- [x] Gửi reminder trước/sau hạn thanh toán.
- [x] Dọn refresh sessions hết hạn.
- [x] Dọn activation/reset tokens hết hạn.
- [x] Retry email thất bại có giới hạn.
- [x] Cleanup orphan Cloudinary assets.
- [x] Job phải idempotent.
- [x] Theo dõi trạng thái và lỗi của job.

---

# P2 - Frontend Architecture And UX

## FE-001 - Chia nhỏ page components

**Contracts**

- [x] Tách contract filters.
- [x] Tách contract table.
- [x] Tách create/edit form.
- [x] Tách status action toolbar.
- [x] Tách document management.
- [x] Tách data-fetching hook.

**Invoices**

- [x] Tách invoice filters và list.
- [x] Tách invoice detail.
- [x] Tách invoice form.
- [x] Tách invoice calculation.
- [x] Tách issue/void/payment actions.
- [x] Tách VietQR display.
- [x] Tách data-fetching hook.

**Tenant room**

- [x] Tách room/contract summary.
- [x] Tách utility reading form.
- [x] Tách current invoice.
- [x] Tách invoice history.
- [x] Tách payment proof form.
- [x] Tách document/evidence preview.

**Fixed charges và rental registration**

- [x] Tách catalog, assignment và monthly extras.
- [x] Tách từng bước rental registration thành component độc lập.
- [x] Đưa validation và payload mapping ra khỏi page component.

## FE-002 - Chuẩn hóa routing

- [x] Cài và cấu hình React Router.
- [x] Khai báo route tree tập trung.
- [x] Tạo protected route.
- [x] Tạo role-based route guard.
- [x] Hỗ trợ route params bằng router.
- [x] Hỗ trợ query params cho filters.
- [x] Thêm trang `403`.
- [x] Thêm trang `404`.
- [x] Giữ đúng browser back/forward.
- [x] Giữ filter khi mở chi tiết và quay lại.
- [x] Cập nhật route tests.

## FE-003 - Chuẩn hóa server state

- [x] Dùng TanStack Query hoặc giải pháp tương đương.
- [x] Tạo query keys thống nhất.
- [x] Cache danh sách building, room và tenant hợp lý.
- [x] Invalidate dữ liệu sau mutation.
- [x] Tránh refetch trùng.
- [x] Xử lý retry theo loại lỗi.
- [x] Không retry lỗi validation hoặc authorization.
- [x] Hủy request khi component unmount hoặc filter đổi.
- [x] Xử lý refresh token đồng thời ở một nơi.
- [x] Dùng optimistic update chỉ cho thao tác có rollback rõ ràng.

## FE-004 - Chuẩn hóa i18n

- [x] Chuyển sang `i18next`, `react-i18next` hoặc `react-intl`.
- [x] Không dịch bằng cách clone toàn bộ React tree.
- [x] Dùng translation keys ổn định.
- [x] Chia locale theo namespace/feature.
- [x] Lazy-load locale được chọn.
- [x] Kiểm tra thiếu key trong CI.
- [x] Hỗ trợ interpolation và pluralization chuẩn.
- [x] Đồng bộ Ant Design locale.
- [x] Đồng bộ ngày, số tiền và đơn vị theo locale.
- [x] Loại bỏ aliases/string matching không cần thiết.
- [x] Giảm chunk `Localized` khoảng 698 KB.

## FE-005 - Error, loading và submit behavior

- [x] Mọi mutation phải có trạng thái loading.
- [x] Disable submit trong lúc request đang chạy.
- [x] Chống double-click tạo request trùng.
- [x] Hiển thị validation error tại field liên quan.
- [x] Hiển thị business error bằng ngôn ngữ đang chọn.
- [x] Hiển thị fallback message khi API không trả error code.
- [x] Không hiển thị raw SQL/backend stack.
- [x] Cho phép retry ở lỗi mạng tạm thời.
- [x] Giữ dữ liệu form sau khi submit thất bại.
- [x] Chỉ đóng modal/drawer khi thao tác thành công.
- [x] Chuẩn hóa success notification.
- [x] Chuẩn hóa empty state và skeleton/loading state.

## FE-006 - Accessibility

- [x] Kiểm tra toàn bộ thao tác bằng bàn phím.
- [x] Bảo đảm focus chuyển đúng khi mở modal/drawer.
- [x] Trả focus về nút mở sau khi đóng.
- [x] Thêm accessible name cho icon buttons.
- [x] Kiểm tra label của form fields.
- [x] Không chỉ dùng màu sắc để thể hiện trạng thái.
- [x] Kiểm tra color contrast.
- [x] Thêm `aria-live` cho thông báo quan trọng.
- [x] Kiểm tra bảng trên screen reader.
- [x] Kiểm tra zoom 200%.
- [x] Tôn trọng reduced motion.

## FE-007 - Responsive và hiệu năng

- [x] Kiểm tra desktop, tablet và mobile cho mọi page.
- [x] Không để action buttons tràn hoặc chồng nhau.
- [x] Dùng responsive table/list phù hợp.
- [x] Tối ưu ảnh login theo viewport.
- [x] Dùng WebP/AVIF nếu phù hợp.
- [x] Lazy-load ảnh và preview.
- [x] Tách bundle i18n và Ant Design components hợp lý.
- [x] Đặt bundle budget trong CI.
- [x] Phân tích bundle sau mỗi thay đổi lớn.
- [x] Virtualize danh sách khi dữ liệu rất lớn.

## FE-008 - Dọn code cũ

- [x] Xác nhận route không còn dùng `front-end/src/features/buildings`.
- [x] Xóa prototype buildings cũ.
- [x] Xóa service, type và CSS không còn tham chiếu.
- [x] Xóa route/page payment gateway không còn sử dụng.
- [x] Xóa cấu hình VNPay/MoMo nếu sản phẩm không còn hỗ trợ.
- [x] Xóa translations và tests cho chức năng đã loại bỏ.
- [x] Không để TODO đánh dấu hoàn thành sai với source hiện tại.

---

# P2 - Product Completion

## PRODUCT-001 - Làm rõ phạm vi ba màn hình billing

- [x] `Monthly Billing`: chỉ phục vụ chuẩn bị và tạo hóa đơn hàng loạt theo tháng.
- [x] `Invoices`: quản lý vòng đời hóa đơn, issue, void, detail và adjustments.
- [x] `Payments`: quản lý yêu cầu thanh toán, proofs, approve/reject và reconciliation.
- [x] Không lặp lại cùng một action ở nhiều màn hình nếu không cần thiết.
- [x] Điều hướng xuyên suốt từ reading sang invoice rồi payment.
- [x] Hiển thị trạng thái và next action rõ ràng.
- [x] Thống nhất thuật ngữ giữa frontend, backend và tài liệu.

## PRODUCT-002 - Notification

- [x] Thông báo tenant khi tài khoản được tạo.
- [x] Thông báo khi utility reading bị reject.
- [x] Thông báo khi invoice được issue.
- [x] Thông báo trước ngày đến hạn.
- [x] Thông báo khi payment proof bị reject.
- [x] Thông báo khi payment được approve.
- [x] Cho phép cấu hình email notification.
- [x] Không gửi trùng notification khi job retry.
- [x] Lưu trạng thái gửi để hỗ trợ kiểm tra lỗi.

## PRODUCT-003 - Báo cáo và đối soát

- [x] Định nghĩa rõ công thức doanh thu.
- [x] Phân biệt invoiced revenue và collected cash.
- [x] Phân biệt outstanding, overdue và void.
- [x] Hỗ trợ lọc theo tháng, building, room và tenant.
- [x] Hiển thị payment reversal đúng cách.
- [x] Thêm báo cáo payment reconciliation.
- [x] Thêm export CSV an toàn.
- [x] Cân nhắc XLSX nếu có yêu cầu nghiệp vụ thực tế.
- [x] Gắn timezone và currency rõ ràng.

## PRODUCT-004 - Tenant lifecycle

- [x] Phân biệt tenant profile và user account.
- [x] Hiển thị trạng thái invitation/activation.
- [x] Cho phép manager resend invitation.
- [x] Cho phép deactivate account mà không xóa tenant history.
- [x] Không xóa tenant đang có hợp đồng hoặc dữ liệu tài chính.
- [x] Có quy trình kết thúc thuê và lưu lịch sử.
- [x] Có chính sách tenant quay lại thuê trong tương lai.

---

# P2 - Documentation

## DOC-001 - README

- [x] Cập nhật prerequisites và Node version chính thức.
- [x] Hướng dẫn chạy migrations thay cho `database.sql`.
- [x] Hướng dẫn chạy seed đúng với source hiện tại.
- [x] Mô tả tài khoản demo và chỉ bật trong development.
- [x] Liệt kê environment variables bắt buộc/tùy chọn.
- [x] Sửa mô tả SMTP để khớp validation.
- [x] Hướng dẫn chạy frontend/backend/tests.
- [x] Hướng dẫn build production.
- [x] Hướng dẫn deploy và health check.

## DOC-002 - Kiến trúc và nghiệp vụ

- [x] Tạo sơ đồ frontend/backend/database/external services.
- [x] Mô tả authentication/session lifecycle.
- [x] Mô tả rental registration state machine.
- [x] Mô tả contract state machine.
- [x] Mô tả utility reading state machine.
- [x] Mô tả invoice/payment state machine.
- [x] Mô tả manager ownership và tenant authorization.
- [x] Mô tả file upload lifecycle.
- [x] Ghi lại architectural decisions quan trọng.

## DOC-003 - Runbooks

- [x] Runbook deploy phiên bản mới.
- [x] Runbook chạy migration.
- [x] Runbook rollback/forward-fix.
- [x] Runbook restore database.
- [x] Runbook Cloudinary lỗi.
- [x] Runbook email lỗi.
- [x] Runbook payment reconciliation.
- [x] Runbook khóa tài khoản bị xâm nhập.
- [x] Runbook rotate JWT/Cloudinary/SMTP/database secrets.

---

# P3 - Cải tiến sau production

- [x] Thêm trang quản lý session và thiết bị đăng nhập.
- [x] Thêm 2FA cho manager.
- [x] Thêm web push hoặc in-app notification.
- [x] Thêm bulk actions có kiểm soát cho invoice/payment.
- [x] Thêm import tenant/building/room từ file.
- [x] Thêm template hóa đơn và branding theo manager.
- [x] Thêm dashboard vận hành theo thời gian thực.
- [x] Thêm feature flags cho chức năng mới.
- [x] Thêm performance/load testing.
- [x] Thêm accessibility automation trong CI.
- [x] Thêm localization cho email và tài liệu xuất.

---

# 4. Kế hoạch triển khai đề xuất

## Sprint 1 - Security Foundation

- [x] AUTH-001: Chặn passwordless login.
- [x] AUTH-002: Invitation và activation.
- [x] AUTH-004: Refresh token rotation và cookie.
- [x] AUTH-005: Password policy/session revoke.
- [x] SEC-001: CORS.
- [x] SEC-002: Rate limit.
- [x] SEC-003: Security headers.
- [x] SEC-006: Secrets và database TLS.

**Đầu ra bắt buộc**

- [x] Authentication integration tests pass.
- [x] Không còn token dài hạn trong `localStorage`.
- [x] Security checklist được review.

## Sprint 2 - Privacy And Financial Integrity

- [x] SEC-004: Private Cloudinary assets.
- [x] SEC-005: CSV injection.
- [x] DATA-001: Void invoice.
- [x] DATA-002: Immutable payment ledger.
- [x] DATA-003: Audit log.
- [x] DATA-004: Transaction/concurrency.
- [x] DATA-005: Data retention.

**Đầu ra bắt buộc**

- [x] Không thể truy cập CCCD/payment proof bằng public URL.
- [x] Không thể hard-delete financial history.
- [x] Critical actions có audit log.

## Sprint 3 - Testing And Operations

- [x] TEST-001: PostgreSQL integration tests.
- [x] TEST-002: Authorization tests.
- [x] TEST-003: Playwright E2E.
- [x] TEST-004: Frontend test quality.
- [x] TEST-005: CI gates.
- [x] OPS-001: Structured logging.
- [x] OPS-002: Error monitoring.
- [x] OPS-003: Health/graceful shutdown.
- [x] OPS-004: Container/environments.
- [x] OPS-005: Backup/restore.

**Đầu ra bắt buộc**

- [x] CI kiểm tra migration với PostgreSQL thật.
- [x] Critical E2E flows pass.
- [x] Restore backup được diễn tập thành công.
- [x] Có cảnh báo khi backend/database lỗi.

## Sprint 4 - Architecture And UX

- [x] BE-001 đến BE-005.
- [x] DB-001 đến DB-003.
- [x] FE-001 đến FE-008.
- [x] PRODUCT-001 đến PRODUCT-004.
- [x] DOC-001 đến DOC-003.

**Đầu ra bắt buộc**

- [x] Không còn page/service khổng lồ chưa có lý do rõ ràng.
- [x] Bundle không còn chunk vượt budget đã thống nhất.
- [x] Các màn hình có loading/error/empty state nhất quán.
- [x] Tài liệu khớp với source và quy trình deploy thực tế.

---

# 5. Definition Of Done

Một task chỉ được đánh dấu hoàn thành khi:

- [x] Business rule và acceptance criteria đã được xác nhận.
- [x] Code đã được review.
- [x] Không làm mất hoặc thay đổi dữ liệu ngoài dự kiến.
- [x] Unit test phù hợp đã được thêm/cập nhật.
- [x] Integration hoặc E2E test được thêm nếu task thay đổi luồng nghiệp vụ.
- [x] Typecheck, lint, test và build đều pass.
- [x] Không còn warning mới chưa được giải thích.
- [x] Migration đã được thử trên database mới và database có dữ liệu.
- [x] Error message có nghĩa và hỗ trợ cả hai ngôn ngữ.
- [x] Loading, success, failure và retry state đã được kiểm tra.
- [x] Authorization đã được kiểm tra với manager A, manager B và tenant.
- [x] Dữ liệu nhạy cảm không xuất hiện trong log hoặc response không cần thiết.
- [x] Documentation và environment example đã được cập nhật.
- [x] Có kế hoạch rollback hoặc forward-fix.
- [x] Đã kiểm tra trên desktop và mobile nếu thay đổi frontend.

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
