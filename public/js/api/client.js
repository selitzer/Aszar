async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },

    credentials: "same-origin",
  });

  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json",
  );
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const msg = data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}
