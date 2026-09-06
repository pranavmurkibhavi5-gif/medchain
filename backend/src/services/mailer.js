/**
 * Outbound email, used only for security notifications.
 *
 * Configured entirely through the environment. If no SMTP host is set the
 * service reports itself unavailable rather than pretending to send - and the
 * endpoints that depend on it say so plainly instead of showing a code entry
 * box that could never be satisfied.
 *
 * A deliberate omission: the code is never written to the logs, not even in
 * development. A one-time code sitting in a log file is the same problem as a
 * password sitting in one, and "it is only local" is how that habit starts.
 */
const nodemailer = require("nodemailer");
const config = require("../config");

let transport = null;
let lastError = "";

function isConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransport() {
  if (!isConfigured()) return null;
  if (transport) return transport;

  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    // 465 is implicit TLS; everything else upgrades with STARTTLS.
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transport;
}

/**
 * Send one message.
 * @returns {Promise<{sent: boolean, reason?: string}>} never throws, so a
 *          failure to email can never roll back something already committed.
 */
async function send({ to, subject, text, html }) {
  if (!isConfigured()) return { sent: false, reason: "not_configured" };

  try {
    await getTransport().sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject,
      text,
      html,
    });
    lastError = "";
    return { sent: true };
  } catch (err) {
    // Recorded for /api/health, without the message body or any code.
    lastError = err.message;
    console.error("[mail] send failed:", err.message);
    return { sent: false, reason: "send_failed" };
  }
}

/** The verification code email. Plain, short, and states the expiry. */
function verificationCode({ to, name, code, minutes }) {
  const greeting = name ? `Hello ${name},` : "Hello,";
  const text = [
    greeting,
    "",
    `Your MedChain verification code is: ${code}`,
    "",
    `It expires in ${minutes} minutes and can be used once.`,
    "",
    "This code was requested to change the password on your account. If that",
    "was not you, do not enter it - and change your password immediately,",
    "because someone else knows it.",
    "",
    "MedChain will never ask you for this code by phone or message.",
  ].join("\n");

  return send({
    to,
    subject: `${code} is your MedChain verification code`,
    text,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0f172a">
      <p>${greeting}</p>
      <p>Your MedChain verification code is:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:18px 0">${code}</p>
      <p>It expires in ${minutes} minutes and can be used once.</p>
      <p style="color:#b45309">This code was requested to change the password on your account.
      If that was not you, do not enter it &mdash; and change your password immediately,
      because someone else knows it.</p>
      <p style="color:#64748b;font-size:13px">MedChain will never ask you for this code by phone or message.</p>
    </div>`,
  });
}

function status() {
  return {
    configured: isConfigured(),
    host: config.smtp.host || "",
    lastError,
  };
}

module.exports = { send, verificationCode, isConfigured, status };
