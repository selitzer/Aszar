const pool = require("../config/db");
async function getUserStats(userId) {
  const [rows] = await pool.query(
    `SELECT
        user_id,
        total_wagered,
        bets_total,
        bets_won,
        bets_lost,
        profit_total,
        loss_total
     FROM user_stats
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );

  return rows[0] || null;
}
async function ensureUserStatsRow(userId) {
  const sql = `INSERT IGNORE INTO user_stats (user_id) VALUES (?)`;
  await pool.query(sql, [userId]);
}

async function addWagerEvent(userId, wagerCash, betEvents = 1) {
  const w = Number(wagerCash || 0);
  const b = Number(betEvents || 0);

  const sql = `
    INSERT INTO user_stats (user_id, bets_total, total_wagered)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      bets_total = bets_total + VALUES(bets_total),
      total_wagered = total_wagered + VALUES(total_wagered)
  `;
  await pool.query(sql, [userId, b, w]);
}

async function applyResolution(
  userId,
  { profitAdd = 0, lossAdd = 0, betsWonAdd = 0, betsLostAdd = 0 },
) {
  const p = Number(profitAdd || 0);
  const l = Number(lossAdd || 0);
  const bw = Number(betsWonAdd || 0);
  const bl = Number(betsLostAdd || 0);

  const sql = `
    UPDATE user_stats
    SET profit_total = profit_total + ?,
        loss_total   = loss_total + ?,
        bets_won     = bets_won + ?,
        bets_lost    = bets_lost + ?,
        updated_at   = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `;
  await pool.query(sql, [p, l, bw, bl, userId]);
}
async function addToTotalWageredOnly(userId, wagerCash) {
  const w = Number(wagerCash || 0);
  const sql = `
    INSERT INTO user_stats (user_id, total_wagered)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
      total_wagered = total_wagered + VALUES(total_wagered)
  `;
  await pool.query(sql, [userId, w]);
}
module.exports = {
  ensureUserStatsRow,
  addWagerEvent,
  applyResolution,
  addToTotalWageredOnly,
  getUserStats,
};
