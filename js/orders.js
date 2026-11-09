import { boot } from "./app.js";
import { db } from "./firebase-config.js";
import { doc, updateDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { $, $$, esc, peso, fmtDate, shortId, badge, placeholder, toast } from "./ui.js";
import { friendly } from "./auth.js";

const { user } = await boot({ active: "orders", need: "user" });
const STEPS = ["Pending", "Processing", "Shipped", "Delivered"];
let orders = [];
let selected = null;
const tab = () => (location.hash || "#orders").slice(1);

function orderCard(o, { trackBtn = true } = {}) {
  const canCancel = o.orderStatus === "Pending" && o.paymentStatus !== "Paid" && !o.cancelRequested;
  return `<article class="order"><div class="order-h"><div><b>Order #${shortId(o.id)}</b><br><span class="muted">${fmtDate(o.createdAt)}</span></div><div>${badge(o.orderStatus)} ${badge(o.paymentStatus)} ${o.cancelRequested && o.orderStatus === "Pending" ? '<span class="badge b-pending">Cancellation requested</span>' : ""}</div></div>
<div class="mini">${o.products.map((p) => `<img src="${esc(p.imageUrl || placeholder(p.productName))}" alt="${esc(p.productName)}" title="${esc(p.productName)} x${p.quantity}">`).join("")}</div>
<p class="muted">${o.products.map((p) => `${esc(p.productName)} x${p.quantity}`).join(", ")}</p>
<div class="order-h"><b>${peso(o.totalAmount)} <span class="muted">via ${o.paymentMethod === "COD" ? "Cash on Delivery" : "GCash"}</span></b>
<span>${trackBtn ? `<button class="btn btn-ghost btn-sm" data-track="${o.id}">Track order</button> ` : ""}${canCancel ? `<button class="btn btn-danger btn-sm" data-cancel="${o.id}">Request cancellation</button>` : ""}</span></div></article>`;
}

function timeline(o) {
  const hist = Object.fromEntries((o.statusHistory || []).map((h) => [h.status, h.at]));
  const idx = STEPS.indexOf(o.orderStatus);
  const cancelled = o.orderStatus === "Cancelled";
  const a = o.deliveryAddress;
  return `${orderCard(o, { trackBtn: false })}
${cancelled ? `<div class="msg err">This order was cancelled${hist.Cancelled ? " on " + fmtDate(hist.Cancelled) : ""}.</div>` : ""}
<ol class="steps" aria-label="Order progress">${STEPS.map((s, i) => `<li class="${!cancelled && i <= idx ? "done" : ""}">${s}<small>${hist[s] ? fmtDate(hist[s]) : ""}</small></li>`).join("")}</ol>
<div class="panel"><b>Delivery address</b><p>${esc(a.recipientName)}, ${esc(a.phone)}<br>${esc(a.street)}, ${esc(a.barangay)}, ${esc(a.city)}, ${esc(a.province)} ${esc(a.postalCode)}</p>
${o.paymentStatus === "Pending Verification" ? `<p class="muted">We are verifying your GCash payment.</p>` : ""}</div>`;
}

function render() {
  const t = tab();
  const active = orders.filter((o) => !["Delivered", "Cancelled"].includes(o.orderStatus));
  const history = orders.filter((o) => ["Delivered", "Cancelled"].includes(o.orderStatus));
  const tabs = [["orders", "My orders"], ["history", "Order history"], ["track", "Track my order"]];
  let body;
  if (t === "history") body = history.map((o) => orderCard(o)).join("") || `<div class="empty">No completed or cancelled orders yet.</div>`;
  else if (t === "track") {
    const o = orders.find((x) => x.id === selected) || orders[0];
    body = !o ? `<div class="empty">You have no orders to track yet.</div>`
      : `<div class="field"><label for="pick">Choose an order</label><select id="pick">${orders.map((x) => `<option value="${x.id}" ${x.id === o.id ? "selected" : ""}>#${shortId(x.id)} - ${fmtDate(x.createdAt, false)} - ${x.orderStatus}</option>`).join("")}</select></div>${timeline(o)}`;
  } else body = active.map((o) => orderCard(o)).join("") || `<div class="empty"><p>No active orders.</p><a class="btn btn-primary" href="products.html">Shop parts</a></div>`;
  $("#panel").innerHTML = `<div class="page-head"><h1>${tabs.find((x) => x[0] === t)?.[1] || "My orders"}</h1><div class="tabs">${tabs.map(([k, l]) => `<a href="#${k}" class="${k === t ? "on" : ""}">${l}</a>`).join("")}</div></div>${body}`;
}

$("#panel").addEventListener("click", async (e) => {
  const tr = e.target.closest("[data-track]");
  if (tr) { selected = tr.dataset.track; location.hash = "#track"; render(); return; }
  const c = e.target.closest("[data-cancel]");
  if (c && confirm("Ask the shop to cancel this order? The shop confirms the cancellation and returns the items to stock.")) {
    c.disabled = true;
    try { await updateDoc(doc(db, "orders", c.dataset.cancel), { cancelRequested: true }); toast("Cancellation requested. The shop will confirm it."); }
    catch (err) { toast(friendly(err), "err"); c.disabled = false; }
  }
});
$("#panel").addEventListener("change", (e) => { if (e.target.id === "pick") { selected = e.target.value; render(); } });
addEventListener("hashchange", render);

// Live updates: status changes made by the admin appear without refreshing.
onSnapshot(query(collection(db, "orders"), where("userId", "==", user.uid), orderBy("createdAt", "desc")), (snap) => {
  orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
}, (err) => { console.error(err); $("#panel").innerHTML = `<div class="empty">We could not load your orders. Refresh and try again.</div>`; });
