const Mailjet = require("node-mailjet");

const mailjet = new Mailjet({
  apiKey: process.env.MJ_APIKEY_PUBLIC,
  apiSecret: process.env.MJ_APIKEY_PRIVATE,
});

function parseFrom(from) {
  const m = String(from || "").match(/^(.*)<(.+)>$/);
  if (!m) return { Email: String(from || ""), Name: "Aszar" };
  return { Name: m[1].trim().replace(/^"|"$/g, ""), Email: m[2].trim() };
}

async function sendMail({ to, subject, html }) {
  const from = parseFrom(process.env.MAIL_FROM);

  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: from,
        To: [{ Email: to }],
        Subject: subject,
        HTMLPart: html,
      },
    ],
  });
}

async function sendWelcomeEmail(to, username) {
  await sendMail({
    to,
    subject: "Welcome to Aszar 🎰",
    html: `
      <div style="font-family: Arial, sans-serif; background:#0e1519; color:rgb(252,242,224); padding:40px;">
        <div style="max-width:600px;margin:0 auto;">
          <h1 style="margin-bottom:10px;">Welcome to Aszar, ${username}.</h1>

          <p style="opacity:0.9;margin-bottom:30px;">
            Your account has been successfully created.
            Your starting balance is <strong>$1,000</strong>.
          </p>

          <a href="${process.env.APP_URL}"
             style="display:inline-block;padding:14px 24px;background:linear-gradient(90deg,#f59e0b,#d97706);
                    color:#1a1206;text-decoration:none;font-weight:bold;border-radius:10px;">
             Start Playing
          </a>

          <p style="margin-top:40px;font-size:13px;opacity:0.6;">© 2026 Aszar</p>
        </div>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(to, resetUrl) {
  await sendMail({
    to,
    subject: "Reset your Aszar password",
    html: `
      <div style="font-family: Arial, sans-serif; background:#0e1519; color:rgb(252,242,224); padding:40px;">
        <div style="max-width:600px;margin:0 auto;">
          <h2 style="margin-bottom:10px;">Reset your password</h2>

          <p style="opacity:0.9;margin-bottom:24px;">
            Click the button below to reset your password. This link expires in 1 hour.
          </p>

          <a href="${resetUrl}"
             style="display:inline-block;padding:14px 24px;background:linear-gradient(90deg,#f59e0b,#d97706);
                    color:#1a1206;text-decoration:none;font-weight:bold;border-radius:10px;">
             Reset Password
          </a>

          <p style="margin-top:28px;font-size:13px;opacity:0.6;">
            If you didn’t request this, you can ignore this email.
          </p>

          <p style="margin-top:28px;font-size:13px;opacity:0.6;">© 2026 Aszar</p>
        </div>
      </div>
    `,
  });
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };
