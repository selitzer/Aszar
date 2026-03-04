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

function createOneDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildShoe(decks = 8) {
  let cards = [];
  for (let i = 0; i < decks; i++) cards = cards.concat(createOneDeck());
  shuffle(cards);

  const cutIndex = crypto.randomInt(60, 81);

  return { decks, cards, cutIndex };
}

function baccaratCardValue(rank) {
  if (rank === "A") return 1;
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return 0;
  return Number(rank) % 10;
}

function handTotal(cards) {
  const sum = cards.reduce((acc, c) => acc + baccaratCardValue(c.rank), 0);
  return sum % 10;
}

function draw(shoe) {
  const c = shoe.cards.pop();
  if (!c) throw new Error("SHOE_EMPTY");
  return c;
}

function isNatural(pt, bt) {
  return pt >= 8 || bt >= 8;
}

function shouldPlayerDraw(playerTotal) {
  return playerTotal <= 5;
}

function shouldBankerDraw(bankerTotal, playerThirdValueOrNull, playerDrew) {
  if (!playerDrew) {
    return bankerTotal <= 5;
  }

  const p3 = playerThirdValueOrNull;

  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return p3 !== 8;
  if (bankerTotal === 4) return p3 >= 2 && p3 <= 7;
  if (bankerTotal === 5) return p3 >= 4 && p3 <= 7;
  if (bankerTotal === 6) return p3 === 6 || p3 === 7;
  return false;
}

function resolveOutcome(playerTotal, bankerTotal) {
  if (playerTotal > bankerTotal) return "player";
  if (bankerTotal > playerTotal) return "banker";
  return "tie";
}

function computeTotalReturnCash({
  bets,
  outcome,
  bankerCommission = 0.05,
  tiePayout = 8,
}) {
  const bPlayer = Number(bets.player || 0);
  const bBanker = Number(bets.banker || 0);
  const bTie = Number(bets.tie || 0);

  let totalReturn = 0;

  if (outcome === "player") {
    if (bPlayer > 0) totalReturn += bPlayer * 2;
  } else if (outcome === "banker") {
    if (bBanker > 0) totalReturn += bBanker + bBanker * (1 - bankerCommission);
  } else {
    if (bTie > 0) totalReturn += bTie * (tiePayout + 1);

    if (bPlayer > 0) totalReturn += bPlayer;
    if (bBanker > 0) totalReturn += bBanker;
  }

  return Math.round(totalReturn * 100) / 100;
}

function startRound({
  existingShoe = null,
  decks = 8,
  bankerCommission = 0.05,
  tiePayout = 8,
  bets = { player: 0, banker: 0, tie: 0 },
}) {
  // shoe reuse
  let shoe = existingShoe;
  if (
    !shoe ||
    !Array.isArray(shoe.cards) ||
    shoe.cards.length <= (shoe.cutIndex || 75)
  ) {
    shoe = buildShoe(decks);
  }

  const hands = { player: [], banker: [] };

  // initial deal: P, B, P, B
  hands.player.push(draw(shoe));
  hands.banker.push(draw(shoe));
  hands.player.push(draw(shoe));
  hands.banker.push(draw(shoe));

  let playerTotal = handTotal(hands.player);
  let bankerTotal = handTotal(hands.banker);

  let playerDrew = false;
  let playerThird = null;

  if (!isNatural(playerTotal, bankerTotal)) {
    if (shouldPlayerDraw(playerTotal)) {
      playerThird = draw(shoe);
      hands.player.push(playerThird);
      playerDrew = true;
      playerTotal = handTotal(hands.player);
    }

    const bankerDraw = shouldBankerDraw(
      bankerTotal,
      playerDrew ? baccaratCardValue(playerThird.rank) : null,
      playerDrew,
    );
    if (bankerDraw) {
      hands.banker.push(draw(shoe));
      bankerTotal = handTotal(hands.banker);
    }
  }

  const outcome = resolveOutcome(playerTotal, bankerTotal);
  const totalReturnCash = computeTotalReturnCash({
    bets,
    outcome,
    bankerCommission,
    tiePayout,
  });

  return {
    phase: "resolved",
    shoe,
    bets,
    hands,
    totals: { player: playerTotal, banker: bankerTotal },
    outcome,
    rules: { bankerCommission, tiePayout },
    payout: {
      totalReturnCash,
    },
  };
}

module.exports = {
  startRound,
  buildShoe,
};
