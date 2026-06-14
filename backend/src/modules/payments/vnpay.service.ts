import crypto from 'crypto';
import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';

type DbRow = Record<string, any>;
type VnpayParams = Record<string, string>;
type VnpayLocale = 'vn' | 'en';

interface CreateVnpayPaymentPayload {
  bank_code?: string | null;
  locale?: VnpayLocale;
}

interface VnpayProcessResult {
  code: string;
  message: string;
  success: boolean;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  signature_valid: boolean;
  already_confirmed: boolean;
  invoice_id: string | null;
  payment_id: string | null;
  transaction_id: string | null;
  merchant_order_id: string | null;
  amount: number | null;
  paid_at: string | null;
  provider_txn_id: string | null;
}

const terminalTxnStatuses = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']);

const toNumber = (value: unknown) => Number(value ?? 0);

const compareParamKeys = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const toSortedSearchParams = (params: VnpayParams) => {
  const searchParams = new URLSearchParams();
  Object.keys(params)
    .sort(compareParamKeys)
    .forEach((key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value);
      }
    });
  return searchParams;
};

const buildSignData = (params: VnpayParams) => toSortedSearchParams(params).toString();

const signParams = (params: VnpayParams, secret: string) =>
  crypto.createHmac('sha512', secret).update(buildSignData(params), 'utf8').digest('hex');

const verifySignature = (params: VnpayParams, secret: string) => {
  const providedHash = params.vnp_SecureHash?.toLowerCase();
  if (!providedHash) return false;

  const unsignedParams = { ...params };
  delete unsignedParams.vnp_SecureHash;
  delete unsignedParams.vnp_SecureHashType;

  const expectedHash = signParams(unsignedParams, secret).toLowerCase();
  if (providedHash.length !== expectedHash.length) return false;

  return crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash));
};

const formatVnpayDate = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
};

const parseVnpayDate = (value?: string) => {
  if (!value || !/^\d{14}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  return new Date(year, month, day, hour, minute, second);
};

const getConfiguredVnpay = () => {
  if (!env.VNPAY_TMN_CODE || !env.VNPAY_HASH_SECRET) {
    throw new AppError(503, 'VNPAY is not configured', 'VNPAY_NOT_CONFIGURED');
  }

  const frontendUrl = env.FRONTEND_URL.replace(/\/$/, '');
  const publicApiBaseUrl = (env.PUBLIC_API_BASE_URL ?? `http://localhost:${env.PORT}/api`).replace(/\/$/, '');

  return {
    tmnCode: env.VNPAY_TMN_CODE,
    hashSecret: env.VNPAY_HASH_SECRET,
    paymentUrl: env.VNPAY_PAYMENT_URL,
    returnUrl: env.VNPAY_RETURN_URL ?? `${frontendUrl}/payment-result`,
    ipnUrl: env.VNPAY_IPN_URL ?? `${publicApiBaseUrl}/payments/vnpay/ipn`,
    version: env.VNPAY_VERSION,
    locale: env.VNPAY_LOCALE,
    orderType: env.VNPAY_ORDER_TYPE,
    expireMinutes: env.VNPAY_EXPIRE_MINUTES
  };
};

const normalizeVnpayParams = (input: Record<string, unknown>): VnpayParams => {
  const params: VnpayParams = {};
  Object.entries(input).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const first = value[0];
      if (first !== undefined && first !== null) params[key] = String(first);
      return;
    }
    if (value !== undefined && value !== null) params[key] = String(value);
  });
  return params;
};

const buildRedirectUrl = (baseUrl: string, params: VnpayParams) => `${baseUrl}?${toSortedSearchParams(params).toString()}`;

const generateMerchantOrderId = (invoiceId: string) =>
  `VNPAY-${Date.now()}-${invoiceId.slice(0, 8)}-${crypto.randomBytes(3).toString('hex')}`;

const getInvoicePaidAmount = async (client: PoolClient, invoiceId: string) => {
  const rs = await client.query<{ paid_amount: string | number }>(
    `SELECT COALESCE(SUM(amount), 0) AS paid_amount
     FROM payment
     WHERE invoice_id=$1 AND status='SUCCEEDED'`,
    [invoiceId]
  );
  return toNumber(rs.rows[0]?.paid_amount);
};

