const DEFAULT_REJOIN_HOURS = 24;
const DEFAULT_AUTOSTAND_SECONDS = 90;

function nowUtcDate() {
  return new Date();
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600 * 1000);
}

function safeJsonParse(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

class BlackjackManager {
  constructor({
    pool,
    rejoinHours = DEFAULT_REJOIN_HOURS,
    autoStandSeconds = DEFAULT_AUTOSTAND_SECONDS,
  }) {
    if (!pool) throw new Error("BlackjackManager requires a mysql pool");
    this.pool = pool;
    this.rejoinHours = rejoinHours;
    this.autoStandSeconds = autoStandSeconds;
  }

  async getRowByUserId(userId, conn = null) {
    const sql = `
      SELECT id, user_id, status, bet_amount, state_json,
             last_action_at, auto_stand_at, created_at, updated_at, version
      FROM blackjack_sessions
      WHERE user_id = ?
      LIMIT 1
    `;
    const [rows] = conn
      ? await conn.query(sql, [userId])
      : await this.pool.query(sql, [userId]);
    return rows?.[0] || null;
  }

  async getRowById(id, conn = null) {
    const sql = `
      SELECT id, user_id, status, bet_amount, state_json,
             last_action_at, auto_stand_at, created_at, updated_at, version
      FROM blackjack_sessions
      WHERE id = ?
      LIMIT 1
    `;
    const [rows] = conn
      ? await conn.query(sql, [id])
      : await this.pool.query(sql, [id]);
    return rows?.[0] || null;
  }

  isExpiredForRejoin(row, now = nowUtcDate()) {
    if (!row) return false;
    if (row.status !== "active") return false;
    const last = new Date(row.last_action_at);
    const expires = addHours(last, this.rejoinHours);
    return now >= expires;
  }

  async markForfeitById(id, { conn = null } = {}) {
    const sql = `
      UPDATE blackjack_sessions
      SET status = 'forfeit',
          last_action_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE id = ? AND status = 'active'
    `;
    const exec = conn ? conn.query.bind(conn) : this.pool.query.bind(this.pool);
    const [r] = await exec(sql, [id]);
    return r.affectedRows > 0;
  }

  async markResolvedById(id, { conn = null } = {}) {
    const sql = `
      UPDATE blackjack_sessions
      SET status = 'resolved',
          last_action_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE id = ? AND status = 'active'
    `;
    const exec = conn ? conn.query.bind(conn) : this.pool.query.bind(this.pool);
    const [r] = await exec(sql, [id]);
    return r.affectedRows > 0;
  }

  async loadForUser(userId) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const row = await this.getRowByUserId(userId, conn);
      if (!row) {
        await conn.commit();
        return { row: null, state: null, forfeited: false };
      }

      const now = nowUtcDate();
      if (this.isExpiredForRejoin(row, now)) {
        await this.markForfeitById(row.id, { conn });
        await conn.commit();
        return { row: null, state: null, forfeited: true };
      }

      await conn.commit();
      return { row, state: safeJsonParse(row.state_json), forfeited: false };
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  async upsertActiveGame({ userId, betAmountCash, gameState }) {
    const bet = Number(betAmountCash || 0);
    const stateJson = JSON.stringify(gameState);

    const sql = `
      INSERT INTO blackjack_sessions (user_id, status, bet_amount, state_json, last_action_at, auto_stand_at, version)
      VALUES (?, 'active', ?, CAST(? AS JSON), CURRENT_TIMESTAMP, (CURRENT_TIMESTAMP + INTERVAL ? SECOND), 1)
      ON DUPLICATE KEY UPDATE
        status = 'active',
        bet_amount = VALUES(bet_amount),
        state_json = VALUES(state_json),
        last_action_at = CURRENT_TIMESTAMP,
        auto_stand_at = (CURRENT_TIMESTAMP + INTERVAL ? SECOND),
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
    `;

    const [r] = await this.pool.query(sql, [
      userId,
      bet,
      stateJson,
      this.autoStandSeconds,
      this.autoStandSeconds,
    ]);

    const row = await this.getRowByUserId(userId);
    return row;
  }

  async saveGameState({
    sessionId,
    expectedVersion,
    status = "active",
    betAmountCash,
    gameState,
  }) {
    const bet = Number(betAmountCash || 0);
    const stateJson = JSON.stringify(gameState);

    const sql = `
      UPDATE blackjack_sessions
      SET status = ?,
          bet_amount = ?,
          state_json = CAST(? AS JSON),
          last_action_at = CURRENT_TIMESTAMP,
          auto_stand_at = (CURRENT_TIMESTAMP + INTERVAL ? SECOND),
          updated_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE id = ? AND version = ?
    `;

    const [r] = await this.pool.query(sql, [
      status,
      bet,
      stateJson,
      this.autoStandSeconds,
      sessionId,
      expectedVersion,
    ]);

    if (r.affectedRows === 0) {
      const err = new Error("CONFLICT_VERSION");
      err.code = "CONFLICT_VERSION";
      throw err;
    }

    return await this.getRowById(sessionId);
  }

  async listAutoStandDue({ limit = 50 } = {}) {
    const sql = `
      SELECT id, user_id, status, bet_amount, state_json,
             last_action_at, auto_stand_at, version
      FROM blackjack_sessions
      WHERE status = 'active'
        AND auto_stand_at <= CURRENT_TIMESTAMP
      ORDER BY auto_stand_at ASC
      LIMIT ?
    `;
    const [rows] = await this.pool.query(sql, [limit]);
    return rows.map((r) => ({
      ...r,
      state: safeJsonParse(r.state_json),
    }));
  }
  async upsertGame({ userId, status = "active", betAmountCash, gameState }) {
    const bet = Number(betAmountCash || 0);
    const stateJson = JSON.stringify(gameState);

    const sql = `
    INSERT INTO blackjack_sessions (user_id, status, bet_amount, state_json, last_action_at, auto_stand_at, version)
    VALUES (?, ?, ?, CAST(? AS JSON), CURRENT_TIMESTAMP, (CURRENT_TIMESTAMP + INTERVAL ? SECOND), 1)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      bet_amount = VALUES(bet_amount),
      state_json = VALUES(state_json),
      last_action_at = CURRENT_TIMESTAMP,
      auto_stand_at = (CURRENT_TIMESTAMP + INTERVAL ? SECOND),
      updated_at = CURRENT_TIMESTAMP,
      version = version + 1
  `;

    await this.pool.query(sql, [
      userId,
      status,
      bet,
      stateJson,
      this.autoStandSeconds,
      this.autoStandSeconds,
    ]);

    const row = await this.getRowByUserId(userId);
    return row;
  }

  async bumpAutoStand({ sessionId, expectedVersion }) {
    const sql = `
      UPDATE blackjack_sessions
      SET last_action_at = CURRENT_TIMESTAMP,
          auto_stand_at = (CURRENT_TIMESTAMP + INTERVAL ? SECOND),
          updated_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE id = ? AND version = ?
    `;
    const [r] = await this.pool.query(sql, [
      this.autoStandSeconds,
      sessionId,
      expectedVersion,
    ]);
    if (r.affectedRows === 0) {
      const err = new Error("CONFLICT_VERSION");
      err.code = "CONFLICT_VERSION";
      throw err;
    }
    return await this.getRowById(sessionId);
  }
  async clearActiveGame(userId) {
    const sql = `DELETE FROM blackjack_sessions WHERE user_id = ? LIMIT 1`;
    const [r] = await this.pool.query(sql, [userId]);
    return r.affectedRows > 0;
  }

  async forfeitExpired({ limit = 200 } = {}) {
    const sql = `
      UPDATE blackjack_sessions
      SET status = 'forfeit',
          updated_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE status = 'active'
        AND last_action_at <= (CURRENT_TIMESTAMP - INTERVAL ? HOUR)
      LIMIT ?
    `;
    const [r] = await this.pool.query(sql, [this.rejoinHours, limit]);
    return { forfeited: r.affectedRows || 0 };
  }
  async getLatestGameOrNull(userId) {
    const row = await this.getRowByUserId(userId);
    if (!row) return null;

    return {
      sessionId: row.id,
      version: row.version,
      betAmount: Number(row.bet_amount || 0),
      status: row.status,
      gameState: safeJsonParse(row.state_json),
      row,
    };
  }

  async getActiveGameOrNull(userId) {
    const { row, state, forfeited } = await this.loadForUser(userId);
    if (forfeited) return null;
    if (!row) return null;
    if (row.status !== "active") return null;

    return {
      sessionId: row.id,
      version: row.version,
      betAmount: Number(row.bet_amount || 0),
      status: row.status,
      gameState: state,
      row,
    };
  }
}

module.exports = { BlackjackManager };
