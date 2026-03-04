const amountEl = document.getElementById("balance");
const unitEl = document.getElementById("balanceUnit");
let currentUser = null;

const plEl = document.getElementById("plValue");
const wageredEl = document.getElementById("wageredValue");
const avgBetEl = document.getElementById("winRateValue");
const betsEl = document.getElementById("betsCountValue");
const plNumberEl = document.getElementById("plNumber");
const plUnitEl = document.getElementById("plUnit");
let currentPage = 0;
const ROWS_PER_PAGE = 8;

let lastStats = null;

const CASH_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect x="3" y="6" width="18" height="12" rx="2.5" fill="currentColor"/>
  <circle cx="12" cy="12" r="3" fill="#10622eff"/>
</svg>
`;
const RCOIN_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="9" fill="currentColor"/>
  <text x="12" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="#152c6eff">R</text>
</svg>
`;
function formatHistoryDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}
function needsTruncate(str) {
  const digitsOnly = str.replace(/[^\d]/g, "");
  return digitsOnly.length > 7;
}
const tooltip = document.createElement("div");
tooltip.className = "number-tooltip";
document.body.appendChild(tooltip);

document.addEventListener("mousemove", (e) => {
  if (!tooltip.classList.contains("active")) return;
  tooltip.style.left = e.pageX + 12 + "px";
  tooltip.style.top = e.pageY + 12 + "px";
});

document.addEventListener("mouseover", (e) => {
  const el = e.target.closest(".pl-number.truncate");
  if (!el) return;

  tooltip.textContent = el.dataset.full || el.textContent || "";
  tooltip.classList.add("active");
});

