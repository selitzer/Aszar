"use strict";

const ORDER = [
  "0",
  "32",
  "15",
  "19",
  "4",
  "21",
  "2",
  "25",
  "17",
  "34",
  "6",
  "27",
  "13",
  "36",
  "11",
  "30",
  "8",
  "23",
  "10",
  "5",
  "24",
  "16",
  "33",
  "1",
  "20",
  "14",
  "31",
  "9",
  "22",
  "18",
  "29",
  "7",
  "28",
  "12",
  "35",
  "3",
  "26",
];

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const BLACK = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

function randomWinningNumber() {
  return Math.floor(Math.random() * 37);
}

function betReturnMultiplier(betKey) {
  if (/^\d+$/.test(betKey)) return 36;
  if (betKey === "1_12" || betKey === "13_24" || betKey === "25_36") return 3;
  if (betKey.startsWith("2to1_")) return 3;
  return 2;
}

function isWinningBet(betKey, winNum) {
  const winStr = String(winNum);

  if (betKey === winStr) return true;

  if (betKey === "1_12") return winNum >= 1 && winNum <= 12;
  if (betKey === "13_24") return winNum >= 13 && winNum <= 24;
  if (betKey === "25_36") return winNum >= 25 && winNum <= 36;

  if (betKey === "1_18") return winNum >= 1 && winNum <= 18;
  if (betKey === "19_36") return winNum >= 19 && winNum <= 36;
  if (betKey === "even") return winNum !== 0 && winNum % 2 === 0;
  if (betKey === "odd") return winNum % 2 === 1;

  if (betKey === "red") return RED.has(winNum);
  if (betKey === "black") return BLACK.has(winNum);

  if (betKey === "2to1_top") return winNum !== 0 && winNum % 3 === 0;
  if (betKey === "2to1_mid") return winNum !== 0 && winNum % 3 === 2;
  if (betKey === "2to1_bot") return winNum !== 0 && winNum % 3 === 1;

  return false;
}

function sanitizeBetsFromClient(bets) {
  if (!Array.isArray(bets)) return [];
  const merged = new Map();

  for (const x of bets) {
    const bet = String(x?.bet ?? x?.betKey ?? "");
    const total = Number(x?.total ?? x?.amount ?? 0);

    if (!bet) continue;
    if (!Number.isFinite(total) || total <= 0) continue;

    merged.set(bet, (merged.get(bet) || 0) + Math.round(total));
  }

  return [...merged.entries()].map(([bet, total]) => ({ bet, total }));
}

function computeTotalReturn({ bets, winningNumber }) {
  let totalReturn = 0;
  for (const b of bets || []) {
    const key = String(b?.bet || "");
    const stake = Number(b?.total || 0);
    if (!key || !Number.isFinite(stake) || stake <= 0) continue;

    if (isWinningBet(key, winningNumber)) {
      totalReturn += stake * betReturnMultiplier(key);
    }
  }
  return totalReturn;
}

function buildSpinPlan({ fromIndex, winningNumber }) {
  const targetIndex = ORDER.indexOf(String(winningNumber));
  const len = ORDER.length;

  const safeFrom = Number.isFinite(fromIndex) ? fromIndex : 0;
  const forwardTiles = (targetIndex - safeFrom + len) % len;

  const extraLoops = 4 + Math.floor(Math.random() * 3);
  const totalTiles = forwardTiles + extraLoops * len;

  return { fromIndex: safeFrom, targetIndex, extraLoops, totalTiles };
}

module.exports = {
  ORDER,
  randomWinningNumber,
  sanitizeBetsFromClient,
  computeTotalReturn,
  buildSpinPlan,
};
