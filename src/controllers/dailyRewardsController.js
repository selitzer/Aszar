const pool = require("../config/db");
const dailyRewardsModel = require("../models/dailyRewardsModel");

const REWARDS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];

function normalizeStreak(streak) {
  const s = Number(streak || 0);
  if (s < 0) return 0;
  if (s > 7) return 7;
  return s;
}
function toYMD(d) {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function computeStatus(row) {
  const today = toYMD(row.today);
  const yesterday = toYMD(row.yesterday);

  const last = row.last_claim_date ? toYMD(row.last_claim_date) : null;
  let streak = normalizeStreak(row.streak);

  if (last === today) {
    const dayIndex = Math.min(streak, 6);
    return {
      streak,
      canClaim: false,
      dayIndex,
      todayReward: REWARDS[dayIndex],
      lastClaimDate: last,
    };
  }

  if (last && last < yesterday) {
    streak = 0;
  }

  const dayIndex = Math.min(streak, 6);

  return {
    streak,
    canClaim: true,
    dayIndex,
    todayReward: REWARDS[dayIndex],
    lastClaimDate: last,
  };
}

async function status(req, res) {
  try {
    const userId = req.session?.userId;
    if (!userId)
      return res.status(401).json({ ok: false, message: "Not authenticated" });

    const row = await dailyRewardsModel.getRow(userId);
    if (!row)
      return res
        .status(500)
        .json({ ok: false, message: "Daily rewards unavailable" });

    const s = computeStatus(row);
    const last = row.last_claim_date ? toYMD(row.last_claim_date) : null;
    const yesterday = toYMD(row.yesterday);

    if (last && last < yesterday && row.streak !== 0) {
      await dailyRewardsModel.setRow(userId, {
        streak: 0,
        lastClaimDate: last,
      });
      s.streak = 0;
      s.dayIndex = 0;
      s.todayReward = REWARDS[0];
    }

    return res.json({ ok: true, ...s });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function claim(req, res) {
  const userId = req.session?.userId;
  if (!userId)
    return res.status(401).json({ ok: false, message: "Not authenticated" });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await dailyRewardsModel.ensureRow(userId, conn);

    const row = await dailyRewardsModel.getRowForUpdate(userId, conn);
    if (!row) {
      await conn.rollback();
      return res
        .status(500)
        .json({ ok: false, message: "Daily rewards unavailable" });
    }

    const s = computeStatus(row);

    if (!s.canClaim) {
      await conn.rollback();
      return res
        .status(409)
        .json({ ok: false, message: "Already claimed today" });
    }

    const amount = s.todayReward;
    const today = toYMD(row.today);
    await conn.query(
      "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
      [amount, userId],
    );
    const newStreak = Math.min(s.streak + 1, 7);
    await dailyRewardsModel.setRow(
      userId,
      { streak: newStreak, lastClaimDate: today },
      conn,
    );
    const [wRows] = await conn.query(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [userId],
    );
    const balance = wRows?.[0]?.balance ?? null;

    await conn.commit();

    return res.json({
      ok: true,
      amount,
      balance,
      streak: newStreak,
      lastClaimDate: today,
      canClaim: false,
    });
  } catch (err) {
    try {
      if (conn) await conn.rollback();
    } catch {}
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    try {
      if (conn) conn.release();
    } catch {}
  }
}

module.exports = { status, claim };
