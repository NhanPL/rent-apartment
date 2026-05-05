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

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE === 'true',
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

export const sendEmail = async (payload: SendEmailPayload): Promise<void> => {
  await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
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