document.addEventListener("mouseout", (e) => {
  if (e.target.closest(".pl-number.truncate")) {
    tooltip.classList.remove("active");
  }
});
function renderBetHistory(rows) {
  const scroll = document.querySelector("#betHistory .table-body");
  if (!scroll) return;

  scroll.querySelectorAll(".table-row").forEach((n) => n.remove());

  const allData = Array.isArray(rows) ? rows : [];
  lastHistory = allData;

  const start = currentPage * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;
  const data = allData.slice(start, end);

  if (!data.length) {
    const empty = document.createElement("div");
    empty.className = "table-row muted";
    empty.innerHTML = `
      <div>—</div>
      <div>—</div>
      <div>—</div>
      <div>—</div>
      <div>—</div>
    `;
    scroll.appendChild(empty);
    return;
  }

  for (const r of data) {
    const bet = Number(r.bet_total || 0);
    const net = Number(r.net_profit || 0);

    let payoutCash = 0;

    if (net > 0) {
      payoutCash = bet + net;
    } else if (net === 0) {
      payoutCash = bet;
    } else {
      payoutCash = 0;
    }

    let multiplier = 0;

    if (bet > 0) {
      multiplier = payoutCash / bet;
    }

    const result = `${multiplier.toFixed(2)}x`;

    const row = document.createElement("div");
    row.className = "table-row";

    const mode = getMode();

    const betValue = mode === "credits" ? Math.round(bet * CREDIT_RATE) : bet;
    const payoutValue =
      mode === "credits" ? Math.round(payoutCash * CREDIT_RATE) : payoutCash;

    const betFormatted =
      mode === "credits"
        ? formatUnsignedNoSymbol(betValue, 0)
        : formatUnsignedNoSymbol(betValue, 2);

    const isEven = net === 0;

    const payoutFormatted =
      mode === "credits"
        ? formatUnsignedNoSymbol(payoutValue, 0)
        : formatUnsignedNoSymbol(payoutValue, 2);

    const unitIcon = mode === "credits" ? RCOIN_ICON : CASH_ICON;
    const unitClass = mode === "credits" ? "credits" : "cash";

    const payoutNumClass =
      payoutValue > 0 && net > 0 ? "pl-number is-positive" : "pl-number";
    const betNeedsTrim = needsTruncate(betFormatted);
    const payoutNeedsTrim = needsTruncate(payoutFormatted);

    const betClass = betNeedsTrim ? "pl-number truncate" : "pl-number";
    const payoutClass = payoutNeedsTrim
      ? `${payoutNumClass} truncate`
      : payoutNumClass;

    row.innerHTML = `
  <div>${formatHistoryDate(r.created_at)}</div>
  <div>${String(r.game || "—")}</div>

  <div class="pl-value">
    <span class="${betClass}" data-full="${betFormatted}">${betFormatted}</span>
    <span class="pl-unit wallet-unit ${unitClass}">${unitIcon}</span>
  </div>

  <div>${result}</div>

  <div class="pl-value">
    <span class="${payoutClass}" data-full="${payoutFormatted}">${payoutFormatted}</span>
    <span class="pl-unit wallet-unit ${unitClass}">${unitIcon}</span>
  </div>
`;

    scroll.appendChild(row);
  }
  updatePaginationButtons();
}
function getMode() {
  return localStorage.getItem("rollix_display_mode") || "cash";
}
function setMode(mode) {
  localStorage.setItem("rollix_display_mode", mode);
}
function formatNumberNoSymbol(n, decimals = 2) {
  const val = Number(n) || 0;
  const abs = Math.abs(val);
  const str = abs.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (val > 0) return `+${str}`;
  if (val < 0) return `-${str}`;
  return str;
}
function formatCashWithDollar(n) {
  const val = Number(n) || 0;
  return `$${val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCreditsInt(nCash) {
  const credits = Math.round((Number(nCash) || 0) * CREDIT_RATE);
  return credits.toLocaleString();
}

function renderWageredAndAvg(totalWageredCash, avgBetCash) {
  const mode = getMode();

  if (wageredEl) {
    wageredEl.textContent =
      mode === "credits"
        ? formatCreditsInt(totalWageredCash)
        : formatCashWithDollar(totalWageredCash);
  }

  if (avgBetEl) {
    avgBetEl.textContent =
      mode === "credits"
        ? formatCreditsInt(avgBetCash)
        : formatCashWithDollar(avgBetCash);
  }
}
function setUnitIconForMode(mode) {
  if (!plUnitEl) return;
  if (mode === "credits") {
    plUnitEl.className = "pl-unit wallet-unit credits";
    plUnitEl.innerHTML = RCOIN_ICON;
  } else {
    plUnitEl.className = "pl-unit wallet-unit cash";
    plUnitEl.innerHTML = CASH_ICON;
  }
}
function formatUnsignedNoSymbol(n, decimals = 2) {
  const val = Number(n) || 0;
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function formatMoney(n) {
  const val = Number(n) || 0;
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderBalance() {
  if (!amountEl || !unitEl) return;

  const mode = getMode();
  if (mode === "credits") {
    const credits = Math.round(usdBalance * CREDIT_RATE);
    amountEl.textContent = credits.toLocaleString();
    unitEl.innerHTML = RCOIN_ICON;
    unitEl.classList.remove("cash");
    unitEl.classList.add("credits");
  } else {
    amountEl.textContent = usdBalance.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    unitEl.innerHTML = CASH_ICON;
    unitEl.classList.remove("credits");
    unitEl.classList.add("cash");
  }
}
function renderPL(plCash) {
  const mode = getMode();

  const plValue =
    mode === "credits"
      ? Math.round((Number(plCash) || 0) * CREDIT_RATE)
      : Number(plCash) || 0;

  if (plNumberEl) {
    plNumberEl.textContent =
      mode === "credits"
        ? formatNumberNoSymbol(plValue, 0)
        : formatNumberNoSymbol(plValue, 2);
  }

  setUnitIconForMode(mode);

  if (plEl) {
    plEl.classList.remove("neutral", "positive", "negative");
    if (plCash > 0) plEl.classList.add("positive");
    else if (plCash < 0) plEl.classList.add("negative");
    else plEl.classList.add("neutral");
  }
}
function renderStats(stats) {
  if (!stats) return;
  lastStats = stats;

  const totalWagered = Number(stats.total_wagered) || 0;
  const bets = Number(stats.bets_total) || 0;

  const winsTotal = Number(stats.profit_total) || 0;
  const lossTotal = Number(stats.loss_total) || 0;

  const plCash = winsTotal - lossTotal;
  const avgBetCash = bets > 0 ? totalWagered / bets : 0;

  renderPL(plCash);

  renderWageredAndAvg(totalWagered, avgBetCash);

  if (betsEl) betsEl.textContent = bets.toLocaleString();
}

function rerenderFromLastStats() {
  if (!lastStats) return;

  const totalWagered = Number(lastStats.total_wagered) || 0;
  const bets = Number(lastStats.bets_total) || 0;

  const winsTotal = Number(lastStats.profit_total) || 0;
  const lossTotal = Number(lastStats.loss_total) || 0;

  const plCash = winsTotal - lossTotal;
  const avgBetCash = bets > 0 ? totalWagered / bets : 0;

  renderPL(plCash);
  renderWageredAndAvg(totalWagered, avgBetCash);
}

window.addEventListener("rollix:modechange", rerenderFromLastStats);
window.addEventListener("rollix:currencychange", rerenderFromLastStats);
let rawHistory = [];
let lastHistory = [];

let activeGameFilter = "all";
let activePayoutSort = null;

function rerenderHistory() {
  renderBetHistory(lastHistory);
}
function calcPayoutCash(r) {
  const bet = Number(r.bet_total || 0);
  const net = Number(r.net_profit || 0);

  if (net > 0) return bet + net;
  if (net === 0) return bet;
  return 0;
}

function applyHistoryFilters() {
  let data = Array.isArray(rawHistory) ? [...rawHistory] : [];

  if (activeGameFilter !== "all") {
    data = data.filter(
      (r) => String(r.game || "").toLowerCase() === activeGameFilter,
    );
  }

  if (activePayoutSort === "asc") {
    data.sort((a, b) => calcPayoutCash(a) - calcPayoutCash(b));
  } else if (activePayoutSort === "desc") {
    data.sort((a, b) => calcPayoutCash(b) - calcPayoutCash(a));
  }

  lastHistory = data;
  currentPage = 0;
  renderBetHistory(lastHistory);
}

function refreshFilterGameMenu() {
  const holder = document.getElementById("filterGameItems");
  if (!holder) return;

  holder.innerHTML = "";

  const games = [
    ...new Set(
      (rawHistory || [])
        .map((r) => String(r.game || "").trim())
        .filter(Boolean),
    ),
  ];

  games.sort((a, b) => a.localeCompare(b));

  for (const g of games) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-menu-item";
    btn.setAttribute("data-filter", `game:${g.toLowerCase()}`);
    btn.textContent = g;
    holder.appendChild(btn);
  }
}

function setupFilterDropdown() {
  const wrap = document.getElementById("filterMenuWrap");
  const btn = document.getElementById("filter");
  const menu = document.getElementById("filterMenu");
  if (!wrap || !btn || !menu) return;

  const openMenu = () => {
    menu.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  };

  const closeMenu = () => {
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.contains("open") ? closeMenu() : openMenu();
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-filter]");
    if (!item) return;

    const val = item.getAttribute("data-filter") || "";
    const [kind, arg] = val.split(":");

    if (kind === "game") {
      activeGameFilter = arg || "all";
    }
    if (kind === "payout") {
      activePayoutSort = arg === "asc" || arg === "desc" ? arg : null;
    }

    applyHistoryFilters();
    closeMenu();
  });
}
window.addEventListener("rollix:modechange", rerenderHistory);
window.addEventListener("rollix:currencychange", rerenderHistory);
async function init() {
  currentUser = await meApi();
  console.log("meApi response:", currentUser);

  const wallet = await getBalanceApi();
  usdBalance = Number(wallet.balance) || 0;
  renderBalance();

  const payload = await getMyStatsApi();
  renderStats(payload.stats);

  const hist = await getMyBetHistoryApi(50);
  if (hist?.ok) {
    rawHistory = hist.rows || [];
    refreshFilterGameMenu();
    applyHistoryFilters();
  }
}

bootPage({
  init: async () => {
    try {
      await init();
    } catch (e) {
      window.location.href = "/login.html";
    }
  },
});
const prevBtn = document.getElementById("historyPrev");
const nextBtn = document.getElementById("historyNext");

function updatePaginationButtons() {
  if (!prevBtn || !nextBtn) return;

  const totalPages = Math.ceil(lastHistory.length / ROWS_PER_PAGE);

  prevBtn.disabled = currentPage <= 0;
  nextBtn.disabled = currentPage >= totalPages - 1;
}

prevBtn?.addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage--;
    renderBetHistory(lastHistory);
  }
});

nextBtn?.addEventListener("click", () => {
  const totalPages = Math.ceil(lastHistory.length / ROWS_PER_PAGE);
  if (currentPage < totalPages - 1) {
    currentPage++;
    renderBetHistory(lastHistory);
  }
});

setupFilterDropdown();
