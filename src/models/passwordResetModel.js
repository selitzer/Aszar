const crypto = require("crypto");
const pool = require("../config/db");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function createResetToken({ userId, rawToken, expiresAt }) {
  const tokenHash = sha256(rawToken);
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, used)
     VALUES (?, ?, ?, 0)`,
    [userId, tokenHash, expiresAt],
  );
}

async function findByRawToken(rawToken) {
  const tokenHash = sha256(rawToken);
  const [rows] = await pool.query(
    `SELECT id, user_id, expires_at, used
     FROM password_resets
     WHERE token_hash = ?
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] || null;
}

async function markUsed(resetId) {
  await pool.query(`UPDATE password_resets SET used = 1 WHERE id = ?`, [
    resetId,
  ]);
}

module.exports = { createResetToken, findByRawToken, markUsed };
