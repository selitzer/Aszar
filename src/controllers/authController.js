const authService = require("../services/authService");
const userModel = require("../models/userModel");
const passwordResetModel = require("../models/passwordResetModel");
const { sendPasswordResetEmail } = require("../services/emailService");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

async function register(req, res) {
  const { username, email, password } = req.body || {};
  const result = await authService.register({ username, email, password });

  if (!result.ok) {
    return res
      .status(result.status)
      .json({ ok: false, message: result.message });
  }

  req.session.userId = result.userId;
  return res.json({ ok: true, userId: result.userId });
}

async function login(req, res) {
  const { identifier, password } = req.body || {};
  const result = await authService.login({ identifier, password });

  if (!result.ok) {
    return res
      .status(result.status)
      .json({ ok: false, message: result.message });
  }

  req.session.userId = result.userId;
  return res.json({ ok: true, userId: result.userId });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
}

async function me(req, res) {
  if (!req.session.userId) return res.status(401).json({ ok: false });

  const user = await userModel.findUserById(req.session.userId);
  if (!user) return res.status(401).json({ ok: false });

  return res.json({
    ok: true,
    userId: user.id,
    username: user.username,
    email: user.email,
  });
}
async function forgotPassword(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const generic = {
      ok: true,
      message: "If that email exists, a reset link has been sent.",
    };

    if (!email || !email.includes("@") || email.length > 255) {
      return res.json(generic);
    }

    const user = await userModel.findUserByEmail(email);
    if (!user) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await passwordResetModel.createResetToken({
      userId: user.id,
      rawToken,
      expiresAt,
    });

    const resetUrl = `${process.env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;

    sendPasswordResetEmail(email, resetUrl).catch((err) =>
      console.error("Reset email failed:", err.message),
    );

    return res.json(generic);
  } catch (err) {
    console.error(err);
    return res.json({
      ok: true,
      message: "If that email exists, a reset link has been sent.",
    });
  }
}
async function changePassword(req, res) {
  try {
    if (!req.session.userId)
      return res.status(401).json({ ok: false, message: "Unauthorized." });

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({
          ok: false,
          message: "Password must be at least 8 characters.",
        });
    }

    const user = await userModel.findUserById(req.session.userId);
    const hash = await userModel.getPasswordHashById(req.session.userId);

    if (!user || !hash)
      return res.status(401).json({ ok: false, message: "Unauthorized." });

    const ok = await bcrypt.compare(currentPassword, hash);
    if (!ok)
      return res
        .status(400)
        .json({ ok: false, message: "Current password is incorrect." });

    const newHash = await bcrypt.hash(newPassword, 12);
    await userModel.updatePasswordHash(user.id, newHash);

    return res.json({ ok: true, message: "Password updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}
async function resetPassword(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token || token.length < 20) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid or expired reset link." });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({
          ok: false,
          message: "Password must be at least 6 characters.",
        });
    }

    const record = await passwordResetModel.findByRawToken(token);
    if (!record) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid or expired reset link." });
    }
    if (record.used) {
      return res
        .status(400)
        .json({ ok: false, message: "This reset link has already been used." });
    }

    const expiresAt = new Date(record.expires_at);
    if (Date.now() > expiresAt.getTime()) {
      return res
        .status(400)
        .json({
          ok: false,
          message: "Reset link expired. Please request a new one.",
        });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const updated = await userModel.updatePasswordHash(
      record.user_id,
      passwordHash,
    );
    if (!updated) {
      return res
        .status(400)
        .json({ ok: false, message: "User no longer exists." });
    }

    await passwordResetModel.markUsed(record.id);

    return res.json({ ok: true, message: "Password updated successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}
module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
};