const findProcessableTransaction = async (client: PoolClient, merchantOrderId: string) => {
  const rs = await client.query<DbRow>(
    `SELECT
       pt.*,
       p.invoice_id,
       p.status AS payment_status,
       p.amount AS payment_amount,
       i.total AS invoice_total,
       i.status AS invoice_status
     FROM payment_transaction pt
     JOIN payment p ON p.id=pt.payment_id
     JOIN invoice i ON i.id=p.invoice_id
     WHERE pt.provider='VNPAY' AND pt.merchant_order_id=$1
     FOR UPDATE OF pt, p, i`,
    [merchantOrderId]
  );
  return rs.rows[0] ?? null;
};

const markInvalidSignature = async (params: VnpayParams) => {
  const merchantOrderId = params.vnp_TxnRef;
  if (!merchantOrderId) return;

  await withTransaction(async (client) => {
    const txn = await findProcessableTransaction(client, merchantOrderId);
    if (!txn || terminalTxnStatuses.has(txn.status)) return;

    await client.query(
      `UPDATE payment_transaction
       SET status='FAILED', callback_payload=$2, signature_valid=false, failed_reason='Invalid VNPAY signature'
       WHERE id=$1`,
      [txn.id, params]
    );
    await client.query(`UPDATE payment SET status='FAILED', note='Invalid VNPAY signature' WHERE id=$1 AND status='PENDING'`, [txn.payment_id]);
  });
};

const buildCreateResponseFromRows = (payment: DbRow, transaction: DbRow, reused = false) => ({
  provider: 'VNPAY' as const,
  reused,
  redirect_url: transaction.redirect_url as string,
  amount: toNumber(transaction.amount),
  currency: transaction.currency as string,
  payment,
  transaction
});

export const createVnpayPayment = async (
  invoiceId: string,
  tenantUserId: string,
  payload: CreateVnpayPaymentPayload,
  ipAddress: string
) =>
  withTransaction(async (client) => {
    const config = getConfiguredVnpay();

    const invRs = await client.query<DbRow>(
      `SELECT i.*
       FROM invoice i
       JOIN contract c ON c.id=i.contract_id
       JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE i.id=$1 AND t.user_id=$2
       FOR UPDATE OF i`,
      [invoiceId, tenantUserId]
    );
    const invoice = invRs.rows[0];
    if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      throw new AppError(409, 'Cannot pay a closed invoice', 'INVOICE_CLOSED');
    }

    const paidAmount = await getInvoicePaidAmount(client, invoiceId);
    const remainingAmount = toNumber(invoice.total) - paidAmount;
    if (remainingAmount <= 0) throw new AppError(409, 'Invoice is already fully paid', 'INVOICE_PAID');

    const activeTxn = await client.query<DbRow>(
      `SELECT
         p.*,
         pt.id AS transaction_id,
         pt.provider,
         pt.status AS transaction_status,
         pt.amount AS transaction_amount,
         pt.currency,
         pt.merchant_order_id,
         pt.redirect_url,
         pt.return_url,
         pt.ipn_url,
         pt.created_at AS transaction_created_at,
         pt.updated_at AS transaction_updated_at
       FROM payment p
       JOIN payment_transaction pt ON pt.payment_id=p.id
       WHERE p.invoice_id=$1
         AND p.status='PENDING'
         AND pt.provider='VNPAY'
         AND pt.status IN ('CREATED', 'REDIRECTED', 'PENDING')
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [invoiceId]
    );

    if (activeTxn.rows[0]?.redirect_url) {
      const row = activeTxn.rows[0];
      return {
        provider: 'VNPAY' as const,
        reused: true,
        redirect_url: row.redirect_url,
        amount: toNumber(row.transaction_amount),
        currency: row.currency,
        payment: {
          id: row.id,
          invoice_id: row.invoice_id,
          method: row.method,
          status: row.status,
          amount: toNumber(row.amount),
          paid_at: row.paid_at,
          reference_code: row.reference_code,
          note: row.note
        },
        transaction: {
          id: row.transaction_id,
          payment_id: row.id,
          provider: row.provider,
          status: row.transaction_status,
          amount: toNumber(row.transaction_amount),
          currency: row.currency,
          merchant_order_id: row.merchant_order_id,
          redirect_url: row.redirect_url,
          return_url: row.return_url,
          ipn_url: row.ipn_url,
          created_at: row.transaction_created_at,
          updated_at: row.transaction_updated_at
        }
      };
    }

    const amount = Math.round(remainingAmount);
    const merchantOrderId = generateMerchantOrderId(invoiceId);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + config.expireMinutes * 60 * 1000);

    const paymentRs = await client.query<DbRow>(
      `INSERT INTO payment(invoice_id,method,status,amount,reference_code,created_by_user_id,note)
       VALUES($1,'VNPAY','PENDING',$2,$3,$4,$5)
       RETURNING *`,
      [invoiceId, amount, merchantOrderId, tenantUserId, 'Created for VNPAY checkout']
    );
    const payment = paymentRs.rows[0];

    const unsignedParams: VnpayParams = {
      vnp_Version: config.version,
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Amount: String(amount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: merchantOrderId,
      vnp_OrderInfo: `Invoice ${invoiceId}`,
      vnp_OrderType: config.orderType,
      vnp_Locale: payload.locale ?? config.locale,
      vnp_ReturnUrl: config.returnUrl,
      vnp_IpnUrl: config.ipnUrl,
      vnp_IpAddr: ipAddress || '127.0.0.1',
      vnp_CreateDate: formatVnpayDate(createdAt),
      vnp_ExpireDate: formatVnpayDate(expiresAt)
    };

    if (payload.bank_code) {
      unsignedParams.vnp_BankCode = payload.bank_code;
    }

    const secureHash = signParams(unsignedParams, config.hashSecret);
    const redirectPayload = { ...unsignedParams, vnp_SecureHash: secureHash };
    const redirectUrl = buildRedirectUrl(config.paymentUrl, redirectPayload);

    const txnRs = await client.query<DbRow>(
      `INSERT INTO payment_transaction(
         payment_id,provider,status,amount,currency,merchant_order_id,redirect_url,return_url,ipn_url,request_payload,redirect_payload
       )
       VALUES($1,'VNPAY','CREATED',$2,'VND',$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [payment.id, amount, merchantOrderId, redirectUrl, config.returnUrl, config.ipnUrl, unsignedParams, redirectPayload]
    );

    return buildCreateResponseFromRows(payment, txnRs.rows[0]);
  });

