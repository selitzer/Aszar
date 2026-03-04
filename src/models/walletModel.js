const pool = require("../config/db");

async function createWalletForUser(userId, startingBalance = 1000.0) {
  await pool.query("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [
    userId,
    startingBalance,
  ]);
}

async function getWalletByUserId(userId) {
  const [rows] = await pool.query(
    "SELECT user_id, balance FROM wallets WHERE user_id = ?",
    [userId],
  );
  return rows[0];
}

async function debitWalletCash(userId, amountCash) {
  const amt = Number(amountCash || 0);
  if (amt <= 0) return getWalletByUserId(userId);

  const [result] = await pool.query(
    "UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND balance >= ?",
    [amt, userId, amt],
  );

  if (result.affectedRows === 0) {
    const err = new Error("INSUFFICIENT_FUNDS");
    err.code = "INSUFFICIENT_FUNDS";
    throw err;
  }

  return getWalletByUserId(userId);
}

async function creditWalletCash(userId, amountCash) {
  const amt = Number(amountCash || 0);
  if (amt <= 0) return getWalletByUserId(userId);

  await pool.query(
    "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
    [amt, userId],
  );

  return getWalletByUserId(userId);
}

module.exports = {
  createWalletForUser,
  getWalletByUserId,
  debitWalletCash,
  creditWalletCash,
};
