const express = require("express");
const crypto = require("crypto");
const { BlackjackManager } = require("../services/blackjackManager");
const walletModel = require("../models/walletModel");
const statsModel = require("../models/statsModel");
const betHistoryModel = require("../models/betHistoryModel");

const SUITS = ["S", "H", "D", "C"];
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

function isTenValue(rank) {
  return rank === "10" || rank === "J" || rank === "Q" || rank === "K";
}
function normalizeRankForSplit(rank) {
  return isTenValue(rank) ? "T" : rank;
}

function createDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
}
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function draw(game) {
  const c = game.deck.pop();
  if (!c) throw new Error("DECK_EMPTY");
  return c;
}

function handTotals(cards) {
  let total = 0;
  let aces = 0;

  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      total += 1;
    } else if (isTenValue(c.rank)) {
      total += 10;
    } else {
      total += Number(c.rank) || 0;
    }
  }

  const hard = total;

  let best = total;
  let upgraded = 0;
  while (aces - upgraded > 0 && best + 10 <= 21) {
    best += 10;
    upgraded++;
  }

  const soft = upgraded > 0 ? best : null;
  return { hard, soft };
}

function bestTotal(cards) {
  const { hard, soft } = handTotals(cards);
  return soft ?? hard;
}
function dealerUpcardIsAce(game) {
  return game?.dealer?.cards?.[0]?.rank === "A";
}

function insuranceBetCash(game) {
  const bet = Number(game?.betCash || 0);
  return bet > 0 ? bet / 2 : 0;
}

function insurancePending(game) {
  return !!game?.insurance?.pending;
}
function isNaturalBlackjack(cards) {
  return cards.length === 2 && bestTotal(cards) === 21;
}
function dealerShouldHit(cards) {
  const { hard, soft } = handTotals(cards);
  const total = soft ?? hard;

  if (total < 17) return true;

  if (total === 17 && soft === 17) return true;
  return false;
}

function canSplit(game) {
  if (!game || game.phase !== "player") return false;
  if (game.splitActive) return false;
  const h = game.hands?.[0];
  if (!h || h.done) return false;
  if (h.cards.length !== 2) return false;
  const r1 = normalizeRankForSplit(h.cards[0].rank);
  const r2 = normalizeRankForSplit(h.cards[1].rank);
  return !!r1 && r1 === r2;
}
function canDouble(game, handIndex) {
  if (!game || game.phase !== "player") return false;
  const h = game.hands?.[handIndex];
  if (!h || h.done) return false;
  if (h.doubled) return false;
  return h.cards.length === 2;
}

function markHandDone(game, handIndex) {
  game.hands[handIndex].done = true;

  if (game.splitActive) {
    if (handIndex === 0 && !game.hands[1].done) {
      game.activeHandIndex = 1;
      return;
    }
  }

  const handCount = game.splitActive ? 2 : 1;
  const allDone = Array.from({ length: handCount }).every(
    (_, i) => game.hands[i].done,
  );

  if (allDone) {
    game.phase = "dealer";
    game.dealer.holeHidden = false;
  }
}

