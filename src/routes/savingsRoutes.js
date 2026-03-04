const express = require("express");
const router = express.Router();
const pool = require("../config/db");

function asMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

async function listAccounts(userId) {
  const [rows] = await pool.query(
    "SELECT id, name, balance FROM savings_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 6",
    [userId],
  );
  return rows;
}

router.get("/", async (req, res) => {
  const userId = req.session.userId;
  const accounts = await listAccounts(userId);
  res.json({ ok: true, accounts });
});

router.post("/", async (req, res) => {
  const userId = req.session.userId;
  const name = String(req.body?.name || "")
    .trim()
    .slice(0, 48);
  const deposit = asMoney(req.body?.deposit);

  if (!name)
    return res.status(400).json({ ok: false, message: "Name required." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[cnt]] = await conn.query(
      "SELECT COUNT(*) AS c FROM savings_accounts WHERE user_id = ?",
      [userId],
    );
    if (Number(cnt.c) >= 6) {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, message: "Max of 6 accounts reached." });
    }

    if (deposit > 0) {
      const [r] = await conn.query(
        "UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND balance >= ?",
        [deposit, userId, deposit],
      );
      if (r.affectedRows === 0) {
        await conn.rollback();
        return res
          .status(400)
          .json({ ok: false, message: "Insufficient funds." });
      }
    }

    const [ins] = await conn.query(
      "INSERT INTO savings_accounts (user_id, name, balance) VALUES (?, ?, ?)",
      [userId, name, deposit],
    );

    const [[wallet]] = await conn.query(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [userId],
    );

    await conn.commit();

    const accounts = await listAccounts(userId);
    res.json({
      ok: true,
      accountId: ins.insertId,
      balance: Number(wallet.balance),
      accounts,
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    res.status(500).json({ ok: false, message: "Server error." });
  } finally {
    conn.release();
  }
});

router.post("/:id/deposit", async (req, res) => {
  const userId = req.session.userId;
  const id = req.params.id;
  const amount = asMoney(req.body?.amount);

  if (amount <= 0)
    return res.status(400).json({ ok: false, message: "Enter an amount." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[acct]] = await conn.query(
      "SELECT id, balance FROM savings_accounts WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, userId],
    );
    if (!acct) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Account not found." });
    }

    const [r] = await conn.query(
      "UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND balance >= ?",
      [amount, userId, amount],
    );
    if (r.affectedRows === 0) {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, message: "Insufficient funds." });
    }

    await conn.query(
      "UPDATE savings_accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
      [amount, id, userId],
    );

    const [[wallet]] = await conn.query(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [userId],
    );
    const [[updated]] = await conn.query(
      "SELECT id, name, balance FROM savings_accounts WHERE id = ? AND user_id = ?",
      [id, userId],
    );

    await conn.commit();
    res.json({ ok: true, balance: Number(wallet.balance), account: updated });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    res.status(500).json({ ok: false, message: "Server error." });
  } finally {
    conn.release();
  }
});

router.post("/:id/withdraw", async (req, res) => {
  const userId = req.session.userId;
  const id = req.params.id;
  const amount = asMoney(req.body?.amount);

  if (amount <= 0)
    return res.status(400).json({ ok: false, message: "Enter an amount." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[acct]] = await conn.query(
      "SELECT id, balance FROM savings_accounts WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, userId],
    );
    if (!acct) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Account not found." });
    }

    if (Number(acct.balance) < amount) {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, message: "Insufficient funds in this account." });
    }

    await conn.query(
      "UPDATE savings_accounts SET balance = balance - ? WHERE id = ? AND user_id = ?",
      [amount, id, userId],
    );

    await conn.query(
      "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
      [amount, userId],
    );

    const [[wallet]] = await conn.query(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [userId],
    );
    const [[updated]] = await conn.query(
      "SELECT id, name, balance FROM savings_accounts WHERE id = ? AND user_id = ?",
      [id, userId],
    );

    await conn.commit();
    res.json({ ok: true, balance: Number(wallet.balance), account: updated });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    res.status(500).json({ ok: false, message: "Server error." });
  } finally {
    conn.release();
  }
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId;
  const id = req.params.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[acct]] = await conn.query(
      "SELECT id, balance FROM savings_accounts WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, userId],
    );
    if (!acct) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Account not found." });
    }

    const refund = Number(acct.balance) || 0;

    await conn.query(
      "DELETE FROM savings_accounts WHERE id = ? AND user_id = ?",
      [id, userId],
    );

    if (refund > 0) {
      await conn.query(
        "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
        [refund, userId],
      );
    }

    const [[wallet]] = await conn.query(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [userId],
    );
    await conn.commit();

    const accounts = await listAccounts(userId);
    res.json({
      ok: true,
      balance: Number(wallet.balance),
      accounts,
      refunded: refund,
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    res.status(500).json({ ok: false, message: "Server error." });
  } finally {
    conn.release();
  }
});

module.exports = router;
