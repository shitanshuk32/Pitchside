const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Thin fetch wrapper. Pass `token` (from Clerk's getToken) to authenticate.
const request = async (path, { method = "GET", body, token, headers } = {}) => {
  const opts = { method, headers: { ...(headers || {}) } };

  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }

  if (token) opts.headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data;
};

export const api = {
  // Token is optional — when present the response includes the viewer's like state.
  getPosts: (token) => request("/get_all_posts", token ? { token } : {}),
  createPost: (formData, token) =>
    request("/create_a_post", { method: "POST", body: formData, token }),
  createTextPost: (text, token) =>
    request("/create_a_text_post", { method: "POST", body: { text }, token }),
  toggleLike: (id, token) =>
    request(`/posts/${id}/like`, { method: "POST", token }),
  reactToPost: (id, emoji, token) =>
    request(`/posts/${id}/react`, { method: "POST", body: { emoji }, token }),
  addComment: (id, text, token) =>
    request(`/posts/${id}/comment`, { method: "POST", body: { text }, token }),
  getLeaderboard: (token) =>
    request("/leaderboard", token ? { token } : {}),
  submitScore: (score, token) =>
    request("/leaderboard/score", { method: "POST", body: { score }, token }),
};

export { API_URL };
