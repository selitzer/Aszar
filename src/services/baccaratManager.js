const DEFAULT_REJOIN_HOURS = 24;
const DEFAULT_AUTORESOLVE_SECONDS = 90;

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

class BaccaratManager {
  constructor({
    pool,
    rejoinHours = DEFAULT_REJOIN_HOURS,
    autoResolveSeconds = DEFAULT_AUTORESOLVE_SECONDS,
  }) {
    if (!pool) throw new Error("BaccaratManager requires a mysql pool");
    this.pool = pool;
    this.rejoinHours = rejoinHours;
    this.autoResolveSeconds = autoResolveSeconds;
  }

  async getRowByUserId(userId, conn = null) {
    const sql = `
      SELECT id, user_id, status, bet_amount, state_json,
             last_action_at, auto_resolve_at, created_at, updated_at, version
      FROM baccarat_sessions
      WHERE user_id = ?
      LIMIT 1
    `;
    const [rows] = conn
      ? await conn.query(sql, [userId])
      : await this.pool.query(sql, [userId]);
    return rows?.[0] || null;
  }

  isExpiredForRejoin(row, now = new Date()) {
    if (!row) return false;
    if (row.status !== "active") return false;
    const last = new Date(row.last_action_at);
    const expires = addHours(last, this.rejoinHours);
    return now >= expires;
  }

  async markForfeitById(id, { conn = null } = {}) {
    const sql = `
      UPDATE baccarat_sessions
      SET status='forfeit',
          last_action_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP,
          version=version+1
      WHERE id=? AND status='active'
    `;
    const exec = conn ? conn.query.bind(conn) : this.pool.query.bind(this.pool);
    const [r] = await exec(sql, [id]);
    return r.affectedRows > 0;
  }

  async markResolvedById(id, { conn = null } = {}) {
    const sql = `
      UPDATE baccarat_sessions
      SET status='resolved',
          last_action_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP,
          version=version+1
      WHERE id=? AND status='active'
    `;
    const exec = conn ? conn.query.bind(conn) : this.pool.query.bind(this.pool);
    const [r] = await exec(sql, [id]);
    return r.affectedRows > 0;
  }

  async getActiveGameOrNull(userId) {
    const row = await this.getRowByUserId(userId);
    if (!row) return null;
    if (row.status !== "active") return null;

    if (this.isExpiredForRejoin(row)) {
      await this.markForfeitById(row.id);
      return { forfeited: true };
    }

    return {
      sessionId: row.id,
      row,
      gameState: safeJsonParse(row.state_json),
    };
  }

  async upsertActiveState(
    userId,
    { betAmount, gameState },
    { conn = null } = {},
  ) {
    const now = new Date();
    const autoStandAt = addSeconds(now, this.autoResolveSeconds);

    const sql = `
      INSERT INTO baccarat_sessions
        (user_id, status, bet_amount, state_json, last_action_at, auto_resolve_at, created_at, updated_at, version)
      VALUES
        (?, 'active', ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
      ON DUPLICATE KEY UPDATE
        status='active',
        bet_amount=VALUES(bet_amount),
        state_json=VALUES(state_json),
        last_action_at=CURRENT_TIMESTAMP,
        auto_resolve_at=VALUES(auto_resolve_at),
        updated_at=CURRENT_TIMESTAMP,
        version=version+1
    `;
    const exec = conn ? conn.query.bind(conn) : this.pool.query.bind(this.pool);
    await exec(sql, [
      userId,
      betAmount,
      JSON.stringify(gameState),
      autoStandAt,
    ]);
    const row = await this.getRowByUserId(userId, conn);
    return row;
  }

  async updateStateOptimistic(
    sessionId,
    expectedVersion,
    nextState,
    { conn = null } = {},
  ) {
    const sql = `
      UPDATE baccarat_sessions
      SET state_json=?,
          last_action_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP,
          version=version+1
      WHERE id=? AND version=? AND status='active'
    `;
    const exec = conn ? conn.query.bind(conn) : this.pool.query.bind(this.pool);
    const [r] = await exec(sql, [
      JSON.stringify(nextState),
      sessionId,
      expectedVersion,
    ]);
    return r.affectedRows > 0;
  }

  async clearActiveGame(userId) {
    await this.pool.query(`DELETE FROM baccarat_sessions WHERE user_id=?`, [
      userId,
    ]);
  }
}

module.exports = { BaccaratManager };
