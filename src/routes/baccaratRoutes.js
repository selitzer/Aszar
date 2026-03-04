const express = require("express");
const { BaccaratManager } = require("../services/baccaratManager");
const { startRound } = require("../services/baccaratEngine");

const walletModel = require("../models/walletModel");
const statsModel = require("../models/statsModel");
const betHistoryModel = require("../models/betHistoryModel");

function sumBets(bets) {
  const p = Number(bets?.player || 0);
  const b = Number(bets?.banker || 0);
  const t = Number(bets?.tie || 0);
  return Math.round((p + b + t) * 100) / 100;
}

function normalizeBets(bets) {
  const out = {
    player: Number(bets?.player || 0),
    banker: Number(bets?.banker || 0),
    tie: Number(bets?.tie || 0),
  };
  for (const k of Object.keys(out)) {
    if (!Number.isFinite(out[k]) || out[k] < 0) throw new Error("BAD_BET");
  }
  const total = sumBets(out);
  if (!Number.isFinite(total) || total <= 0) throw new Error("BAD_BET");
  return out;
}

async function applyResolutionStatsOnce({ userId, state }) {
  state.stats = state.stats || {};
  if (state.stats.resolveApplied) return;

  const totalBet = sumBets(state.bets);
  const totalReturn = Number(state?.payout?.totalReturnCash || 0);
  const net = Math.round((totalReturn - totalBet) * 100) / 100;

  const profitAdd = net > 0 ? net : 0;
  const lossAdd = net < 0 ? Math.abs(net) : 0;

  const betsWonAdd = net > 0 ? 1 : 0;
  const betsLostAdd = net < 0 ? 1 : 0;

  await statsModel.ensureUserStatsRow(userId);
  await statsModel.applyResolution(userId, {
    profitAdd,
    lossAdd,
    betsWonAdd,
    betsLostAdd,
  });

  state.stats.resolveApplied = true;
}

async function applyBetHistoryOnce({ userId, state }) {
  state.history = state.history || {};
  if (state.history.applied) return;

  const betTotalCash = sumBets(state.bets);
  const payoutTotalCash = Number(state?.payout?.totalReturnCash || 0);
  const netProfitCash =
    Math.round((payoutTotalCash - betTotalCash) * 100) / 100;

  const result =
    netProfitCash > 0 ? "win" : netProfitCash < 0 ? "loss" : "even";

  await betHistoryModel.addBetHistoryRow(userId, {
    game: "baccarat",
    betTotal: betTotalCash,
    result,
    payoutTotal: payoutTotalCash,
    netProfit: netProfitCash,
    meta: {
      outcome: state.outcome,
      totals: state.totals,
      bets: state.bets,
      rules: state.rules,
      payout: state.payout,
    },
  });

  state.history.applied = true;
}

function createBaccaratRoutes({
  pool,
  getUserId = (req) => req.user?.id ?? req.session?.userId,
  decks = 8,
  bankerCommission = 0.05,
  tiePayout = 8,
} = {}) {
  if (!pool) throw new Error("createBaccaratRoutes requires { pool }");

  const router = express.Router();
  const manager = new BaccaratManager({
    pool,
    rejoinHours: 24,
    autoResolveSeconds: 90,
  });

  router.get("/state", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const active = await manager.getActiveGameOrNull(userId);
      if (!active || active?.forfeited)
        return res.json({ ok: true, state: null });

      return res.json({ ok: true, state: active.gameState });
    } catch {
      return res.json({ ok: false, error: "STATE_FAILED" });
    }
  });

  router.post("/start", async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const bets = normalizeBets(req.body?.bets);
      const totalBet = sumBets(bets);

      const existing = await manager.getActiveGameOrNull(userId);
      if (existing?.gameState) {
        if (
          existing.gameState.phase &&
          existing.gameState.phase !== "resolved"
        ) {
          return res.json({ ok: true, state: existing.gameState });
        }

        await manager.clearActiveGame(userId);
      }

      await conn.beginTransaction();

      try {
        await walletModel.debitWalletCash(userId, totalBet);
        await statsModel.ensureUserStatsRow(userId);
      } catch (e) {
        await conn.rollback();
        if (
          e?.code === "INSUFFICIENT_FUNDS" ||
          e?.message === "INSUFFICIENT_FUNDS"
        ) {
          return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });
        }
        throw e;
      }

      const round = startRound({
        existingShoe: null,
        decks,
        bankerCommission,
        tiePayout,
        bets,
      });

      round.stats = round.stats || {};
      if (!round.stats.startApplied) {
        await statsModel.addWagerEvent(userId, totalBet, 1);
        round.stats.startApplied = true;
      }

      const totalReturnCash = Number(round?.payout?.totalReturnCash || 0);
      if (totalReturnCash > 0) {
        await walletModel.creditWalletCash(userId, totalReturnCash);
      }

      const w = await walletModel.getWalletByUserId(userId);
      round.walletBalanceCash = Number(w?.balance || 0);

      await applyResolutionStatsOnce({ userId, state: round });
      await applyBetHistoryOnce({ userId, state: round });

      await manager.upsertActiveState(
        userId,
        { betAmount: totalBet, gameState: round },
        { conn },
      );
      const row = await manager.getRowByUserId(userId, conn);
      if (row?.id) await manager.markResolvedById(row.id, { conn });

      await conn.commit();
      return res.json({ ok: true, state: round });
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      return res.json({
        ok: false,
        error: e?.message === "BAD_BET" ? "BAD_BET" : "START_FAILED",
      });
    } finally {
      conn.release();
    }
  });

  router.post("/forfeit", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const active = await manager.getActiveGameOrNull(userId);
      if (!active?.sessionId) return res.json({ ok: true });

      await manager.markForfeitById(active.sessionId);
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: false, error: "FORFEIT_FAILED" });
    }
  });

  return router;
}

module.exports = { createBaccaratRoutes };