const processVnpayNotification = async (params: VnpayParams): Promise<VnpayProcessResult> => {
  const merchantOrderId = params.vnp_TxnRef;
  if (!merchantOrderId) {
    return {
      code: 'ORDER_NOT_FOUND',
      message: 'Missing VNPAY order reference',
      success: false,
      status: 'FAILED',
      signature_valid: true,
      already_confirmed: false,
      invoice_id: null,
      payment_id: null,
      transaction_id: null,
      merchant_order_id: null,
      amount: null,
      paid_at: null,
      provider_txn_id: null
    };
  }

  return withTransaction(async (client) => {
    const txn = await findProcessableTransaction(client, merchantOrderId);
    if (!txn) {
      return {
        code: 'ORDER_NOT_FOUND',
        message: 'VNPAY transaction not found',
        success: false,
        status: 'FAILED',
        signature_valid: true,
        already_confirmed: false,
        invoice_id: null,
        payment_id: null,
        transaction_id: null,
        merchant_order_id: merchantOrderId,
        amount: null,
        paid_at: null,
        provider_txn_id: params.vnp_TransactionNo ?? null
      };
    }

    const gatewayAmount = Number(params.vnp_Amount ?? 0) / 100;
    const expectedAmount = Math.round(toNumber(txn.amount));
    if (Math.round(gatewayAmount) !== expectedAmount) {
      if (!terminalTxnStatuses.has(txn.status)) {
        await client.query(
          `UPDATE payment_transaction
           SET status='FAILED', callback_payload=$2, signature_valid=true, failed_reason='VNPAY amount mismatch'
           WHERE id=$1`,
          [txn.id, params]
        );
        await client.query(`UPDATE payment SET status='FAILED', note='VNPAY amount mismatch' WHERE id=$1 AND status='PENDING'`, [txn.payment_id]);
      }

      return {
        code: 'INVALID_AMOUNT',
        message: 'VNPAY amount does not match transaction amount',
        success: false,
        status: 'FAILED',
        signature_valid: true,
        already_confirmed: terminalTxnStatuses.has(txn.status),
        invoice_id: txn.invoice_id,
        payment_id: txn.payment_id,
        transaction_id: txn.id,
        merchant_order_id: merchantOrderId,
        amount: toNumber(txn.amount),
        paid_at: txn.paid_at ?? null,
        provider_txn_id: params.vnp_TransactionNo ?? null
      };
    }

    const alreadyConfirmed = terminalTxnStatuses.has(txn.status);
    const responseCode = params.vnp_ResponseCode;
    const transactionStatus = params.vnp_TransactionStatus;
    const isSucceeded = responseCode === '00' && transactionStatus === '00';
    const nextStatus = isSucceeded ? 'SUCCEEDED' : responseCode === '24' ? 'CANCELLED' : 'FAILED';
    const paidAt = isSucceeded ? parseVnpayDate(params.vnp_PayDate) ?? new Date() : null;
    const providerTxnId = params.vnp_TransactionNo ?? null;
    const providerRef = params.vnp_BankTranNo ?? providerTxnId;

    if (!alreadyConfirmed) {
      await client.query(
        `UPDATE payment_transaction
         SET status=$2,
             provider_txn_id=$3,
             provider_ref=$4,
             callback_payload=$5,
             signature_valid=true,
             paid_at=$6,
             failed_reason=$7
         WHERE id=$1`,
        [
          txn.id,
          nextStatus,
          providerTxnId,
          providerRef,
          params,
          paidAt,
          isSucceeded ? null : `VNPAY response ${responseCode ?? 'unknown'}`
        ]
      );

      await client.query(
        `UPDATE payment
         SET status=$2,
             paid_at=$3,
             reference_code=$4,
             note=$5
         WHERE id=$1`,
        [
          txn.payment_id,
          nextStatus,
          paidAt,
          providerTxnId ?? merchantOrderId,
          isSucceeded ? 'Paid via VNPAY' : `VNPAY response ${responseCode ?? 'unknown'}`
        ]
      );

      if (isSucceeded) {
        const paidAmount = await getInvoicePaidAmount(client, txn.invoice_id);
        if (paidAmount >= toNumber(txn.invoice_total)) {
          await client.query(`UPDATE invoice SET status='PAID' WHERE id=$1 AND status NOT IN ('PAID', 'VOID')`, [txn.invoice_id]);
        }
      }
    } else {
      await client.query(
        `UPDATE payment_transaction
         SET callback_payload=$2, signature_valid=true, provider_txn_id=COALESCE(provider_txn_id, $3), provider_ref=COALESCE(provider_ref, $4)
         WHERE id=$1`,
        [txn.id, params, providerTxnId, providerRef]
      );
    }

    return {
      code: isSucceeded ? 'PAYMENT_SUCCEEDED' : nextStatus === 'CANCELLED' ? 'PAYMENT_CANCELLED' : 'PAYMENT_FAILED',
      message: isSucceeded ? 'Payment succeeded' : nextStatus === 'CANCELLED' ? 'Payment was cancelled' : 'Payment failed',
      success: isSucceeded,
      status: nextStatus,
      signature_valid: true,
      already_confirmed: alreadyConfirmed,
      invoice_id: txn.invoice_id,
      payment_id: txn.payment_id,
      transaction_id: txn.id,
      merchant_order_id: merchantOrderId,
      amount: toNumber(txn.amount),
      paid_at: paidAt ? paidAt.toISOString() : txn.paid_at ?? null,
      provider_txn_id: providerTxnId
    };
  });
};

