import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';

const calc = (q: number, p: number) => Number((q * p).toFixed(2));

export const createInvoiceFromReading = async (utilityReadingId: string, managerId: string) =>
  withTransaction(async (client) => {
    const readingRs = await client.query(
      `SELECT ur.*, b.id building_id FROM utility_reading ur
       JOIN room r ON r.id=ur.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ur.id=$1`,
      [utilityReadingId]
    );
    const reading = readingRs.rows[0];
    if (!reading) throw new AppError(404, 'Reading not found');
    if (reading.status !== 'APPROVED') throw new AppError(409, 'Reading must be APPROVED to invoice');

    const contractRs = await client.query(
      `SELECT * FROM contract WHERE room_id=$1 AND status='ACTIVE' ORDER BY start_date DESC LIMIT 1`,
      [reading.room_id]
    );
    const contract = contractRs.rows[0];
    if (!contract) throw new AppError(409, 'No active contract for room');

    const month = firstDayOfMonth(reading.month);
    const existed = await client.query('SELECT id FROM invoice WHERE contract_id=$1 AND month=$2', [contract.id, month]);
    if (existed.rows[0]) throw new AppError(409, 'Invoice already exists for contract/month');

    const rateRs = await client.query(
      `SELECT * FROM utility_rate WHERE building_id=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`,
      [reading.building_id, month]
    );
    const rate = rateRs.rows[0];
    if (!rate) throw new AppError(409, 'No utility rate configured');

    const elecUsage = Math.max(0, Number(reading.electricity_curr) - Number(reading.electricity_prev ?? 0));
    const waterUsage = Math.max(0, Number(reading.water_curr) - Number(reading.water_prev ?? 0));

    const elecAmount = calc(elecUsage, Number(rate.electricity_unit_price));
    const waterAmount = calc(waterUsage, Number(rate.water_unit_price));
    const rent = Number(contract.rent_price);

    const invRs = await client.query(
      `INSERT INTO invoice(contract_id, room_id, utility_reading_id, month, status, issued_at, due_date, subtotal, discount, total, approved_by_user_id, approved_at)
       VALUES($1,$2,$3,$4,'ISSUED',now(),$5,$6,0,$6,$7,now()) RETURNING *`,
      [contract.id, reading.room_id, reading.id, month, month, rent + elecAmount + waterAmount, managerId]
    );
    const invoice = invRs.rows[0];

    const items = [
      ['ROOM_RENT', 'Room rent', 1, rent, rent, { source: 'contract.rent_price' }],
      ['ELECTRICITY', 'Electricity', elecUsage, Number(rate.electricity_unit_price), elecAmount, { prev: reading.electricity_prev, curr: reading.electricity_curr }],
      ['WATER', 'Water', waterUsage, Number(rate.water_unit_price), waterAmount, { prev: reading.water_prev, curr: reading.water_curr }]
    ];

    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_item(invoice_id,code,name,quantity,unit_price,amount,meta)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [invoice.id, item[0], item[1], item[2], item[3], item[4], item[5]]
      );
    }

    await client.query(`UPDATE utility_reading SET status='INVOICED' WHERE id=$1`, [reading.id]);

    return invoice;
  });

export const addInvoiceAdjustment = async (invoiceId: string, amount: number, reason: string, userId: string) =>
  withTransaction(async (client) => {
    const invRs = await client.query('SELECT * FROM invoice WHERE id=$1', [invoiceId]);
    const inv = invRs.rows[0];
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (inv.status === 'PAID' || inv.status === 'VOID') throw new AppError(409, 'Cannot adjust closed invoice');

    const type = amount > 0 ? 'MANUAL_ADD' : 'MANUAL_DISCOUNT';
    await client.query(
      `INSERT INTO invoice_adjustment(invoice_id, adjustment_type, amount, reason, created_by_user_id)
       VALUES($1,$2,$3,$4,$5)`,
      [invoiceId, type, amount, reason, userId]
    );

    const total = Number(inv.total) + amount;
    if (total < 0) throw new AppError(400, 'Invoice total cannot be negative');

    const subtotal = Number(inv.subtotal) + (amount > 0 ? amount : 0);
    const discount = Number(inv.discount) + (amount < 0 ? Math.abs(amount) : 0);
    const updated = await client.query(
      `UPDATE invoice SET subtotal=$1, discount=$2, total=$3, adjustment_note=$4 WHERE id=$5 RETURNING *`,
      [subtotal, discount, total, reason, invoiceId]
    );
    return updated.rows[0];
  });

export const listInvoices = async () => (await query('SELECT * FROM invoice ORDER BY month DESC, created_at DESC')).rows;

export const getInvoiceDetail = async (id: string) => {
  const [invoice, items, adjustments] = await Promise.all([
    query('SELECT * FROM invoice WHERE id=$1', [id]),
    query('SELECT * FROM invoice_item WHERE invoice_id=$1 ORDER BY created_at', [id]),
    query('SELECT * FROM invoice_adjustment WHERE invoice_id=$1 ORDER BY created_at', [id])
  ]);
  if (!invoice.rows[0]) throw new AppError(404, 'Invoice not found');
  return { ...invoice.rows[0], items: items.rows, adjustments: adjustments.rows };
};
