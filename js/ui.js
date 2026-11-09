export const BASE = location.pathname.includes("/admin/") ? "../" : "";
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const shortId = (id) => String(id).slice(0, 8).toUpperCase();
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const badge = (t) => `<span class="badge b-${slug(t)}">${esc(t)}</span>`;

export function fmtDate(ts, withTime = true) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-PH", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function toast(msg, kind = "ok") {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}

export function placeholder(name) {
  const letter = esc((name || "?").trim()[0] || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e4efe8"/><circle cx="100" cy="100" r="62" fill="none" stroke="#0b7a40" stroke-width="8" stroke-dasharray="10 6"/><text x="100" y="118" font-family="Arial" font-size="52" font-weight="700" text-anchor="middle" fill="#0b7a40">${letter}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Only allow same-site page names after login, so ?next= can never redirect elsewhere.
export function safeNext(v) {
  return v && !v.startsWith("/") && /^[A-Za-z0-9_\-\/]+\.html(\?[A-Za-z0-9_=&\-]*)?$/.test(v) ? v : null;
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || "Please wait…"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

export function openModal(html, { wide = false } = {}) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close">×</button>${html}</div>`;
  const prev = document.activeElement;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  document.addEventListener("keydown", onKey);
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  $(".modal-x", back).addEventListener("click", close);
  document.body.append(back);
  (back.querySelector("input,select,textarea,.btn") || $(".modal-x", back)).focus();
  return { el: back, close };
}