function settle(game) {
  const handCount = game.splitActive ? 2 : 1;

  const playerTotals = [];
  const playerBusts = [];
  const playerBJs = [];

  for (let i = 0; i < handCount; i++) {
    const total = bestTotal(game.hands[i].cards);
    playerTotals[i] = total;
    playerBusts[i] = total > 21;
    playerBJs[i] = isNaturalBlackjack(game.hands[i].cards);
  }

  game.dealer.holeHidden = false;

  const dealerBJ = isNaturalBlackjack(game.dealer.cards);

  const anyNonBJPlayerAlive = Array.from({ length: handCount }).some((_, i) => {
    return !playerBusts[i] && !playerBJs[i];
  });

  if (anyNonBJPlayerAlive && !dealerBJ) {
    while (dealerShouldHit(game.dealer.cards)) {
      game.dealer.cards.push(draw(game));
    }
  }

  const dealerTotal = bestTotal(game.dealer.cards);
  const dealerBust = dealerTotal > 21;

  const outcomes = [];
  const payoutsCash = [];
  let net = 0;

  for (let i = 0; i < handCount; i++) {
    const h = game.hands[i];
    const bet = Number(h.betCash || 0);

    const playerTotal = playerTotals[i];
    const playerBust = playerBusts[i];
    const playerBJ = isNaturalBlackjack(h.cards);

    let outcome = "loss";
    let credit = 0;

    if (playerBust) {
      outcome = "loss";
      credit = 0;
    } else if (playerBJ) {
      outcome = "win";
      credit = bet * 2.5;
    } else if (dealerBJ) {
      outcome = "loss";
      credit = 0;
    } else if (dealerBust) {
      outcome = "win";
      credit = bet * 2;
    } else {
      if (playerTotal > dealerTotal) {
        outcome = "win";
        credit = bet * 2;
      } else if (playerTotal < dealerTotal) {
        outcome = "loss";
        credit = 0;
      } else {
        outcome = "push";
        credit = bet;
      }
    }

    outcomes.push(outcome);
    payoutsCash.push(credit);
    net += credit - bet;
  }

  game.phase = "resolved";
  game.result = { outcomes, payoutsCash, netCash: net };
}

function maybeAutoResolveNaturals(game) {
  const playerBJ = isNaturalBlackjack(game.hands[0].cards);
  const dealerBJ = isNaturalBlackjack(game.dealer.cards);

  if (playerBJ || dealerBJ) {
    game.dealer.holeHidden = false;
    settle(game);
    return true;
  }
  return false;
}

function sanitizeForClient(game) {
  if (!game) return null;

  const g = JSON.parse(JSON.stringify(game));

  delete g.deck;

  if (
    g.phase === "player" &&
    g.dealer?.holeHidden &&
    g.dealer.cards?.length >= 2
  ) {
    g.dealer.cards[1] = { hidden: true };
  }

  g.dealer.cards = (g.dealer.cards || []).map((c) => {
    if (c?.hidden) return { hidden: true };
    return { rank: c.rank, suit: c.suit };
  });

  g.hands = (g.hands || []).map((h) => ({
    cards: (h.cards || []).map((c) => ({ rank: c.rank, suit: c.suit })),
    betCash: Number(h.betCash || 0),
    done: !!h.done,
    doubled: !!h.doubled,
  }));

  return g;
}

function createNewGame({ betCash }) {
  const deck = shuffle(createDeck());

  const game = {
    id: crypto.randomUUID(),
    phase: "player",
    betCash: Number(betCash || 0),
    deck,
    dealer: { cards: [], holeHidden: true },
    hands: [
      { cards: [], betCash: Number(betCash || 0), done: false, doubled: false },
      { cards: [], betCash: 0, done: true, doubled: false },
    ],
    splitActive: false,
    activeHandIndex: 0,
    result: null,

    insurance: {
      eligible: false,
      pending: false,
      taken: null,
      betCash: 0,
      resolved: false,
      payoutCash: 0,
      payoutApplied: false,
    },
    stats: {
      startApplied: false,
      splitCountApplied: 0,
      doubleCountApplied: 0,
      insuranceWagerApplied: false,
      resolveApplied: false,
    },
  };

  game.hands[0].cards.push(draw(game));
  game.dealer.cards.push(draw(game));
  game.hands[0].cards.push(draw(game));
  game.dealer.cards.push(draw(game));

  const playerBJ = isNaturalBlackjack(game.hands[0].cards);
  if (playerBJ) {
    game.dealer.holeHidden = false;
    settle(game);
    return game;
  }

  if (dealerUpcardIsAce(game)) {
    game.insurance.eligible = true;
    game.insurance.pending = true;
    game.insurance.betCash = insuranceBetCash(game);

    return game;
  }

  maybeAutoResolveNaturals(game);
  return game;
}
function bjInsuranceBetCash(game) {
  const ins = game?.insurance;
  if (!ins?.taken) return 0;
  return Number(ins.betCash || 0);
}

function bjInsurancePayoutCash(game) {
  return Number(game?.insurance?.payoutCash || 0);
}

