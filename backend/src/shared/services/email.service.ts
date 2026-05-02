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
  plainPassword: string;
}

export const sendEmail = async (payload: SendEmailPayload): Promise<void> => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured');
  }

  // Placeholder integration point for SMTP provider.
  // Kept abstract so credentials and implementation are managed outside business flow.
  console.info('Email queued', { to: payload.to, subject: payload.subject, hasHtml: Boolean(payload.html) });
};

export const sendTenantWelcomeEmail = async (payload: TenantWelcomePayload): Promise<void> => {
  const subject = 'Your Rental Account';
  const html = `
    <p>Hello ${payload.tenantName},</p>
    <p>Your account has been created.</p>
    <p>Login URL: ${payload.loginUrl}</p>
    <p>Username: ${payload.username}</p>
    <p>Password: ${payload.plainPassword}</p>
    <p>Please change your password after first login.</p>
  `;

  await sendEmail({ to: payload.to, subject, html });
};
