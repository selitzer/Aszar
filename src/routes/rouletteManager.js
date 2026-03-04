"use strict";

class RouletteManager {
  constructor({ pool } = {}) {
    if (!pool) throw new Error("RouletteManager requires { pool }");
    this.pool = pool;
  }

  async getRowByUserId(userId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM roulette_sessions WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    return rows?.[0] || null;
  }

  async upsertSession({
    userId,
    status,
    betTotalCash,
    stateObj,
    winningNumber,
    spinStartedAt,
    spinDurationMs,
    payoutTotalReturn = 0,
    payoutNetProfit = 0,
    payoutApplied = 0,
  }) {
    const stateJson = JSON.stringify(stateObj);

    const sql = `
      INSERT INTO roulette_sessions
        (user_id, status, bet_total, bets_json, winning_number, spin_started_at, spin_duration_ms,
         payout_total_return, payout_net_profit, payout_applied, version)
      VALUES
        (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        bet_total = VALUES(bet_total),
        bets_json = VALUES(bets_json),
        winning_number = VALUES(winning_number),
        spin_started_at = VALUES(spin_started_at),
        spin_duration_ms = VALUES(spin_duration_ms),
        payout_total_return = VALUES(payout_total_return),
        payout_net_profit = VALUES(payout_net_profit),
        payout_applied = VALUES(payout_applied),
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
    `;

    await this.pool.query(sql, [
      userId,
      status,
      Number(betTotalCash || 0),
      stateJson,
      Number(winningNumber),
      spinStartedAt,
      Number(spinDurationMs),
      Number(payoutTotalReturn || 0),
      Number(payoutNetProfit || 0),
      Number(payoutApplied ? 1 : 0),
    ]);

    return this.getRowByUserId(userId);
  }

  async saveWithVersion({ userId, expectedVersion, patch }) {
    const sql = `
      UPDATE roulette_sessions
      SET
        status = COALESCE(?, status),
        bet_total = COALESCE(?, bet_total),
        bets_json = COALESCE(CAST(? AS JSON), bets_json),
        payout_total_return = COALESCE(?, payout_total_return),
        payout_net_profit   = COALESCE(?, payout_net_profit),
        payout_applied      = COALESCE(?, payout_applied),
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
      WHERE user_id = ? AND version = ?
    `;

    const [r] = await this.pool.query(sql, [
      patch.status ?? null,
      patch.betTotal ?? null,
      patch.betsJson ?? null,
      patch.payoutTotalReturn ?? null,
      patch.payoutNetProfit ?? null,
      patch.payoutApplied ?? null,
      userId,
      expectedVersion,
    ]);

    if (r.affectedRows === 0) {
      const err = new Error("CONFLICT_VERSION");
      err.code = "CONFLICT_VERSION";
      throw err;
    }

    return this.getRowByUserId(userId);
  }
}

module.exports = RouletteManager;
