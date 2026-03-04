const express = require("express");
const crypto = require("crypto");

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

function rankValue(rank) {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank) || 0;
}

function handTotals(cards) {
  let hard = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      hard += 1;
    } else if (
      isTenValue(c.rank) ||
      c.rank === "K" ||
      c.rank === "Q" ||
      c.rank === "J"
    ) {
      hard += 10;
    } else {
      hard += Number(c.rank) || 0;
    }
  }
  const soft = aces > 0 && hard + 10 <= 21 ? hard + 10 : null;
  return { hard, soft };
}

function bestTotal(cards) {
  const t = handTotals(cards);
  return t.soft ?? t.hard;
}

function isNaturalBlackjack(cards) {
  if (cards.length !== 2) return false;
  const t = handTotals(cards);
  return t.soft === 21;
}

function dealerShouldHit(cards) {
  const { hard, soft } = handTotals(cards);
  const total = soft ?? hard;
  if (total < 17) return true;

  if (total === 17 && soft === 17) return true;
  return false;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function sanitizeForClient(game) {
  if (!game) return null;

  const g = clone(game);

  delete g.deck;

  if (g.phase === "player" && g.dealer?.holeHidden) {
    if (g.dealer.cards && g.dealer.cards.length >= 2) {
      g.dealer.cards[1] = { hidden: true };
    }
  }

  if (g.dealer?.cards) {
    g.dealer.cards = g.dealer.cards.map((c) => {
      if (c && c.hidden) return { hidden: true };
      return { rank: c.rank, suit: c.suit };
    });
  }

  g.hands = (g.hands || []).map((h) => ({
    cards: (h.cards || []).map((c) => ({ rank: c.rank, suit: c.suit })),
    betCash: h.betCash,
    done: !!h.done,
    doubled: !!h.doubled,
  }));

  return g;
}

function draw(game) {
  const c = game.deck.pop();
  if (!c) throw new Error("DECK_EMPTY");
  return c;
}

function canSplit(game) {
  if (!game || game.phase !== "player") return false;
  if (game.splitActive) return false;
  const h = game.hands?.[0];
  if (!h || h.done) return false;
  if (h.cards.length !== 2) return false;
  const r1 = normalizeRankForSplit(h.cards[0].rank);
  const r2 = normalizeRankForSplit(h.cards[1].rank);
  return r1 && r2 && r1 === r2;
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
    if (handIndex === 1 && !game.hands[0].done) {
      game.activeHandIndex = 0;
      return;
    }
  }

  const allDone = game.hands
    .filter((_, idx) => (idx === 1 ? game.splitActive : true))
    .every((h) => h.done);

  if (allDone) {
    game.phase = "dealer";
    game.dealer.holeHidden = false;
  }
}
function settle(game) {
  while (dealerShouldHit(game.dealer.cards)) {
    game.dealer.cards.push(draw(game));
  }

  const dealerTotal = bestTotal(game.dealer.cards);
  const dealerBust = dealerTotal > 21;
  const dealerBJ = isNaturalBlackjack(game.dealer.cards);

  const outcomes = [];
  const payoutsCash = [];

  let net = 0;

  const handCount = game.splitActive ? 2 : 1;

  for (let i = 0; i < handCount; i++) {
    const h = game.hands[i];
    const bet = Number(h.betCash || 0);

    const playerTotal = bestTotal(h.cards);
    const playerBust = playerTotal > 21;
    const playerBJ = isNaturalBlackjack(h.cards);

    let outcome = "loss";
    let payout = 0;

    if (playerBust) {
      outcome = "loss";
      payout = 0;
    } else if (playerBJ && !dealerBJ) {
      outcome = "win";
      payout = bet * 2.5;
    } else if (dealerBJ && playerBJ) {
      outcome = "push";
      payout = bet;
    } else if (dealerBust) {
      outcome = "win";
      payout = bet * 2;
    } else {
      if (playerTotal > dealerTotal) {
        outcome = "win";
        payout = bet * 2;
      } else if (playerTotal < dealerTotal) {
        outcome = "loss";
        payout = 0;
      } else {
        outcome = "push";
        payout = bet;
      }
    }

    outcomes.push(outcome);
    payoutsCash.push(payout);

    net += payout - bet;
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

function createBlackjackRouter({ getBalanceCash, debitCash, creditCash } = {}) {
  const _getBalanceCash =
    getBalanceCash ||
    (async (req) => {
      if (typeof req.session.balanceCash !== "number")
        req.session.balanceCash = 1000;
      return req.session.balanceCash;
    });

  const _debitCash =
    debitCash ||
    (async (req, amt) => {
      if (typeof req.session.balanceCash !== "number")
        req.session.balanceCash = 1000;
      req.session.balanceCash -= amt;
    });

  const _creditCash =
    creditCash ||
    (async (req, amt) => {
      if (typeof req.session.balanceCash !== "number")
        req.session.balanceCash = 1000;
      req.session.balanceCash += amt;
    });

  const router = express.Router();
  router.use(express.json());

  function getGame(req) {
    return req.session.bjGame || null;
  }
  function setGame(req, game) {
    req.session.bjGame = game;
  }
  function clearGame(req) {
    req.session.bjGame = null;
  }

  router.get("/state", async (req, res) => {
    const game = getGame(req);
    return res.json({ ok: true, state: sanitizeForClient(game) });
  });

  router.post("/start", async (req, res) => {
    try {
      const betCash = Number(req.body?.betCash);
      if (!Number.isFinite(betCash) || betCash <= 0) {
        return res.json({ ok: false, error: "BAD_BET" });
      }

      const existing = getGame(req);
      if (existing && existing.phase !== "resolved") {
        return res.json({ ok: false, error: "ROUND_ALREADY_ACTIVE" });
      }

      const balance = await _getBalanceCash(req);
      if (balance < betCash)
        return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });

      await _debitCash(req, betCash);

      const deck = shuffle(createDeck());

      const game = {
        id: crypto.randomUUID(),
        phase: "player",
        betCash,
        deck,
        dealer: { cards: [], holeHidden: true },
        hands: [
          { cards: [], betCash, done: false, doubled: false },
          { cards: [], betCash: 0, done: true, doubled: false },
        ],
        splitActive: false,
        activeHandIndex: 0,
        result: null,
      };

      game.hands[0].cards.push(draw(game));
      game.dealer.cards.push(draw(game));
      game.hands[0].cards.push(draw(game));
      game.dealer.cards.push(draw(game));

      maybeAutoResolveNaturals(game);

      if (game.phase === "resolved") {
        const totalCredit = (game.result?.payoutsCash || []).reduce(
          (a, b) => a + b,
          0,
        );
        if (totalCredit > 0) await _creditCash(req, totalCredit);
      }

      setGame(req, game);
      return res.json({ ok: true, state: sanitizeForClient(game) });
    } catch (e) {
      return res.json({ ok: false, error: "START_FAILED" });
    }
  });

  router.post("/action", async (req, res) => {
    try {
      const action = String(req.body?.action || "");
      const game = getGame(req);

      if (!game) return res.json({ ok: false, error: "NO_ACTIVE_ROUND" });
      if (game.phase === "resolved")
        return res.json({ ok: false, error: "ROUND_RESOLVED" });

      if (game.phase === "dealer") {
        settle(game);
        const totalCredit = (game.result?.payoutsCash || []).reduce(
          (a, b) => a + b,
          0,
        );
        if (totalCredit > 0) await _creditCash(req, totalCredit);
        setGame(req, game);
        return res.json({ ok: true, state: sanitizeForClient(game) });
      }

      if (game.phase !== "player")
        return res.json({ ok: false, error: "BAD_PHASE" });
      const reqIdxRaw = req.body?.handIndex;
      let hi = Number.isInteger(reqIdxRaw)
        ? reqIdxRaw
        : game.activeHandIndex || 0;

      if (hi !== 0 && hi !== 1) hi = game.activeHandIndex || 0;
      if (hi === 1 && !game.splitActive) hi = game.activeHandIndex || 0;

      const hand = game.hands[hi];
      if (!hand || hand.done)
        return res.json({ ok: false, error: "HAND_DONE" });

      if (action === "split") {
        if (!canSplit(game))
          return res.json({ ok: false, error: "CANNOT_SPLIT" });

        const balance = await _getBalanceCash(req);
        if (balance < game.betCash)
          return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });
        await _debitCash(req, game.betCash);

        const c1 = hand.cards[0];
        const c2 = hand.cards[1];

        game.splitActive = true;

        game.hands[0] = {
          cards: [c1],
          betCash: game.betCash,
          done: false,
          doubled: false,
        };
        game.hands[1] = {
          cards: [c2],
          betCash: game.betCash,
          done: false,
          doubled: false,
        };

        game.hands[0].cards.push(draw(game));
        game.hands[1].cards.push(draw(game));

        game.activeHandIndex = 0;

        setGame(req, game);
        return res.json({ ok: true, state: sanitizeForClient(game) });
      }

      if (action === "double") {
        if (!canDouble(game, hi))
          return res.json({ ok: false, error: "CANNOT_DOUBLE" });

        const extra = Number(hand.betCash || 0);
        const balance = await _getBalanceCash(req);
        if (balance < extra)
          return res.json({ ok: false, error: "INSUFFICIENT_FUNDS" });
        await _debitCash(req, extra);

        hand.betCash += extra;
        hand.doubled = true;

        hand.cards.push(draw(game));

        markHandDone(game, hi);

        if (game.phase === "dealer") {
          settle(game);
          const totalCredit = (game.result?.payoutsCash || []).reduce(
            (a, b) => a + b,
            0,
          );
          if (totalCredit > 0) await _creditCash(req, totalCredit);
        }

        setGame(req, game);
        return res.json({ ok: true, state: sanitizeForClient(game) });
      }

      if (action === "hit") {
        hand.cards.push(draw(game));

        const total = bestTotal(hand.cards);

        if (total >= 21) {
          markHandDone(game, hi);
        }

        if (game.phase === "dealer") {
          settle(game);
          const totalCredit = (game.result?.payoutsCash || []).reduce(
            (a, b) => a + b,
            0,
          );
          if (totalCredit > 0) await _creditCash(req, totalCredit);
        }

        setGame(req, game);
        return res.json({ ok: true, state: sanitizeForClient(game) });
      }

      if (action === "stand") {
        markHandDone(game, hi);

        if (game.phase === "dealer") {
          settle(game);
          const totalCredit = (game.result?.payoutsCash || []).reduce(
            (a, b) => a + b,
            0,
          );
          if (totalCredit > 0) await _creditCash(req, totalCredit);
        }

        setGame(req, game);
        return res.json({ ok: true, state: sanitizeForClient(game) });
      }

      return res.json({ ok: false, error: "UNKNOWN_ACTION" });
    } catch (e) {
      return res.json({ ok: false, error: "ACTION_FAILED" });
    }
  });

  router.post("/clear", (req, res) => {
    clearGame(req);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createBlackjackRouter };
