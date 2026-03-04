"use strict";

const express = require("express");
const RouletteManager = require("./rouletteManager");
const walletModel = require("../models/walletModel");
const betHistoryModel = require("../models/betHistoryModel");

const {
  sanitizeBetsFromClient,
  randomWinningNumber,
  computeTotalReturn,
  buildSpinPlan,
} = require("./rouletteEngine");
const {
  ensureUserStatsRow,
  addWagerEvent,
  applyResolution,
} = require("../models/statsModel");

function parseState(row) {
  let obj = {};
  try {
    obj =
      typeof row.bets_json === "string"
        ? JSON.parse(row.bets_json)
        : row.bets_json || {};
  } catch {}
  return obj || {};
}

function buildClientState(row) {
  if (!row) return null;

  const state = parseState(row);

  const startedAtMs = new Date(row.spin_started_at).getTime();
  const durationMs = Number(row.spin_duration_ms || 0);
  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - startedAtMs);

  const phase =
    row.status === "resolved"
      ? "resolved"
      : elapsedMs >= durationMs
        ? "should_resolve"
        : "spinning";

  return {
    phase,
    version: Number(row.version || 1),

    betTotalCash: Number(row.bet_total || 0),
    bets: state.bets || [],

    spin: {
      winningNumber: Number(row.winning_number),
      spinStartedAtMs: startedAtMs,
      spinDurationMs: durationMs,

      fromIndex: Number(state.spin?.fromIndex ?? 0),
      targetIndex: Number(state.spin?.targetIndex ?? 0),
      totalTiles: Number(state.spin?.totalTiles ?? 0),

      bets: Array.isArray(state.spin?.bets) ? state.spin.bets : [],
    },

    payout: {
      totalReturnCash: Number(row.payout_total_return || 0),
      netProfitCash: Number(row.payout_net_profit || 0),
      payoutApplied: !!row.payout_applied,
    },
  };
}

async function maybeResolveIfDue({ manager, row, userId }) {
  if (!row) return row;
  if (row.status === "resolved") return row;

  const startedAtMs = new Date(row.spin_started_at).getTime();
  const durationMs = Number(row.spin_duration_ms || 0);
  const due = Date.now() >= startedAtMs + durationMs;
  if (!due) return row;

  const state = parseState(row);
  const bets = state.bets || [];

  const betTotalCash = Number(row.bet_total || 0);
  const winningNumber = Number(row.winning_number);

  const totalReturnCash = computeTotalReturn({ bets, winningNumber });
  const netProfitCash = totalReturnCash - betTotalCash;

  if (row.payout_applied) return row;

  const updated = await manager.saveWithVersion({
    userId,
    expectedVersion: Number(row.version || 1),
    patch: {
      status: "resolved",
      payoutTotalReturn: totalReturnCash,
      payoutNetProfit: netProfitCash,
      payoutApplied: 1,
    },
  });

  if (!updated) return row;

  let result = "loss";
  if (netProfitCash > 0) result = "win";
  else if (netProfitCash === 0) result = "even";

  await betHistoryModel.addBetHistoryRow(userId, {
    game: "roulette",
    betTotal: betTotalCash,
    result,
    payoutTotal: totalReturnCash,
    netProfit: netProfitCash,
    meta: { winningNumber, bets },
  });

  if (totalReturnCash > 0) {
    await walletModel.creditWalletCash(userId, totalReturnCash);
  }

  await ensureUserStatsRow(userId);

  if (netProfitCash > 0) {
    await applyResolution(userId, {
      profitAdd: netProfitCash,
      lossAdd: 0,
      betsWonAdd: 1,
      betsLostAdd: 0,
    });
  } else if (netProfitCash === 0) {
    await applyResolution(userId, {
      profitAdd: 0,
      lossAdd: 0,
      betsWonAdd: 0,
      betsLostAdd: 0,
    });
  } else {
    await applyResolution(userId, {
      profitAdd: 0,
      lossAdd: Math.abs(netProfitCash),
      betsWonAdd: 0,
      betsLostAdd: 1,
    });
  }

  return updated;
}

function createRouletteRoutes({
  pool,
  getUserId = (req) => req.session?.userId,
  defaultSpinDurationMs = 5200,
  spinDurationJitterMs = 1200,
} = {}) {
  if (!pool) throw new Error("createRouletteRoutes requires { pool }");

  const manager = new RouletteManager({ pool });
  const router = express.Router();
  router.use(express.json());

  router.get("/state", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      let row = await manager.getRowByUserId(userId);
      if (!row) return res.json({ ok: true, state: null });

      row = await maybeResolveIfDue({ manager, row, userId });

      const wallet = await walletModel.getWalletByUserId(userId);

      return res.json({
        ok: true,
        state: buildClientState(row),
        walletBalanceCash: Number(wallet?.balance || 0),
      });
    } catch (e) {
      console.error("[roulette/state] failed:", e);
      return res.json({ ok: false, error: "STATE_FAILED" });
    }
  });

  router.post("/spin", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const bets = sanitizeBetsFromClient(req.body?.bets);
      if (!bets.length) return res.json({ ok: false, error: "NO_BETS" });

      const betTotalCash = bets.reduce((a, b) => a + Number(b.total || 0), 0);
      if (!Number.isFinite(betTotalCash) || betTotalCash <= 0) {
        return res.json({ ok: false, error: "BAD_BET_TOTAL" });
      }

      let existing = await manager.getRowByUserId(userId);
      if (existing && existing.status === "spinning") {
        const startedAtMs = new Date(existing.spin_started_at).getTime();
        const durationMs = Number(existing.spin_duration_ms || 0);
        const stillSpinning = Date.now() < startedAtMs + durationMs;

        if (stillSpinning) {
          const wallet = await walletModel.getWalletByUserId(userId);
          return res.json({
            ok: true,
            rejoined: true,
            state: buildClientState(existing),
            walletBalanceCash: Number(wallet?.balance || 0),
          });
        }

        existing = await maybeResolveIfDue({ manager, row: existing, userId });
      }

      let fromIndex = 0;
      if (existing) {
        const st = parseState(existing);
        const prevTarget = Number(st?.spin?.targetIndex);
        if (Number.isFinite(prevTarget)) fromIndex = prevTarget;
      }

      await walletModel.debitWalletCash(userId, betTotalCash);
      await ensureUserStatsRow(userId);
      await addWagerEvent(userId, betTotalCash, 1);

      const winningNumber = randomWinningNumber();
      const spinDurationMs =
        defaultSpinDurationMs +
        Math.floor(Math.random() * Math.max(0, spinDurationJitterMs));

      const spinStartedAt = new Date();

      const spinPlan = buildSpinPlan({ fromIndex, winningNumber });

      const stateObj = {
        bets,
        spin: {
          ...spinPlan,
          bets,
        },
      };

      const row = await manager.upsertSession({
        userId,
        status: "spinning",
        betTotalCash,
        stateObj,
        winningNumber,
        spinStartedAt,
        spinDurationMs,
        payoutApplied: 0,
      });

      const wallet = await walletModel.getWalletByUserId(userId);

      return res.json({
        ok: true,
        state: buildClientState(row),
        walletBalanceCash: Number(wallet?.balance || 0),
      });
    } catch (e) {
      console.error("[roulette/spin] failed:", e);
      if (e?.code === "INSUFFICIENT_FUNDS")
        return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });
      if (e?.code === "CONFLICT_VERSION")
        return res.json({ ok: false, error: "CONFLICT_VERSION" });
      return res.json({ ok: false, error: "SPIN_FAILED" });
    }
  });

  return router;
}

module.exports = { createRouletteRoutes };
