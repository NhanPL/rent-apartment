import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from './logger.service';

interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
}

export type EmailLocale = 'en' | 'vi';

interface LocalizedEmailPayload {
  locale?: EmailLocale;
}

interface TenantActivationPayload extends LocalizedEmailPayload {
  to: string;
  tenantName: string;
  activationUrl: string;
  username: string;
  expiresAt: string;
}

interface PasswordResetPayload extends LocalizedEmailPayload {
  to: string;
  resetUrl: string;
  expiresAt: string;
}

interface PasswordChangedPayload extends LocalizedEmailPayload {
  to: string;
}

export interface PaymentReminderPayload extends LocalizedEmailPayload {
  to: string;
  tenantName: string;
  roomCode: string;
  month: string;
  dueDate: string;
  outstandingAmount: number;
  timing: 'BEFORE_DUE' | 'AFTER_DUE';
}

export interface TenantNotificationPayload extends LocalizedEmailPayload {
  to: string;
  tenantName: string;
  roomCode: string;
  month: string;
}

export interface UtilityReadingRejectedPayload extends TenantNotificationPayload {
  reason: string;
}

export interface InvoiceIssuedPayload extends TenantNotificationPayload {
  invoiceId: string;
  total: number;
  dueDate: string;
}

export interface PaymentProofRejectedPayload extends TenantNotificationPayload {
  reason: string;
}

export interface PaymentApprovedPayload extends TenantNotificationPayload {
  amount: number;
  remainingAmount: number;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

const isSmtpConfigured = (): boolean =>
  env.SMTP_ENABLED;

const getTransporter = (): ReturnType<typeof nodemailer.createTransport> | null => {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === 'true',
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
  }