function bjNetIncludingInsurance(game) {
  const mainNet = Number(game?.result?.netCash || 0);
  const insBet = bjInsuranceBetCash(game);
  const insPay = bjInsurancePayoutCash(game);
  return mainNet + (insPay - insBet);
}
function applyAction(game, action) {
  if (!game) throw new Error("NO_ACTIVE_ROUND");
  if (game.phase === "resolved") throw new Error("ROUND_RESOLVED");

  if (game.phase === "dealer") {
    settle(game);
    return game;
  }

  if (game.phase !== "player") throw new Error("BAD_PHASE");

  const hi = Number(game.activeHandIndex || 0);
  const hand = game.hands?.[hi];
  if (!hand || hand.done) throw new Error("HAND_DONE");

  if (action === "hit") {
    hand.cards.push(draw(game));
    if (bestTotal(hand.cards) > 21) markHandDone(game, hi);
    if (game.phase === "dealer") settle(game);
    return game;
  }

  if (action === "stand") {
    markHandDone(game, hi);
    if (game.phase === "dealer") settle(game);
    return game;
  }

  if (action === "double") {
    if (!canDouble(game, hi)) throw new Error("CANNOT_DOUBLE");
    hand.doubled = true;

    hand.betCash = Number(hand.betCash || 0) * 2;

    hand.cards.push(draw(game));
    markHandDone(game, hi);
    if (game.phase === "dealer") settle(game);
    return game;
  }

  if (action === "split") {
    if (!canSplit(game)) throw new Error("CANNOT_SPLIT");

    const c1 = hand.cards[0];
    const c2 = hand.cards[1];

    game.splitActive = true;

    game.hands[0] = {
      cards: [c1],
      betCash: Number(game.betCash || 0),
      done: false,
      doubled: false,
    };
    game.hands[1] = {
      cards: [c2],
      betCash: Number(game.betCash || 0),
      done: false,
      doubled: false,
    };

    game.hands[0].cards.push(draw(game));
    game.hands[1].cards.push(draw(game));

    game.activeHandIndex = 0;
    return game;
  }

  throw new Error("UNKNOWN_ACTION");
}

