import { describe, expect, it } from 'vitest';
import { createVietQrPaymentData } from '../src/modules/payments/vietqr.service';

describe('VietQR payment data', () => {
  it('creates a scannable image URL with normalized payment information', () => {
    const result = createVietQrPaymentData({
      bankCode: '970436',
      accountNo: '1234567890',
      accountName: 'Nguyễn Văn Quản Lý',
      amount: 1_250_000,
      transferNote: 'Hóa đơn tháng 07'
    });

    const url = new URL(result.qrImageUrl);
    expect(url.origin).toBe('https://img.vietqr.io');
    expect(url.pathname).toBe('/image/970436-1234567890-compact2.png');
    expect(url.searchParams.get('amount')).toBe('1250000');
    expect(url.searchParams.get('addInfo')).toBe('HOA DON THANG 07');
    expect(url.searchParams.get('accountName')).toBe('NGUYEN VAN QUAN LY');
    expect(JSON.parse(result.qrContent)).toMatchObject({
      provider: 'VIETQR',
      bankCode: '970436',
      accountNo: '1234567890',
      amount: 1_250_000
    });
  });

  it('rejects an invalid account number', () => {
    expect(() => createVietQrPaymentData({
      bankCode: 'VCB',
      accountNo: 'ABC123',
      accountName: 'Manager Account',
      amount: 100_000,
      transferNote: 'INV 1234'
    })).toThrow('Bank account number must contain 6 to 19 digits');
  });
});
