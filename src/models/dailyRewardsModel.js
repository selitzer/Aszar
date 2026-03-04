const pool = require("../config/db");

async function ensureRow(userId, conn = pool) {
  await conn.query("INSERT IGNORE INTO daily_rewards (user_id) VALUES (?)", [
    userId,
  ]);
}

async function getRowForUpdate(userId, conn) {
  const [rows] = await conn.query(
    `SELECT user_id, streak, last_claim_date,
            CURDATE() AS today,
            DATE_SUB(CURDATE(), INTERVAL 1 DAY) AS yesterday
     FROM daily_rewards
     WHERE user_id = ?
     FOR UPDATE`,
    [userId],
  );
  return rows[0] || null;
}

async function getRow(userId) {
  await ensureRow(userId);
  const [rows] = await pool.query(
    `SELECT user_id, streak, last_claim_date,
            CURDATE() AS today,
            DATE_SUB(CURDATE(), INTERVAL 1 DAY) AS yesterday
     FROM daily_rewards
     WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || null;
}

async function setRow(userId, { streak, lastClaimDate }, conn = pool) {
  await conn.query(
    "UPDATE daily_rewards SET streak = ?, last_claim_date = ? WHERE user_id = ?",
    [streak, lastClaimDate, userId],
  );
}

module.exports = {
  ensureRow,
  getRow,
  getRowForUpdate,
  setRow,
};
