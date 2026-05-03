const nodemailer = require('nodemailer');
const logger = require('../config/logger');

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendResetPasswordEmail(email, resetUrl) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('SMTP não configurado — email não enviado');
    logger.info(`[DEV] Reset URL: ${resetUrl}`);
    return;
  }

  const transporter = createTransport();

  await transporter.sendMail({
    from: `"TigreBet 🐯" <${process.env.SMTP_USER}>`,
    to: email,
    subject: '🔑 Recuperação de senha — TigreBet',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:24px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td align="center" style="padding:40px 40px 32px;background:linear-gradient(135deg,#1a0800,#0a0a0a);">
            <div style="font-size:56px;line-height:1;">🐯</div>
            <h1 style="margin:12px 0 4px;color:#f59e0b;font-size:28px;font-weight:900;letter-spacing:-0.5px;">TigreBet</h1>
            <p style="margin:0;color:#6b7280;font-size:13px;">Recuperação de senha</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="color:#e5e7eb;font-size:16px;line-height:1.6;margin:0 0 24px;">
              Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
              <tr><td align="center">
                <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#000;font-size:16px;font-weight:900;text-decoration:none;padding:16px 40px;border-radius:16px;letter-spacing:0.5px;">
                  🔑 REDEFINIR SENHA
                </a>
              </td></tr>
            </table>

            <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 12px;">
              ⏰ Este link expira em <strong style="color:#f59e0b;">1 hora</strong>.
            </p>
            <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
              Se você não solicitou a redefinição, ignore este email. Sua senha permanece a mesma.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;color:#4b5563;font-size:12px;text-align:center;">
              © 2026 TigreBet · tigrebet.roleplaymedellin.com.br
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  });

  logger.info(`Email de reset enviado para: ${email}`);
}

module.exports = { sendResetPasswordEmail };
