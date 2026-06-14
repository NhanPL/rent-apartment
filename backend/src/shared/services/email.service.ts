import nodemailer from 'nodemailer';
import { env } from '../../config/env';

interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface TenantWelcomePayload {
  to: string;
  tenantName: string;
  loginUrl: string;
  username: string;
  password: string;
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

export const sendEmail = async (payload: SendEmailPayload): Promise<void> => {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('SMTP is not configured; skipping email send.', {
      to: payload.to,
      subject: payload.subject
    });
    return;
  }

  await mailer.sendMail({
    from: `"${env.SMTP_FROM_NAME || 'Rent Apartment'}" <${env.SMTP_FROM_EMAIL}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html
  });
};

export const sendTenantWelcomeEmail = async (payload: TenantWelcomePayload): Promise<void> => {
  const subject = 'Your Rental Account';
  const html = `
    <p>Hello ${payload.tenantName},</p>
    <p>Your account has been created.</p>
    <p>Login URL: <a href="${payload.loginUrl}">${payload.loginUrl}</a></p>
    <p>Username: ${payload.username}</p>
    <p>Password: ${payload.password}</p>
    <p>Please change your password after first login.</p>
  `;

  await sendEmail({ to: payload.to, subject, html });
};