function createBlackjackRoutes({
  pool,

  getBalanceCash,
  debitCash,
  creditCash,

  getUserId = (req) => req.user?.id ?? req.session?.userId,
} = {}) {
  if (!pool) throw new Error("createBlackjackRoutes requires { pool }");

  const manager = new BlackjackManager({
    pool,
    rejoinHours: 24,
  });

  const _getWalletBalanceCash = async (req) => {
    const userId = getUserId(req);
    const w = await walletModel.getWalletByUserId(userId);
    return Number(w?.balance || 0);
  };

  const _debitCash = async (req, amtCash) => {
    const userId = getUserId(req);
    const w = await walletModel.debitWalletCash(userId, amtCash);
    return Number(w?.balance || 0);
  };

  const _creditCash = async (req, amtCash) => {
    const userId = getUserId(req);
    const w = await walletModel.creditWalletCash(userId, amtCash);
    return Number(w?.balance || 0);
  };
  const router = express.Router();
  router.use(express.json());

  router.get("/state", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const active = await manager.getActiveGameOrNull(userId);
      if (!active) return res.json({ ok: true, state: null });

      return res.json({ ok: true, state: buildClientState(active.gameState) });
    } catch (e) {
      return res.json({ ok: false, error: "STATE_FAILED" });
    }
  });

  router.post("/start", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const betCash = Number(req.body?.betCash);
      if (!Number.isFinite(betCash) || betCash <= 0) {
        return res.json({ ok: false, error: "BAD_BET" });
      }

      const existing = await manager.getActiveGameOrNull(userId);

      if (existing?.gameState) {
        const gs = existing.gameState;

        if (gs.phase && gs.phase !== "resolved") {
          const w = await walletModel.getWalletByUserId(userId);
          const balanceCash = Number(w?.balance || 0);

          const client = buildClientState(gs);
          client.walletBalanceCash = balanceCash;

          return res.json({ ok: true, state: client });
        }

        if (typeof manager.clearActiveGame === "function") {
          await manager.clearActiveGame(userId);
        } else if (typeof manager.markInactive === "function") {
          await manager.markInactive(existing.sessionId);
        } else if (typeof manager.deleteSession === "function") {
          await manager.deleteSession(existing.sessionId);
        }
      }

      let newBalanceCash = 0;
      try {
        const w = await walletModel.debitWalletCash(userId, betCash);
        newBalanceCash = Number(w?.balance || 0);
        await statsModel.ensureUserStatsRow(userId);
      } catch (e) {
        if (
          e?.code === "INSUFFICIENT_FUNDS" ||
          e?.message === "INSUFFICIENT_FUNDS"
        ) {
          return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });
        }
        throw e;
      }

      const game = createNewGame({ betCash });
      game.stats = game.stats || {};
      if (!game.stats.startApplied) {
        await statsModel.addWagerEvent(userId, betCash, 1);
        game.stats.startApplied = true;
      }

      if (game.phase === "resolved") {
        await applyResolutionStatsOnce({ userId, game });
        game.result = game.result || {};
        const alreadyApplied = !!game.result.payoutApplied;

        if (!alreadyApplied) {
          const totalCredit = (game.result?.payoutsCash || []).reduce(
            (a, b) => a + Number(b || 0),
            0,
          );

          if (totalCredit > 0) {
            const w2 = await walletModel.creditWalletCash(userId, totalCredit);
            newBalanceCash = Number(w2?.balance || 0);
          }

          game.result.payoutApplied = true;
        }
        await applyBetHistoryOnce({ userId, game });
      }

      const dbStatus = game.phase === "resolved" ? "resolved" : "active";

      await manager.upsertGame({
        userId,
        status: dbStatus,
        betAmountCash: betCash,
        gameState: game,
      });

      const client = buildClientState(game);
      client.walletBalanceCash = newBalanceCash;

      return res.json({ ok: true, state: client });
    } catch (e) {
      console.error("[/blackjack/start] failed:", e);
      return res.json({
        ok: false,
        error: e?.message || "START_FAILED",
        code: e?.code || null,
      });
    }
  });

  router.post("/action", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json({ ok: false, error: "UNAUTHENTICATED" });

      const action = String(req.body?.action || "");
      if (!action) return res.json({ ok: false, error: "BAD_ACTION" });

      const active = await manager.getActiveGameOrNull(userId);
      if (!active) return res.json({ ok: false, error: "NO_ACTIVE_ROUND" });

      const { sessionId, version, gameState } = active;

      if (gameState?.phase === "resolved") {
        gameState.result = gameState.result || {};
        gameState.stats = gameState.stats || {};

        let changed = false;

        if (!gameState.result.payoutApplied) {
          const totalCredit = (gameState.result?.payoutsCash || []).reduce(
            (a, b) => a + Number(b || 0),
            0,
          );
          if (totalCredit > 0) {
            await walletModel.creditWalletCash(userId, totalCredit);
          }
          gameState.result.payoutApplied = true;
          changed = true;
        }

        if (!gameState.stats.resolveApplied) {
          await applyResolutionStatsOnce({ userId, game: gameState });
          changed = true;
        }
        await applyBetHistoryOnce({ userId, game: gameState });
        changed = true;

        if (changed) {
          await manager.saveGameState({
            sessionId,
            expectedVersion: version,
            status: "resolved",
            betAmountCash: Number(gameState.betCash || 0),
            gameState,
          });
        }

        const w = await walletModel.getWalletByUserId(userId);
        const client = buildClientState(gameState);
        client.walletBalanceCash = Number(w?.balance || 0);
        return res.json({ ok: true, state: client });
      }

      const ins = gameState?.insurance;

      if (gameState?.phase === "player" && ins?.pending) {
        const isInsYes = action === "insurance_yes";
        const isInsNo = action === "insurance_no";

        if (!isInsYes && !isInsNo) {
          return res.json({ ok: false, error: "INSURANCE_PENDING" });
        }

        ins.pending = false;
        ins.eligible = true;
        ins.taken = isInsYes;
        ins.resolved = true;

        const insBet = Number(ins.betCash || 0);

        if (isInsYes && insBet > 0) {
          gameState.stats = gameState.stats || {};

          if (!gameState.stats.insuranceWagerApplied) {
            await walletModel.debitWalletCash(userId, insBet);

            await statsModel.ensureUserStatsRow(userId);
            await statsModel.addToTotalWageredOnly(userId, insBet);

            gameState.stats.insuranceWagerApplied = true;
          }
        }

        const dealerBJ = isNaturalBlackjack(gameState.dealer.cards);

        if (dealerBJ) {
          if (isInsYes && insBet > 0) {
            const creditAmt = insBet * 3;

            if (!ins.payoutApplied) {
              await walletModel.creditWalletCash(userId, creditAmt);
              ins.payoutCash = creditAmt;
              ins.payoutApplied = true;
            }
          }

          if (gameState.phase !== "resolved") {
            gameState.dealer.holeHidden = false;
            settle(gameState);
          }
        } else {
          ins.payoutCash = 0;
          ins.payoutApplied = !!ins.payoutApplied;
        }

        if (gameState.phase === "resolved") {
          gameState.result = gameState.result || {};
          gameState.stats = gameState.stats || {};

          if (!gameState.result.payoutApplied) {
            const totalCredit = (gameState.result?.payoutsCash || []).reduce(
              (a, b) => a + Number(b || 0),
              0,
            );

            if (totalCredit > 0) {
              await walletModel.creditWalletCash(userId, totalCredit);
            }
            gameState.result.payoutApplied = true;
          }
          await applyBetHistoryOnce({ userId, game: gameState });

          if (!gameState.stats.resolveApplied) {
            await applyResolutionStatsOnce({ userId, game: gameState });
          }
        }

        const newStatus =
          gameState.phase === "resolved" ? "resolved" : "active";

        await manager.saveGameState({
          sessionId,
          expectedVersion: version,
          status: newStatus,
          betAmountCash: Number(gameState.betCash || 0),
          gameState,
        });

        const w = await walletModel.getWalletByUserId(userId);
        const client = buildClientState(gameState);
        client.walletBalanceCash = Number(w?.balance || 0);

        return res.json({ ok: true, state: client });
      }

      if (action === "split") {
        const baseBet = Number(gameState.betCash || 0);
        if (!Number.isFinite(baseBet) || baseBet <= 0) {
          return res.json({ ok: false, error: "BAD_BET" });
        }
        if (!canSplit(gameState))
          return res.json({ ok: false, error: "CANNOT_SPLIT" });

        await walletModel.debitWalletCash(userId, baseBet);
        gameState.stats = gameState.stats || {
          startApplied: false,
          splitCountApplied: 0,
          doubleCountApplied: 0,
          resolveApplied: false,
        };

        if (gameState.stats.splitCountApplied < 1) {
          await statsModel.addWagerEvent(userId, baseBet, 1);
          gameState.stats.splitCountApplied = 1;
        }
      }

      if (action === "double") {
        const hi = Number(gameState.activeHandIndex || 0);
        const h = gameState.hands?.[hi];
        if (!h || h.done) return res.json({ ok: false, error: "HAND_DONE" });
        if (!canDouble(gameState, hi))
          return res.json({ ok: false, error: "CANNOT_DOUBLE" });

        const extra = Number(h.betCash || 0);
        if (!Number.isFinite(extra) || extra <= 0)
          return res.json({ ok: false, error: "BAD_BET" });

        await walletModel.debitWalletCash(userId, extra);
        gameState.stats = gameState.stats || {
          startApplied: false,
          splitCountApplied: 0,
          doubleCountApplied: 0,
          resolveApplied: false,
        };

        await statsModel.addWagerEvent(userId, extra, 1);
        gameState.stats.doubleCountApplied =
          Number(gameState.stats.doubleCountApplied || 0) + 1;
      }

      const next = applyAction(gameState, action);

      if (next.phase === "resolved") {
        next.result = next.result || {};
        next.stats = next.stats || {};

        if (!next.result.payoutApplied) {
          const totalCredit = (next.result?.payoutsCash || []).reduce(
            (a, b) => a + Number(b || 0),
            0,
          );
          if (totalCredit > 0)
            await walletModel.creditWalletCash(userId, totalCredit);
          next.result.payoutApplied = true;
        }

        if (!next.stats.resolveApplied) {
          await applyResolutionStatsOnce({ userId, game: next });
        }

        await applyBetHistoryOnce({ userId, game: next });
      }

      const newStatus = next.phase === "resolved" ? "resolved" : "active";

      await manager.saveGameState({
        sessionId,
        expectedVersion: version,
        status: newStatus,
        betAmountCash: Number(next.betCash || 0),
        gameState: next,
      });

      const w = await walletModel.getWalletByUserId(userId);
      const client = buildClientState(next);
      client.walletBalanceCash = Number(w?.balance || 0);

      return res.json({ ok: true, state: client });
    } catch (e) {
      const msg = String(e?.message || "");

      if (
        e?.code === "INSUFFICIENT_FUNDS" ||
        msg.includes("INSUFFICIENT_FUNDS")
      ) {
        return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });
      }
      if (msg.includes("CANNOT_")) return res.json({ ok: false, error: msg });
      if (e?.code === "CONFLICT_VERSION" || msg === "CONFLICT_VERSION") {
        return res.json({ ok: false, error: "CONFLICT_VERSION" });
      }

      console.error("[/blackjack/action] failed:", e);
      return res.json({ ok: false, error: "ACTION_FAILED" });
    }
  });

  return router;
}
function scoreTextForCards(cards) {
  const t = handTotals(cards);

  return t.soft != null ? `${t.hard}/${t.soft}` : `${t.hard}`;
}

