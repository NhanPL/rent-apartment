import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';

export interface VietQrPaymentInput {
  bankCode: string;
  accountNo: string;
  accountName: string;
  amount: number;
  transferNote: string;
}

export interface VietQrPaymentData {
  qrContent: string;
  qrImageUrl: string;
  normalizedAccountName: string;
  normalizedTransferNote: string;
}

const normalizeVietQrText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const createVietQrPaymentData = (input: VietQrPaymentInput): VietQrPaymentData => {
  const bankCode = input.bankCode.trim().toUpperCase();
  const accountNo = input.accountNo.trim();
  const amount = Number(input.amount);
  const normalizedAccountName = normalizeVietQrText(input.accountName).slice(0, 50);
  const normalizedTransferNote = normalizeVietQrText(input.transferNote).slice(0, 25);

  if (!/^[A-Z0-9]{2,20}$/.test(bankCode)) {
    throw new AppError(400, 'Bank code must be a VietQR bank code or BIN', 'VIETQR_BANK_CODE_INVALID');
  }
  if (!/^\d{6,19}$/.test(accountNo)) {
    throw new AppError(400, 'Bank account number must contain 6 to 19 digits', 'VIETQR_ACCOUNT_NO_INVALID');
  }
  if (normalizedAccountName.length < 2) {
    throw new AppError(400, 'Bank account name is required', 'VIETQR_ACCOUNT_NAME_INVALID');
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError(400, 'VietQR amount must be a positive whole number', 'VIETQR_AMOUNT_INVALID');
  }
  if (!normalizedTransferNote) {
    throw new AppError(400, 'Transfer note is required', 'VIETQR_TRANSFER_NOTE_INVALID');
  }

  const baseUrl = env.VIETQR_IMAGE_BASE_URL.replace(/\/$/, '');
  const path = `${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNo)}-${encodeURIComponent(env.VIETQR_TEMPLATE)}.png`;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: normalizedTransferNote,
    accountName: normalizedAccountName
  });
  const qrImageUrl = `${baseUrl}/${path}?${params.toString()}`;

  return {
    qrContent: JSON.stringify({
      provider: 'VIETQR',
      bankCode,
      accountNo,
      accountName: normalizedAccountName,
      amount,
      transferNote: normalizedTransferNote
    }),
    qrImageUrl,
    normalizedAccountName,
    normalizedTransferNote
  };
};
