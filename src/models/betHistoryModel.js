"use strict";

const pool = require("../config/db");

async function addBetHistoryRow(
  userId,
  { game, betTotal, result, payoutTotal, netProfit, meta = null },
) {
  const insertSql = `
    INSERT INTO user_bet_history
      (user_id, game, bet_total, result, payout_total, net_profit, meta_json)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.query(insertSql, [
    userId,
    String(game || "roulette"),
    Number(betTotal || 0),
    String(result || "loss"),
    Number(payoutTotal || 0),
    Number(netProfit || 0),
    meta ? JSON.stringify(meta) : null,
  ]);

  const pruneSql = `
    DELETE FROM user_bet_history
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM (
          SELECT id
          FROM user_bet_history
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        ) keep
      )
  `;
  await pool.query(pruneSql, [userId, userId]);
}

async function getRecentBetHistory(userId, limit = 50) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));

  const [rows] = await pool.query(
    `
      SELECT
        id,
        game,
        bet_total,
        result,
        payout_total,
        net_profit,
        meta_json,
        created_at
      FROM user_bet_history
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [userId, lim],
  );

  return rows;
}

module.exports = {
  addBetHistoryRow,
  getRecentBetHistory,
};
