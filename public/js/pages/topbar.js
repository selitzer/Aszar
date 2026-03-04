const balanceEl = document.getElementById("balance");
const unitEls = document.querySelectorAll(".wallet-unit");
const toggleBtn = document.getElementById("walletToggleBtn");

const CREDIT_RATE = 5;
let usdBalance = 0;

function getMode() {
  return localStorage.getItem("rollix_display_mode") || "cash";
}

function setMode(mode) {
  localStorage.setItem("rollix_display_mode", mode);
}

function cashIcon() {
  return `
 <svg viewBox="0 0 24 24" aria-hidden="true" id="cash">
  <!-- bill -->
  <rect x="3" y="6" width="18" height="12" rx="2.5" fill="currentColor"/>

  <!-- darker inner circle -->
  <circle cx="12" cy="12" r="3" fill="#10622eff"/>
</svg>`;
}

function creditsIcon() {
  return `
  <svg viewBox="0 0 24 24" aria-hidden="true" id="credits">
  <circle cx="12" cy="12" r="9" fill="currentColor"/>
  <text x="12" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="#152c6eff">R</text>
</svg>`;
}

const SAVINGS_KEY = "rollix_savings_accounts_v1";

function readSavingsAccounts() {
  try {
    const raw = localStorage.getItem(SAVINGS_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function savingsListApi() {
  const res = await fetch("/api/savings-accounts", { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok)
    throw new Error(data?.message || "Failed to load accounts");
  return data;
}

async function savingsCreateApi(name, deposit) {
  const res = await fetch("/api/savings-accounts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, deposit }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const err = new Error(data?.message || "Create failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

async function savingsDepositApi(id, amount) {
  const res = await fetch(`/api/savings-accounts/${id}/deposit`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.message || "Deposit failed");
  return data;
}

async function savingsWithdrawApi(id, amount) {
  const res = await fetch(`/api/savings-accounts/${id}/withdraw`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.message || "Withdraw failed");
  return data;
}

async function savingsDeleteApi(id) {
  const res = await fetch(`/api/savings-accounts/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.message || "Delete failed");
  return data;
}
function writeSavingsAccounts(accounts) {
  localStorage.setItem(SAVINGS_KEY, JSON.stringify(accounts));
}

function sanitizeMoneyInput(raw) {
  let v = String(raw ?? "").replace(/[^\d.]/g, "");

  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }

  if (firstDot !== -1) {
    const [intPart, decPart = ""] = v.split(".");
    v = intPart + "." + decPart.slice(0, 2);
  }

  if (v.startsWith(".")) v = "0" + v;

  return v;
}

function parseMoney(raw) {
  const cleaned = sanitizeMoneyInput(raw);

  if (!cleaned) return 0;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;

  return Math.round(n * 100) / 100;
}

function renderSavingsAccountsListFromData(listEl, emptyEl, accounts) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!accounts?.length) {
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  accounts.slice(0, 6).forEach((acct) => {
    const row = document.createElement("div");
    row.className = "balance-account-row";
    row.dataset.savingsId = String(acct.id);

    const left = document.createElement("div");
    left.className = "acct-left";

    const nm = document.createElement("div");
    nm.className = "acct-name";
    nm.textContent = acct.name;

    left.appendChild(nm);

    const right = document.createElement("div");
    right.className = "acct-right";
    const amt = Number(acct.balance || 0);
    right.innerHTML = `
  <span class="acct-amt">$${amt.toLocaleString()}</span>
  <span class="acct-unit wallet-unit cash">${cashIcon()}</span>
`;

    row.appendChild(left);
    row.appendChild(right);

    listEl.appendChild(row);
  });
}

function emitCurrencyChange() {
  const mode = getMode();
  window.dispatchEvent(
    new CustomEvent("rollix:currencychange", { detail: { mode } }),
  );
}
function applyBodyModeClass(mode) {
  document.body.classList.remove("mode-cash", "mode-credits");
  document.body.classList.add(
    mode === "credits" ? "mode-credits" : "mode-cash",
  );
}
function renderBalance() {
  if (!balanceEl || !unitEls.length) return;

  const mode = getMode();
  applyBodyModeClass(mode);
  if (mode === "credits") {
    const credits = Math.round(usdBalance * CREDIT_RATE);
    balanceEl.textContent = credits.toLocaleString();

    unitEls.forEach((unitEl) => {
      unitEl.className = "wallet-unit credits";
      unitEl.innerHTML = creditsIcon();
    });
  } else {
    balanceEl.textContent = usdBalance.toLocaleString();
    unitEls.forEach((unitEl) => {
      unitEl.className = "wallet-unit cash";
      unitEl.innerHTML = cashIcon();
    });
  }
}
function setUsdBalance(nextBalanceCash) {
  const n = Number(nextBalanceCash);
  if (!Number.isFinite(n)) return;
  usdBalance = n;
  renderBalance();
  emitCurrencyChange();
}

function emitWalletUpdate(nextBalanceCash) {
  window.dispatchEvent(
    new CustomEvent("rollix:walletupdate", {
      detail: { balanceCash: Number(nextBalanceCash) },
    }),
  );
}

window.addEventListener("rollix:walletupdate", (e) => {
  const next = e?.detail?.balanceCash;
  setUsdBalance(next);
});

async function initTopbar() {
  try {
    const me = await meApi();
    window.currentUser = me;
    const wallet = await getBalanceApi();
    usdBalance = Number(wallet.balance) || 0;

    const mode = getMode();
    document.body.classList.add(
      mode === "credits" ? "mode-credits" : "mode-cash",
    );

    renderBalance();
    emitCurrencyChange();
  } catch {
    window.location.href = "/login.html";
  }
}

(function setupProfileMenu() {
  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileMenu");
  if (!btn || !menu) return;

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
    if (!menu.classList.contains("open")) return;
    if (e.target.closest("#profileMenu") || e.target.closest("#profileBtn"))
      return;
    closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("open")) {
      closeMenu();
      btn.focus();
    }
  });

  menu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-action]");
    if (!item) return;

    const action = item.getAttribute("data-action");

    if (action === "account") {
      closeMenu();
      window.openAccountModal?.();
      return;
    }

    if (action === "logout") {
      closeMenu();
      try {
        await logoutApi();
      } catch {}
      window.location.href = "/login.html";
    }
  });
})();

(function setupWalletMenu() {
  const walletWrap = document.getElementById("walletMenuWrap");
  const walletBtn = document.getElementById("depositBtn");
  const walletMenu = document.getElementById("walletMenu");

  const profileBtn = document.getElementById("profileBtn");
  const profileMenu = document.getElementById("profileMenu");

  if (!walletWrap || !walletBtn || !walletMenu) return;

  const setOpen = (on) => {
    walletMenu.classList.toggle("open", on);
    walletBtn.setAttribute("aria-expanded", on ? "true" : "false");
  };

  const closeWallet = () => setOpen(false);

  walletBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    if (profileMenu?.classList.contains("open")) {
      profileMenu.classList.remove("open");
      profileBtn?.setAttribute("aria-expanded", "false");
    }

    setOpen(!walletMenu.classList.contains("open"));
  });

  profileBtn?.addEventListener("click", () => closeWallet());

  document.addEventListener("click", (e) => {
    if (!walletMenu.classList.contains("open")) return;
    if (walletWrap.contains(e.target)) return;
    closeWallet();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeWallet();
  });

  walletMenu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    closeWallet();

    if (action === "daily") {
      window.openDailyRewardsModal?.();
    } else if (action === "balanceSettings") {
      window.openBalanceSettingsModal?.();
    }
  });
})();

(function setupAccountModal() {
  const modal = document.getElementById("accountModal");
  const closeBtn = document.getElementById("accountModalClose");
  const userEl = document.getElementById("acctUsername");
  const emailEl = document.getElementById("acctEmail");
  const logoutBtn = document.getElementById("logoutBtnModal");
  const copyBtn = document.getElementById("copyAccountBtn");
  const toggleModeBtn = document.getElementById("toggleModeBtn");

  const form = document.getElementById("changePasswordForm");
  const pwCurrent = document.getElementById("pwCurrent");
  const pwNew = document.getElementById("pwNew");
  const pwConfirm = document.getElementById("pwConfirm");
  const pwMsg = document.getElementById("pwMsg");

  if (!modal) return;

  const fillAccount = () => {
    const u = currentUser || {};
    userEl.textContent = u.username || u.user || u.name || "—";
    emailEl.textContent = u.email || "—";
  };

  (function setupEmailToggle() {
    const btn = document.getElementById("showEmail");
    const emailEl = document.getElementById("acctEmail");
    if (!btn || !emailEl) return;

    let fullEmail = "";
    let visible = false;

    function maskEmail(email) {
      if (!email || !email.includes("@")) return "—";
      const [name, domain] = email.split("@");
      if (name.length <= 2) return "***@" + domain;
      return name.slice(0, 2) + "***@" + domain;
    }

    function updateView() {
      if (!fullEmail) return;
      emailEl.textContent = visible ? fullEmail : maskEmail(fullEmail);
      btn.textContent = visible ? "Hide Email" : "Show Email";
    }

    const modal = document.getElementById("accountModal");
    const observer = new MutationObserver(() => {
      if (modal.classList.contains("open")) {
        fullEmail = emailEl.textContent || "";
        visible = false;
        updateView();
      }
    });

    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });

    btn.addEventListener("click", () => {
      visible = !visible;
      updateView();
    });
  })();
  const open = () => {
    fillAccount();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    pwMsg.textContent = "";
    form?.reset();
  };

  closeBtn?.addEventListener("click", close);

  modal.addEventListener("mousedown", (e) => {
    if (e.target !== modal) return;

    const active = document.activeElement;

    if (
      active &&
      modal.contains(active) &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
    ) {
      active.blur();
      return;
    }

    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  window.openAccountModal = open;

  copyBtn?.addEventListener("click", async () => {
    const text = `Username: ${userEl.textContent}\nEmail: ${emailEl.textContent}`;
    try {
      await navigator.clipboard.writeText(text);
      pwMsg.textContent = "Copied.";
    } catch {
      pwMsg.textContent = "Copy failed (browser blocked clipboard).";
    }
  });

  toggleModeBtn?.addEventListener("click", () => {
    const next = getMode() === "cash" ? "credits" : "cash";
    setMode(next);
    document.body.classList.toggle("mode-credits", next === "credits");
    document.body.classList.toggle("mode-cash", next === "cash");
    window.dispatchEvent(new Event("rollix:modechange"));
    pwMsg.textContent = `Switched to ${next}.`;
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await logoutApi();
    } catch {}
    window.location.href = "/login.html";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    pwMsg.textContent = "";

    const cur = pwCurrent.value.trim();
    const next = pwNew.value.trim();
    const conf = pwConfirm.value.trim();

    if (next.length < 8) {
      pwMsg.textContent = "New password must be at least 8 characters.";
      return;
    }
    if (next !== conf) {
      pwMsg.textContent = "New passwords do not match.";
      return;
    }

    try {
      const submitBtn = document.getElementById("pwSubmitBtn");
      const spinner = document.getElementById("pwSpinner");
      const btnText = document.getElementById("pwBtnText");

      const setPwLoading = (on) => {
        spinner?.classList.toggle("on", on);

        if (btnText) btnText.style.display = on ? "none" : "";

        if (submitBtn) submitBtn.style.justifyContent = "center";

        if (submitBtn) submitBtn.disabled = on;
        if (pwCurrent) pwCurrent.disabled = on;
        if (pwNew) pwNew.disabled = on;
        if (pwConfirm) pwConfirm.disabled = on;
      };

      try {
        setPwLoading(true);

        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            currentPassword: cur,
            newPassword: next,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data?.ok) {
          pwMsg.textContent = data?.message || "Password change failed.";
          return;
        }

        pwMsg.textContent = "Password updated.";
        form.reset();
      } catch (err) {
        pwMsg.textContent = "Network error. Try again.";
      } finally {
        setPwLoading(false);
      }
    } catch (err) {
      pwMsg.textContent = "Password change failed.";
    }
  });
})();

function waitForTransition(el, timeoutMs = 700) {
  return new Promise((resolve) => {
    if (!el) return resolve();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(t);
      resolve();
    };

    const onEnd = (e) => {
      if (e.propertyName === "transform") finish();
    };

    el.addEventListener("transitionend", onEnd);
    const t = setTimeout(finish, timeoutMs);
  });
}

async function dailyRewardsStatusApi() {
  const res = await fetch("/api/daily-rewards/status", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const err = new Error(
      data?.message || "Failed to load daily rewards status",
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function dailyRewardsClaimApi() {
  const res = await fetch("/api/daily-rewards/claim", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const err = new Error(data?.message || "Failed to claim daily reward");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

(function setupBalanceSettingsModal() {
  let currentAccounts = [];
  async function refreshAccounts() {
    const data = await savingsListApi();
    currentAccounts = data.accounts || [];
    renderSavingsAccountsListFromData(listEl, emptyEl, currentAccounts);
  }
  const modal = document.getElementById("balanceSettingsModal");
  const closeBtn = document.getElementById("balanceSettingsClose");
  const amtEl = document.getElementById("balanceSettingsAmount");
  const unitEl = document.getElementById("balanceSettingsUnit");
  const btn = document.getElementById("createSavingsBtn");
  const msgEl = document.getElementById("balanceSettingsMsg");
  const listEl = document.getElementById("savingsAccountsList");
  const emptyEl = document.getElementById("savingsEmptyState");
  const accountsWrap = modal.querySelector(".balance-accounts");

  const detailEl = document.getElementById("savingsDetail");
  const detailNameEl = document.getElementById("savingsDetailName");
  const detailAmountEl = document.getElementById("savingsDetailAmount");
  const detailCloseBtn = document.getElementById("savingsDetailClose");

  const depIn = document.getElementById("savingsDetailDepositInput");
  const depBtn = document.getElementById("savingsDetailDepositBtn");
  const wdIn = document.getElementById("savingsDetailWithdrawInput");
  const wdBtn = document.getElementById("savingsDetailWithdrawBtn");
  const delBtn = document.getElementById("savingsDetailDeleteBtn");
  const detailMsgEl = document.getElementById("savingsDetailMsg");

  let activeSavingsId = null;
  if (!modal) return;

  const renderAmount = () => {
    const mode = getMode();
    const value =
      mode === "credits"
        ? Math.round(Number(usdBalance || 0) * CREDIT_RATE)
        : Number(usdBalance || 0);

    if (amtEl) amtEl.textContent = value.toLocaleString();
    if (unitEl) {
      unitEl.className =
        "balance-settings-unit " + (mode === "credits" ? "credits" : "cash");
      unitEl.innerHTML = mode === "credits" ? creditsIcon() : cashIcon();
    }
  };

  const open = async () => {
    setDetailOpen(false);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (msgEl) msgEl.textContent = "";
    renderAmount();

    try {
      await refreshAccounts();
    } catch (e) {
      if (msgEl) msgEl.textContent = e.message || "Failed to load accounts.";
    }
  };

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (msgEl) msgEl.textContent = "";
  };
  function setDetailOpen(on) {
    if (!accountsWrap) return;
    accountsWrap.classList.toggle("detail-open", !!on);
    if (detailEl) detailEl.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function getAcctById(id) {
    return currentAccounts.find((a) => String(a.id) === String(id)) || null;
  }

  function setAcctAmount(id, newAmount) {
    const accounts = readSavingsAccounts();
    const idx = accounts.findIndex((a) => String(a.id) === String(id));
    if (idx === -1) return false;
    accounts[idx].amount = Math.max(
      0,
      Math.round(Number(newAmount) * 100) / 100,
    );
    writeSavingsAccounts(accounts);
    return true;
  }

  function deleteAcct(id) {
    const accounts = readSavingsAccounts().filter(
      (a) => String(a.id) !== String(id),
    );
    writeSavingsAccounts(accounts);
  }

  function renderDetail() {
    const acct = getAcctById(activeSavingsId);
    if (!acct) return;

    if (detailNameEl) detailNameEl.textContent = acct.name || "Account";
    if (detailAmountEl) {
      const amt = Math.round(Number(acct.balance || 0) * 100) / 100;
      detailAmountEl.innerHTML = `
  <span class="detail-amt">$${amt.toLocaleString()}</span>
  <span class="detail-unit wallet-unit cash">${cashIcon()}</span>
`;
    }
    if (detailMsgEl) detailMsgEl.textContent = "";
    if (depIn) depIn.value = "";
    if (wdIn) wdIn.value = "";
  }

  function openDetail(id) {
    activeSavingsId = id;
    renderDetail();
    setDetailOpen(true);
    setTimeout(() => depIn?.focus(), 0);
  }

  async function closeDetail() {
    activeSavingsId = null;
    setDetailOpen(false);
    await refreshAccounts();
  }

  document.addEventListener("mousedown", (e) => {
    if (!modal.classList.contains("open")) return;

    if (!accountsWrap?.classList.contains("detail-open")) return;

    if (detailEl && detailEl.contains(e.target)) return;

    closeDetail();
  });
  const wireMoneyInput = (inputEl) => {
    if (!inputEl) return;
    inputEl.addEventListener("input", () => {
      const cleaned = sanitizeMoneyInput(inputEl.value);
      if (inputEl.value !== cleaned) inputEl.value = cleaned;
    });
  };
  wireMoneyInput(depIn);
  wireMoneyInput(wdIn);
  listEl?.addEventListener("click", (e) => {
    const row = e.target.closest(".balance-account-row");
    if (!row) return;
    const id = row.dataset.savingsId;
    if (!id) return;
    openDetail(id);
  });
  detailCloseBtn?.addEventListener("click", closeDetail);
  depBtn?.addEventListener("click", async () => {
    if (!activeSavingsId) return;
    const amt = parseMoney(depIn?.value || "");
    if (!amt) {
      detailMsgEl.textContent = "Enter a deposit amount.";
      return;
    }

    try {
      const data = await savingsDepositApi(activeSavingsId, amt);
      setUsdBalance(data.balance);
      emitWalletUpdate(data.balance);

      if (detailAmountEl)
        detailAmountEl.textContent = `$${Number(data.account.balance).toLocaleString()}`;

      await refreshAccounts();
      renderDetail();
      detailMsgEl.textContent = `Deposited $${amt.toLocaleString()}.`;
    } catch (e) {
      detailMsgEl.textContent = e.message || "Deposit failed.";
    }
  });
  wdBtn?.addEventListener("click", async () => {
    if (!activeSavingsId) return;

    const amt = parseMoney(wdIn?.value || "");
    if (!amt || amt <= 0) {
      if (detailMsgEl) detailMsgEl.textContent = "Enter a withdrawal amount.";
      return;
    }

    try {
      const data = await savingsWithdrawApi(activeSavingsId, amt);

      setUsdBalance(data.balance);
      emitWalletUpdate(data.balance);
      renderAmount();

      await refreshAccounts();
      renderDetail();

      if (detailMsgEl)
        detailMsgEl.textContent = `Withdrew $${amt.toLocaleString()}.`;
    } catch (e) {
      if (detailMsgEl)
        detailMsgEl.textContent = e.message || "Withdraw failed.";
    }
  });
  delBtn?.addEventListener("click", async () => {
    if (!activeSavingsId) return;

    try {
      const data = await savingsDeleteApi(activeSavingsId);

      setUsdBalance(data.balance);
      emitWalletUpdate(data.balance);
      renderAmount();

      activeSavingsId = null;
      setDetailOpen(false);
      await refreshAccounts();

      if (msgEl) msgEl.textContent = "Account deleted.";
    } catch (e) {
      if (detailMsgEl) detailMsgEl.textContent = e.message || "Delete failed.";
    }
  });
  closeBtn?.addEventListener("click", close);

  modal.addEventListener("mousedown", (e) => {
    if (e.target !== modal) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  window.addEventListener("rollix:walletupdate", () => {
    if (!modal.classList.contains("open")) return;
    renderAmount();
  });
  window.addEventListener("rollix:currencychange", () => {
    if (!modal.classList.contains("open")) return;
    renderAmount();
  });

  btn?.addEventListener("click", () => {
    window.openCreateSavingsModal?.();
  });

  window.openBalanceSettingsModal = open;
})();

(function setupCreateSavingsModal() {
  const modal = document.getElementById("createSavingsModal");
  const closeBtn = document.getElementById("createSavingsClose");
  const cancelBtn = document.getElementById("createSavingsCancel");
  const form = document.getElementById("createSavingsForm");
  const nameEl = document.getElementById("savingsNameInput");
  const depEl = document.getElementById("savingsDepositInput");
  const msgEl = document.getElementById("createSavingsMsg");

  const listEl = document.getElementById("savingsAccountsList");
  const emptyEl = document.getElementById("savingsEmptyState");

  if (!modal) return;
  depEl?.addEventListener("input", () => {
    const cleaned = sanitizeMoneyInput(depEl.value);
    if (depEl.value !== cleaned) depEl.value = cleaned;
  });
  const open = () => {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (msgEl) msgEl.textContent = "";
    form?.reset();

    setTimeout(() => nameEl?.focus(), 0);
  };

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (msgEl) msgEl.textContent = "";
  };

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);

  modal.addEventListener("mousedown", (e) => {
    if (e.target !== modal) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msgEl) msgEl.textContent = "";

    const rawName = (nameEl?.value || "").trim();
    if (!rawName) {
      msgEl.textContent = "Please enter an account name.";
      return;
    }

    const deposit = parseMoney(depEl?.value || "");

    try {
      const data = await savingsCreateApi(rawName, deposit);

      setUsdBalance(data.balance);
      emitWalletUpdate(data.balance);

      renderSavingsAccountsListFromData(listEl, emptyEl, data.accounts);
      close();
    } catch (err) {
      msgEl.textContent = err?.message || "Create failed.";
    }
  });

  window.openCreateSavingsModal = open;
})();

(function setupDailyRewardsModal() {
  const modal = document.getElementById("dailyRewardsModal");
  const closeBtn = document.getElementById("dailyRewardsClose");
  const streakEl = document.getElementById("dailyStreak");
  const claimBtn = document.getElementById("dailyClaimBtn");
  const msgEl = document.getElementById("dailyMsg");

  if (!modal) return;

  const REWARDS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];

  const CHECK_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  let status = null;

  const canClaimToday = () => !!status?.canClaim;
  const nextDayIndex = () => {
    const i = Number(status?.dayIndex);
    return Number.isFinite(i) ? Math.min(Math.max(i, 0), 6) : 0;
  };

  const buildTile = (i) => {
    const tile = document.createElement("div");
    tile.className = "daily-tile";
    tile.dataset.dayIndex = String(i);

    if (i === 6) tile.classList.add("day-7");

    const streak = Number(status?.streak ?? 0);
    const activeIdx = nextDayIndex();

    const isRepeatZone = streak >= 7 && i === 6;

    const isDone =
      (!isRepeatZone && i < streak) || (isRepeatZone && !canClaimToday());

    if (isDone) tile.classList.add("done", "is-flipped");
    else tile.classList.add("locked");

    if (i === activeIdx && canClaimToday()) {
      tile.classList.remove("locked");
      tile.classList.add("active");
    }

    const day = document.createElement("div");
    day.className = "d-day";
    day.textContent = `Day ${i + 1}`;
    tile.appendChild(day);

    const flip = document.createElement("div");
    flip.className = "daily-flip";

    const front = document.createElement("div");
    front.className = "daily-face front";

    const back = document.createElement("div");
    back.className = "daily-face back";

    if (isDone) {
      front.innerHTML = "";
    } else {
      const amt = document.createElement("div");
      amt.className = "d-amt";

      const num = document.createElement("span");
      num.className = "d-amt-num";
      num.textContent = REWARDS[i].toLocaleString();

      const iconWrap = document.createElement("span");
      iconWrap.className = "d-amt-icon";
      iconWrap.innerHTML = cashIcon();

      amt.appendChild(num);
      amt.appendChild(iconWrap);
      front.appendChild(amt);
    }

    const badge = document.createElement("div");
    badge.className = "daily-claimed";
    badge.innerHTML = CHECK_ICON;
    back.appendChild(badge);

    flip.appendChild(front);
    flip.appendChild(back);
    tile.appendChild(flip);

    return tile;
  };

  const render = () => {
    if (!streakEl) return;

    streakEl.innerHTML = "";

    const streak = Number(status?.streak ?? 0);
    const dayIdx = nextDayIndex();
    const dayNum = dayIdx + 1;

    for (let i = 0; i < 7; i++) {
      streakEl.appendChild(buildTile(i));
    }

    if (msgEl) {
      const streak = Number(status?.streak ?? 0);

      if (streak >= 7) {
        if (canClaimToday()) {
          msgEl.textContent = "Max streak reached — Daily bonus available.";
        } else {
          msgEl.textContent =
            "Max streak reached — Come back tomorrow for your bonus.";
        }
      } else {
        if (canClaimToday()) {
          msgEl.textContent = `Keep your streak alive — Day ${dayNum} of 7`;
        } else {
          msgEl.textContent = `Already claimed today. Streak: ${streak}/7`;
        }
      }
    }

    if (claimBtn) claimBtn.disabled = !canClaimToday();
  };

  async function loadStatus() {
    try {
      status = await dailyRewardsStatusApi();
      render();
    } catch (err) {
      if (err?.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (msgEl)
        msgEl.textContent = err?.message || "Could not load daily rewards.";
      if (claimBtn) claimBtn.disabled = true;
    }
  }

  const open = async () => {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (msgEl) msgEl.textContent = "Loading...";
    if (claimBtn) claimBtn.disabled = true;

    await loadStatus();
  };

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (msgEl) msgEl.textContent = "";
  };

  closeBtn?.addEventListener("click", close);

  modal.addEventListener("mousedown", (e) => {
    if (e.target !== modal) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });
  let isClaiming = false;

  async function runClaim() {
    if (isClaiming) return;
    if (!canClaimToday()) return;

    const activeTile = streakEl?.querySelector(".daily-tile.active");
    if (!activeTile) return;

    isClaiming = true;

    try {
      const idx = nextDayIndex();
      const optimisticReward = REWARDS[idx];

      claimBtn && (claimBtn.disabled = true);
      if (msgEl)
        msgEl.textContent = `Claiming +$${optimisticReward.toLocaleString()}...`;

      activeTile.classList.add("is-claiming");
      await new Promise((r) => setTimeout(r, 360));
      activeTile.classList.remove("is-claiming");

      const claim = await dailyRewardsClaimApi();

      activeTile.classList.add("claimed", "flip-pop");
      requestAnimationFrame(() => {
        activeTile.classList.remove("flip-pop");
        activeTile.classList.add("is-flipped");
      });

      await new Promise((r) => setTimeout(r, 420));
      activeTile.classList.remove("active", "locked");
      activeTile.classList.add("done");

      if (claim?.balance != null) {
        setUsdBalance(claim.balance);
        emitWalletUpdate(claim.balance);
      } else {
        try {
          const wallet = await getBalanceApi();
          setUsdBalance(wallet.balance);
          emitWalletUpdate(wallet.balance);
        } catch {}
      }

      if (msgEl)
        msgEl.textContent = `Claimed +$${Number(claim.amount).toLocaleString()}!`;

      await new Promise((r) => setTimeout(r, 120));
      await loadStatus();
    } catch (err) {
      if (err?.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (msgEl) msgEl.textContent = err?.message || "Claim failed.";
      await loadStatus();
    } finally {
      isClaiming = false;
    }
  }

  claimBtn?.addEventListener("click", runClaim);
  streakEl?.addEventListener("click", (e) => {
    const tile = e.target.closest(".daily-tile");
    if (!tile) return;

    if (!tile.classList.contains("active")) return;

    runClaim();
  });
  window.openDailyRewardsModal = open;
})();
initTopbar();
