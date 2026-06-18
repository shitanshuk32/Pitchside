const nodemailer = require("nodemailer");

// SMTP transport configured entirely from env vars so any provider works
// (Gmail app password, Resend, Brevo, Mailgun, ...):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional)
let transporter = null;

const isEmailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!transporter && isEmailConfigured()) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] SMTP not configured — skipping "${subject}" to ${to}`);
    return false;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || `Pitchside <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
  return true;
};

module.exports = { sendEmail, isEmailConfigured };