  return transporter;
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const localeName = (locale: EmailLocale | undefined): string => locale === 'vi' ? 'vi-VN' : 'en-US';
const formatUtcDateTime = (value: string, locale: EmailLocale | undefined): string => (
  new Date(value).toLocaleString(localeName(locale), { timeZone: 'UTC' })
);
const formatVnd = (amount: number, locale: EmailLocale | undefined): string => new Intl.NumberFormat(
  localeName(locale),
  { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }
).format(amount);

export const sendEmail = async (payload: SendEmailPayload): Promise<boolean> => {
  const mailer = getTransporter();
  if (!mailer) {
    logger.warn({ emailType: payload.subject }, 'SMTP is not configured; skipping email send');
    return false;
  }

  await mailer.sendMail({
    from: `"${env.SMTP_FROM_NAME || 'Rent Apartment'}" <${env.SMTP_FROM_EMAIL}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html
  });
  return true;
};

export const sendTenantActivationEmail = async (payload: TenantActivationPayload): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  const subject = vietnamese ? 'Kích hoạt tài khoản thuê nhà của bạn' : 'Activate your rental account';
  const tenantName = escapeHtml(payload.tenantName);
  const activationUrl = escapeHtml(payload.activationUrl);
  const username = escapeHtml(payload.username);
  const expiresAt = escapeHtml(formatUtcDateTime(payload.expiresAt, payload.locale));
  const html = vietnamese ? `
    <p>Xin chào ${tenantName},</p>
    <p>Tài khoản thuê nhà của bạn đã được tạo. Hãy thiết lập mật khẩu để kích hoạt tài khoản.</p>
    <p>Tên đăng nhập: ${username}</p>
    <p><a href="${activationUrl}">Kích hoạt tài khoản</a></p>
    <p>Liên kết hết hạn lúc ${expiresAt} UTC và chỉ có thể sử dụng một lần.</p>
    <p>Nếu bạn không mong đợi lời mời này, bạn có thể bỏ qua email.</p>
  ` : `
    <p>Hello ${tenantName},</p>
    <p>Your rental account has been created. Set your password to activate it.</p>
    <p>Username: ${username}</p>
    <p><a href="${activationUrl}">Activate account</a></p>
    <p>This link expires at ${expiresAt} UTC and can only be used once.</p>
    <p>If you did not expect this invitation, you can ignore this email.</p>
  `;

  return sendEmail({ to: payload.to, subject, html });
};

export const sendPasswordResetEmail = async (payload: PasswordResetPayload): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  const subject = vietnamese ? 'Đặt lại mật khẩu tài khoản thuê nhà' : 'Reset your rental account password';
  const resetUrl = escapeHtml(payload.resetUrl);
  const expiresAt = escapeHtml(formatUtcDateTime(payload.expiresAt, payload.locale));
  const html = vietnamese ? `
    <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu tài khoản thuê nhà của bạn.</p>
    <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>
    <p>Liên kết hết hạn lúc ${expiresAt} UTC và chỉ có thể sử dụng một lần.</p>
    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email.</p>
  ` : `
    <p>We received a request to reset your rental account password.</p>
    <p><a href="${resetUrl}">Reset password</a></p>
    <p>This link expires at ${expiresAt} UTC and can only be used once.</p>
    <p>If you did not request a password reset, you can ignore this email.</p>
  `;

  return sendEmail({ to: payload.to, subject, html });
};

export const sendPasswordChangedEmail = async (payload: PasswordChangedPayload): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  const subject = vietnamese ? 'Mật khẩu tài khoản thuê nhà đã được thay đổi' : 'Your rental account password was changed';
  const html = vietnamese ? `
    <p>Mật khẩu tài khoản thuê nhà của bạn đã được thay đổi thành công.</p>
    <p>Tất cả phiên đăng nhập hiện có đã được đăng xuất.</p>
    <p>Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay với quản lý.</p>
  ` : `
    <p>Your rental account password has been changed successfully.</p>
    <p>All existing sessions have been signed out.</p>
    <p>If you did not make this change, contact your property manager immediately.</p>
  `;

  return sendEmail({ to: payload.to, subject, html });
};

export const sendPaymentReminderEmail = async (payload: PaymentReminderPayload): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  const timingText = payload.timing === 'BEFORE_DUE'
    ? (vietnamese ? 'sắp đến hạn' : 'is due soon')
    : (vietnamese ? 'đã quá hạn' : 'is overdue');
  const subject = vietnamese
    ? (payload.timing === 'BEFORE_DUE' ? `Nhắc thanh toán phòng ${payload.roomCode}` : `Thanh toán quá hạn phòng ${payload.roomCode}`)
    : (payload.timing === 'BEFORE_DUE' ? `Payment reminder for room ${payload.roomCode}` : `Overdue payment for room ${payload.roomCode}`);
  const amount = formatVnd(payload.outstandingAmount, payload.locale);
  const html = vietnamese ? `
    <p>Xin chào ${escapeHtml(payload.tenantName)},</p>
    <p>Hóa đơn phòng ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) ${timingText}.</p>
    <p>Hạn thanh toán: ${escapeHtml(payload.dueDate)}</p>
    <p>Số tiền còn lại: ${escapeHtml(amount)}</p>
    <p>Vui lòng mở RentMate để xem hóa đơn và mã QR thanh toán.</p>
  ` : `
    <p>Hello ${escapeHtml(payload.tenantName)},</p>
    <p>Your invoice for room ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) ${timingText}.</p>
    <p>Due date: ${escapeHtml(payload.dueDate)}</p>
    <p>Outstanding amount: ${escapeHtml(amount)}</p>
    <p>Please open RentMate to review the invoice and payment QR.</p>
  `;

  return sendEmail({ to: payload.to, subject, html });
};

export const sendUtilityReadingRejectedEmail = async (
  payload: UtilityReadingRejectedPayload
): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  return sendEmail({
    to: payload.to,
    subject: vietnamese ? `Chỉ số điện nước phòng ${payload.roomCode} cần chỉnh sửa` : `Utility reading requires correction for room ${payload.roomCode}`,
    html: vietnamese ? `
    <p>Xin chào ${escapeHtml(payload.tenantName)},</p>
    <p>Chỉ số điện nước phòng ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) cần được chỉnh sửa.</p>
    <p>Lý do: ${escapeHtml(payload.reason)}</p>
    <p>Vui lòng mở RentMate để cập nhật và gửi lại chỉ số.</p>
  ` : `
    <p>Hello ${escapeHtml(payload.tenantName)},</p>
    <p>Your utility reading for room ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) requires correction.</p>
    <p>Reason: ${escapeHtml(payload.reason)}</p>
    <p>Please open RentMate to update and resubmit the reading.</p>
  `
  });
};

export const sendInvoiceIssuedEmail = async (
  payload: InvoiceIssuedPayload
): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  return sendEmail({
    to: payload.to,
    subject: vietnamese ? `Hóa đơn phòng ${payload.roomCode} đã được phát hành` : `Invoice issued for room ${payload.roomCode}`,
    html: vietnamese ? `
    <p>Xin chào ${escapeHtml(payload.tenantName)},</p>
    <p>Hóa đơn phòng ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) đã được phát hành.</p>
    <p>Số tiền: ${escapeHtml(formatVnd(payload.total, payload.locale))}</p>
    <p>Hạn thanh toán: ${escapeHtml(payload.dueDate)}</p>
    <p>Vui lòng mở RentMate để xem hóa đơn và mã QR thanh toán.</p>
  ` : `
    <p>Hello ${escapeHtml(payload.tenantName)},</p>
    <p>Your invoice for room ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) has been issued.</p>
    <p>Amount: ${escapeHtml(formatVnd(payload.total, payload.locale))}</p>
    <p>Due date: ${escapeHtml(payload.dueDate)}</p>
    <p>Please open RentMate to review the invoice and payment QR.</p>
  `
  });
};

export const sendPaymentProofRejectedEmail = async (
  payload: PaymentProofRejectedPayload
): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  return sendEmail({
    to: payload.to,
    subject: vietnamese ? `Bằng chứng thanh toán phòng ${payload.roomCode} cần cập nhật` : `Payment proof requires an update for room ${payload.roomCode}`,
    html: vietnamese ? `
    <p>Xin chào ${escapeHtml(payload.tenantName)},</p>
    <p>Bằng chứng thanh toán phòng ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) đã bị từ chối.</p>
    <p>Lý do: ${escapeHtml(payload.reason)}</p>
    <p>Vui lòng mở RentMate để gửi bằng chứng mới.</p>
  ` : `
    <p>Hello ${escapeHtml(payload.tenantName)},</p>
    <p>Your payment proof for room ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) was rejected.</p>
    <p>Reason: ${escapeHtml(payload.reason)}</p>
    <p>Please open RentMate to submit an updated proof.</p>
  `
  });
};

export const sendPaymentApprovedEmail = async (
  payload: PaymentApprovedPayload
): Promise<boolean> => {
  const vietnamese = payload.locale === 'vi';
  return sendEmail({
    to: payload.to,
    subject: vietnamese ? `Đã xác nhận thanh toán phòng ${payload.roomCode}` : `Payment confirmed for room ${payload.roomCode}`,
    html: vietnamese ? `
    <p>Xin chào ${escapeHtml(payload.tenantName)},</p>
    <p>Khoản thanh toán ${escapeHtml(formatVnd(payload.amount, payload.locale))} cho phòng ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) đã được duyệt.</p>
    <p>Số dư hóa đơn còn lại: ${escapeHtml(formatVnd(payload.remainingAmount, payload.locale))}</p>
    <p>Bạn có thể xem trạng thái hóa đơn mới nhất trong RentMate.</p>
  ` : `
    <p>Hello ${escapeHtml(payload.tenantName)},</p>
    <p>Your payment of ${escapeHtml(formatVnd(payload.amount, payload.locale))} for room ${escapeHtml(payload.roomCode)} (${escapeHtml(payload.month)}) was approved.</p>
    <p>Remaining invoice balance: ${escapeHtml(formatVnd(payload.remainingAmount, payload.locale))}</p>
    <p>You can review the updated invoice status in RentMate.</p>
  `
  });
};
