import nodemailer, { type Transporter } from "nodemailer";

const globalForMail = globalThis as unknown as { _mailTransporter?: Transporter };

function getTransporter(): Transporter {
  if (globalForMail._mailTransporter) return globalForMail._mailTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured — SMTP_HOST, SMTP_USER, SMTP_PASSWORD must be set.");
  }

  globalForMail._mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return globalForMail._mailTransporter;
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const from = process.env.EMAIL_FROM || `TeamFlow <${process.env.SMTP_USER}>`;
  const transporter = getTransporter();
  await transporter.sendMail({ from, to: input.to, subject: input.subject, html: input.html, text: input.text });
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}
