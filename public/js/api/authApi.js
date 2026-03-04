async function registerApi(username, email, password) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

async function loginApi(identifier, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

async function meApi() {
  return apiFetch("/api/auth/me", { method: "GET" });
}

async function logoutApi() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}