function buildAllowedActions(game) {
  if (!game || game.phase !== "player") {
    return {
      hit: false,
      stand: false,
      split: false,
      doubleHand0: false,
      doubleHand1: false,
    };
  }

  if (insurancePending(game)) {
    return {
      hit: false,
      stand: false,
      split: false,
      doubleHand0: false,
      doubleHand1: false,
    };
  }

  return {
    hit: true,
    stand: true,
    split: canSplit(game),
    doubleHand0: canDouble(game, 0),
    doubleHand1: game.splitActive ? canDouble(game, 1) : false,
  };
}

function buildClientState(game) {
  const g = sanitizeForClient(game);

  const isSplit = !!g.splitActive;
  const p1 = g.hands?.[0]?.cards || [];
  const p2 = g.hands?.[1]?.cards || [];

  const dealerCardsVisible = (g.dealer?.cards || []).filter((c) => !c.hidden);

  const total = (cards) => bestTotal(cards);
  const isBust = (cards) => total(cards) > 21;
  const isBJ = (cards) => isNaturalBlackjack(cards);

  const outcomes = game?.result?.outcomes || [];

  const tagForHand = (idx, cards) => {
    if (isBust(cards)) return "Bust";
    if (isBJ(cards)) return "Blackjack";

    if (g.hands?.[idx]?.doubled) return "Double";

    if (g.hands?.[idx]?.done) return "Stand";

    if (g.phase === "resolved") {
      const o = String(outcomes[idx] || "").toLowerCase();
      if (o === "win") return "Win";
      if (o === "push") return "Push";
    }

    return null;
  };
  const handPayload = (idx, cards) => ({
    cards,
    betCash: Number(game.hands?.[idx]?.betCash || g.hands?.[idx]?.betCash || 0),
    done: !!g.hands?.[idx]?.done,
    doubled: !!g.hands?.[idx]?.doubled,
    outcome: g.phase === "resolved" ? outcomes[idx] || null : null,
    tag: tagForHand(idx, cards),
  });
  const ins = game.insurance || null;

  const insurance = ins
    ? {
        eligible: !!ins.eligible,
        pending: !!ins.pending,
        taken: ins.taken,
        betCash: Number(ins.betCash || 0),
        resolved: !!ins.resolved,
        payoutCash: Number(ins.payoutCash || 0),
      }
    : {
        eligible: false,
        pending: false,
        taken: null,
        betCash: 0,
        resolved: false,
        payoutCash: 0,
      };
  return {
    betCash: Number(game.betCash || g.betCash || 0),

    roundActive: g.phase !== "resolved",
    allowedActions: buildAllowedActions(game),

    dealer: { cards: g.dealer.cards },

    player: {
      isSplit,
      activeHandIndex: Number(g.activeHandIndex || 0),
      hands: [handPayload(0, p1), ...(isSplit ? [handPayload(1, p2)] : [])],
    },

    dealerScoreText: scoreTextForCards(dealerCardsVisible),
    playerScoreText: scoreTextForCards(p1),
    player2ScoreText: isSplit ? scoreTextForCards(p2) : "0",

    phase: g.phase,
    result: g.result || null,
    insurance,
  };
}
async function applyResolutionStatsOnce({ userId, game }) {
  game.stats = game.stats || {};
  if (game.stats.resolveApplied) return;
  const net = bjNetIncludingInsurance(game);

  const profitAdd = net > 0 ? net : 0;
  const lossAdd = net < 0 ? Math.abs(net) : 0;

  const outcomes = game?.result?.outcomes || [];
  const handCount = game.splitActive ? 2 : 1;

  let betsWonAdd = 0;
  let betsLostAdd = 0;

  for (let i = 0; i < handCount; i++) {
    const h = game.hands?.[i];
    const outcome = String(outcomes[i] || "").toLowerCase();

    const wagerEventsForHand = h?.doubled ? 2 : 1;

    if (outcome === "win") betsWonAdd += wagerEventsForHand;
    else if (outcome === "loss") betsLostAdd += wagerEventsForHand;
  }

  await statsModel.ensureUserStatsRow(userId);
  await statsModel.applyResolution(userId, {
    profitAdd,
    lossAdd,
    betsWonAdd,
    betsLostAdd,
  });

  game.stats.resolveApplied = true;
}
function bjComputeBetTotalCash(game) {
  const handCount = game?.splitActive ? 2 : 1;
  let sum = 0;
  for (let i = 0; i < handCount; i++) {
    sum += Number(game?.hands?.[i]?.betCash || 0);
  }
  return sum;
}

