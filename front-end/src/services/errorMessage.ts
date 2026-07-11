import { ApiError } from './apiClient'

const errorMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Du lieu nhap chua hop le. Vui long kiem tra cac truong va thu lai.',
  UNAUTHORIZED: 'Phien dang nhap da het han. Vui long dang nhap lai.',
  FORBIDDEN: 'Ban khong co quyen thuc hien thao tac nay.',
  BUILDING_NOT_FOUND: 'Khong tim thay toa nha hoac ban khong co quyen truy cap.',
  BUILDING_HAS_CONTRACTS: 'Khong the xoa toa nha dang co hop dong.',
  ROOM_NOT_FOUND: 'Khong tim thay phong hoac ban khong co quyen truy cap.',
  ROOM_NOT_AVAILABLE: 'Phong khong o trang thai san sang cho thue.',
  ROOM_ALREADY_OCCUPIED: 'Phong da co hop dong dang hoat dong.',
  ROOM_HAS_CONTRACTS: 'Khong the xoa phong da co hop dong.',
  ROOM_MAX_OCCUPANTS_EXCEEDED: 'So nguoi o vuot qua suc chua toi da cua phong.',
  TENANT_NOT_FOUND: 'Khong tim thay nguoi thue hoac ban khong co quyen truy cap.',
  TENANT_DUPLICATE: 'So dien thoai hoac giay to tuy than da ton tai.',
  TENANT_ALREADY_EXISTS: 'Nguoi thue nay da ton tai trong he thong.',
  TENANT_BLACKLISTED: 'Nguoi thue dang nam trong danh sach han che.',
  TENANT_HAS_ACTIVE_CONTRACT: 'Nguoi thue dang co mot hop dong hoat dong khac.',
  TENANT_HAS_UNPAID_INVOICE: 'Nguoi thue con hoa don chua thanh toan.',
  CONTRACT_NOT_FOUND: 'Khong tim thay hop dong hoac ban khong co quyen truy cap.',
  CONTRACT_DOCUMENT_NOT_FOUND: 'Khong tim thay giay to hop dong.',
  CONTRACT_NOT_DRAFT: 'Chi hop dong nhap moi co the thuc hien thao tac nay.',
  CONTRACT_NOT_ACTIVE: 'Hop dong khong o trang thai dang hoat dong.',
  CONTRACT_CLOSED: 'Hop dong da dong, khong the thay doi.',
  CONTRACT_ACTIVE: 'Hop dong dang hoat dong; hay ket thuc hop dong thay vi huy.',
  CONTRACT_TENANT_REQUIRED: 'Hop dong phai co it nhat mot nguoi thue.',
  CONTRACT_PRIMARY_TENANT_REQUIRED: 'Hop dong phai co dung mot nguoi thue chinh.',
  CONTRACT_PRIMARY_TENANT_CONFLICT: 'Hop dong chi duoc co mot nguoi thue chinh.',
  INVOICE_NOT_FOUND: 'Khong tim thay hoa don.',
  INVOICE_ALREADY_EXISTS: 'Hoa don cua ky nay da ton tai.',
  INVOICE_CLOSED: 'Hoa don da dong, khong the thay doi.',
  INVOICE_PAID: 'Hoa don da duoc thanh toan.',
  INVOICE_NOT_ISSUED: 'Hoa don chua duoc phat hanh.',
  APPROVED_READING_REQUIRED: 'Can co chi so dien nuoc da duyet truoc khi tao hoa don.',
  UTILITY_READING_NOT_FOUND: 'Khong tim thay ban ghi chi so dien nuoc.',
  UTILITY_READING_NOT_SUBMITTED: 'Chi so chua o trang thai cho duyet.',
  UTILITY_READING_LOCKED: 'Chi so da bi khoa va khong the thay doi.',
  UTILITY_RATE_REQUIRED: 'Chua cau hinh don gia dien nuoc cho ky nay.',
  UTILITY_RATE_ALREADY_EXISTS: 'Don gia dien nuoc trong khoang thoi gian nay da ton tai.',
  PAYMENT_FAILED: 'Thanh toan khong thanh cong. Vui long kiem tra va thu lai.',
  PAYMENT_CANCELLED: 'Yeu cau thanh toan da bi huy.',
  INVALID_AMOUNT: 'So tien khong hop le.',
  INVALID_SIGNATURE: 'Chu ky xac thuc khong hop le.',
  VNPAY_NOT_CONFIGURED: 'Cong thanh toan VNPAY chua duoc cau hinh.',
  CLOUDINARY_NOT_CONFIGURED: 'Dich vu luu tru file Cloudinary chua duoc cau hinh.',
  CLOUDINARY_DELETE_FAILED: 'Khong the xoa file tren Cloudinary. Du lieu chua bi xoa.',
  CLOUDINARY_ASSET_METADATA_MISSING: 'Khong xac dinh duoc file tren Cloudinary de xoa.',
  UPLOAD_CONTEXT_FORBIDDEN: 'Ban khong co quyen tai file trong chuc nang nay.',
  UPLOAD_MIME_INVALID: 'Dinh dang file khong duoc ho tro.',
  UPLOAD_SIZE_INVALID: 'File vuot qua dung luong cho phep.',
  UPLOAD_URL_INVALID: 'Dia chi file tai len khong hop le.',
  INTERNAL_ERROR: 'He thong dang gap loi noi bo. Vui long thu lai sau.',
  UNKNOWN_ERROR: 'Da xay ra loi khong xac dinh. Vui long thu lai.',
}

const statusMessages: Record<number, string> = {
  400: 'Yeu cau khong hop le. Vui long kiem tra du lieu.',
  401: 'Phien dang nhap da het han. Vui long dang nhap lai.',
  403: 'Ban khong co quyen thuc hien thao tac nay.',
  404: 'Khong tim thay du lieu yeu cau.',
  409: 'Thao tac xung dot voi du lieu hien tai. Vui long tai lai va thu lai.',
  413: 'Du lieu tai len vuot qua dung luong cho phep.',
  429: 'Ban thao tac qua nhanh. Vui long cho mot luc roi thu lai.',
  500: 'He thong dang gap loi noi bo. Vui long thu lai sau.',
  502: 'Dich vu ben ngoai dang loi. Vui long thu lai sau.',
  503: 'He thong tam thoi khong san sang. Vui long thu lai sau.',
}

export function getUserErrorMessage(error: unknown, fallback = 'Khong the thuc hien thao tac. Vui long thu lai.'): string {
  if (error instanceof ApiError) {
    return errorMessages[error.code] ?? (error.status ? statusMessages[error.status] : undefined) ?? error.message ?? fallback
  }

  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return 'Khong the ket noi den he thong. Vui long kiem tra mang hoac may chu backend.'
  }

  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}