export const verifyVnpayReturn = async (input: Record<string, unknown>) => {
  const config = getConfiguredVnpay();
  const params = normalizeVnpayParams(input);
  const signatureValid = verifySignature(params, config.hashSecret);

  if (!signatureValid) {
    await markInvalidSignature(params);
    return {
      code: 'INVALID_SIGNATURE',
      message: 'Invalid VNPAY signature',
      success: false,
      status: 'FAILED' as const,
      signature_valid: false,
      already_confirmed: false,
      invoice_id: null,
      payment_id: null,
      transaction_id: null,
      merchant_order_id: params.vnp_TxnRef ?? null,
      amount: params.vnp_Amount ? Number(params.vnp_Amount) / 100 : null,
      paid_at: null,
      provider_txn_id: params.vnp_TransactionNo ?? null
    };
  }

  return processVnpayNotification(params);
};

export const handleVnpayIpn = async (input: Record<string, unknown>) => {
  const result = await verifyVnpayReturn(input);

  if (!result.signature_valid) {
    return { RspCode: '97', Message: 'Invalid signature' };
  }
  if (result.code === 'ORDER_NOT_FOUND') {
    return { RspCode: '01', Message: 'Order not found' };
  }
  if (result.code === 'INVALID_AMOUNT') {
    return { RspCode: '04', Message: 'Invalid amount' };
  }
  if (result.already_confirmed) {
    return { RspCode: '02', Message: 'Order already confirmed' };
  }

  return { RspCode: '00', Message: 'Confirm Success' };
};
