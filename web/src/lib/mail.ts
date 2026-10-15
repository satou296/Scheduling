import nodemailer from "nodemailer";
import { prisma } from "./db";

function transporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/** メール送信。SMTP未設定時はコンソールに出力し、/dev/mails で確認できるよう記録する */
export async function sendMail(to: string, subject: string, body: string) {
  const t = transporter();
  let sent = false;
  if (t) {
    try {
      await t.sendMail({ from: process.env.MAIL_FROM, to, subject, text: body });
      sent = true;
    } catch (e) {
      console.error("sendMail failed", e);
    }
  } else {
    console.log(`[mail] to=${to} subject=${subject}\n${body}`);
  }
  await prisma.mailLog.create({ data: { to, subject, body, sent } });
}

export async function sendDeveloperAlert(subject: string, body: string) {
  const to = process.env.DEVELOPER_EMAIL;
  if (!to) {
    console.warn(`[developer-alert] ${subject}\n${body}`);
    return;
  }
  await sendMail(to, subject, body);
}
