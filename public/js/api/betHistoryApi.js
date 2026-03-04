async function getMyBetHistoryApi(limit = 50) {
  return apiFetch(`/api/history/me?limit=${encodeURIComponent(limit)}`);
}
