async function getBalanceApi() {
  return apiFetch("/api/wallet/balance", { method: "GET" });
}