function bjComputePayoutTotalCash(game) {
  const main = (game?.result?.payoutsCash || []).reduce(
    (a, b) => a + Number(b || 0),
    0,
  );

  const ins = Number(game?.insurance?.payoutCash || 0);

  return main + ins;
}

async function applyBetHistoryOnce({ userId, game }) {
  game.result = game.result || {};
  if (game.result.historyApplied) return;

  const mainBet = bjComputeBetTotalCash(game);
  const insBet = bjInsuranceBetCash(game);

  const mainPayout = (game?.result?.payoutsCash || []).reduce(
    (a, b) => a + Number(b || 0),
    0,
  );
  const insPayout = bjInsurancePayoutCash(game);

  const betTotalCash = mainBet + insBet;
  const payoutTotalCash = mainPayout + insPayout;

  const netProfitCash = bjNetIncludingInsurance(game);

  const result =
    netProfitCash > 0 ? "win" : netProfitCash < 0 ? "loss" : "even";

  await betHistoryModel.addBetHistoryRow(userId, {
    game: "blackjack",
    betTotal: betTotalCash,
    result,
    payoutTotal: payoutTotalCash,
    netProfit: netProfitCash,
    meta: {
      outcomes: game?.result?.outcomes || [],
      payoutsCash: game?.result?.payoutsCash || [],
      splitActive: !!game?.splitActive,
      insurance: game?.insurance || null,
      dealer: game?.dealer?.cards || null,
      hands: (game?.hands || []).map((h) => ({
        betCash: h.betCash,
        cards: h.cards,
      })),
    },
  });

  game.result.historyApplied = true;
}
module.exports = { createBlackjackRoutes };
