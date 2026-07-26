import nodemailer from 'nodemailer';
import { env } from '../../config/env';

interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface TenantActivationPayload {
  to: string;
  tenantName: string;
  activationUrl: string;
  username: string;
  expiresAt: string;
}

interface PasswordResetPayload {
  to: string;
  resetUrl: string;
  expiresAt: string;
}

interface PasswordChangedPayload {
  to: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

const isSmtpConfigured = (): boolean =>
  Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM_EMAIL);

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

export const sendEmail = async (payload: SendEmailPayload): Promise<boolean> => {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('SMTP is not configured; skipping email send.', {
      to: payload.to,
      subject: payload.subject
    });
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
  const subject = 'Activate your rental account';
  const tenantName = escapeHtml(payload.tenantName);
  const activationUrl = escapeHtml(payload.activationUrl);
  const username = escapeHtml(payload.username);
  const expiresAt = escapeHtml(new Date(payload.expiresAt).toLocaleString('en-US', { timeZone: 'UTC' }));
  const html = `
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
  const subject = 'Reset your rental account password';
  const resetUrl = escapeHtml(payload.resetUrl);
  const expiresAt = escapeHtml(new Date(payload.expiresAt).toLocaleString('en-US', { timeZone: 'UTC' }));
  const html = `
    <p>We received a request to reset your rental account password.</p>
    <p><a href="${resetUrl}">Reset password</a></p>
    <p>This link expires at ${expiresAt} UTC and can only be used once.</p>
    <p>If you did not request a password reset, you can ignore this email.</p>
  `;

  return sendEmail({ to: payload.to, subject, html });
};

export const sendPasswordChangedEmail = async (payload: PasswordChangedPayload): Promise<boolean> => {
  const subject = 'Your rental account password was changed';
  const html = `
    <p>Your rental account password has been changed successfully.</p>
    <p>All existing sessions have been signed out.</p>
    <p>If you did not make this change, contact your property manager immediately.</p>
  `;

  return sendEmail({ to: payload.to, subject, html });
};
