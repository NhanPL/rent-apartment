import { beforeEach, describe, expect, it, vi } from 'vitest';

const mailMocks = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: mailMocks.sendMail })
  }
}));

import {
  sendInvoiceIssuedEmail,
  sendPasswordResetEmail,
  sendPaymentReminderEmail
} from '../src/shared/services/email.service';

describe('localized email templates', () => {
  beforeEach(() => {
    mailMocks.sendMail.mockReset();
    mailMocks.sendMail.mockResolvedValue({ accepted: ['tenant@example.test'] });
  });

  it('renders account email in Vietnamese and escapes user-controlled content', async () => {
    await sendPasswordResetEmail({
      to: 'tenant@example.test',
      resetUrl: 'https://example.test/reset?token=<secret>',
      expiresAt: '2026-08-12T12:30:00.000Z',
      locale: 'vi'
    });

    expect(mailMocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Đặt lại mật khẩu tài khoản thuê nhà',
      html: expect.stringContaining('Đặt lại mật khẩu')
    }));
    expect(mailMocks.sendMail.mock.calls[0][0].html).toContain('token=&lt;secret&gt;');
  });

  it('renders tenant billing emails using Vietnamese labels and currency', async () => {
    await sendPaymentReminderEmail({
      to: 'tenant@example.test', tenantName: 'Nguyễn An', roomCode: 'A-101', month: '2026-08',
      dueDate: '2026-08-15', outstandingAmount: 2500000, timing: 'BEFORE_DUE', locale: 'vi'
    });
    await sendInvoiceIssuedEmail({
      to: 'tenant@example.test', tenantName: 'Nguyễn An', roomCode: 'A-101', month: '2026-08',
      invoiceId: '00000000-0000-4000-8000-000000000001', total: 2500000, dueDate: '2026-08-15', locale: 'vi'
    });

    expect(mailMocks.sendMail.mock.calls[0][0]).toEqual(expect.objectContaining({
      subject: 'Nhắc thanh toán phòng A-101',
      html: expect.stringContaining('Số tiền còn lại')
    }));
    expect(mailMocks.sendMail.mock.calls[1][0]).toEqual(expect.objectContaining({
      subject: 'Hóa đơn phòng A-101 đã được phát hành',
      html: expect.stringContaining('Hạn thanh toán')
    }));
  });

  it('uses English when no locale was captured for an older outbox item', async () => {
    await sendPaymentReminderEmail({
      to: 'tenant@example.test', tenantName: 'Tenant', roomCode: 'A-101', month: '2026-08',
      dueDate: '2026-08-15', outstandingAmount: 1000, timing: 'AFTER_DUE'
    });
    expect(mailMocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Overdue payment for room A-101',
      html: expect.stringContaining('Outstanding amount')
    }));
  });
});
