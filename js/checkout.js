import { boot } from "./app.js";
import { db, SHOP } from "./firebase-config.js";
import { doc, collection, runTransaction, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { loadLines, prune, initCart } from "./cart.js";
import { sendMail } from "./mailer.js";
import { $, $$, esc, peso, placeholder, setBusy, shortId } from "./ui.js";
import { friendly } from "./auth.js";

// Checkout requires sign-in. Guests are redirected to login.html?next=checkout.html and returned here; their cart is merged on sign-in.
const { user } = await boot({ active: "cart", need: "user" });

const form = $("#checkout");
$("#g-num").textContent = SHOP.gcashNumber;
$("#g-name").textContent = SHOP.gcashName;
$("#recipientName").value = user.displayName || "";

const lines = await loadLines();
await prune(lines.map((l) => l.productId));
if (!lines.length) { $("#empty").hidden = false; }
else {
  form.hidden = false;
  let total = 0, problem = false;
  $("#lines").innerHTML = lines.map((l) => {
    const p = l.product;
    if (p.stock < l.qty) problem = true;
    total += p.price * l.qty;
    return `<div class="cart-row" style="grid-template-columns:48px 1fr auto"><img src="${esc(p.imageUrl || placeholder(p.productName))}" alt="" style="width:48px;height:48px"><div>${esc(p.productName)}<br><span class="muted">Qty ${l.qty}</span>${p.stock < l.qty ? `<br><span class="stock out">Only ${p.stock} available</span>` : ""}</div><b>${peso(p.price * l.qty)}</b></div>`;
  }).join("");
  $("#total").textContent = peso(total);
  if (problem) { $("#msg").innerHTML = `<div class="msg err">Some items have less stock than your cart. <a href="cart.html">Update your cart</a> first.</div>`; $("#place").disabled = true; }
}

const method = () => $("input[name=pay]:checked").value;
const syncPay = () => { $("#gcash-box").hidden = method() !== "GCash"; };
$$("input[name=pay]").forEach((r) => r.addEventListener("change", syncPay));
syncPay();

// Places the order in one Firestore transaction: re-reads the cart and live prices, checks stock, lowers stock, and saves order + payment together.
// Firestore security rules decide what a customer is allowed to write.
async function placeOrder(delivery, method, reference) {
  const orderRef = doc(collection(db, "orders"));
  const payRef = doc(collection(db, "payments"));
  const noteRef = doc(collection(db, "notifications"));
  const cartRef = doc(db, "carts", user.uid);
  const id = shortId(orderRef.id);
  const { lines, total } = await runTransaction(db, async (tx) => {
    const cartSnap = await tx.get(cartRef);
    const items = cartSnap.exists() ? cartSnap.data().items || [] : [];
    if (!items.length) throw new Error("Your cart is empty.");
    const qty = new Map();
    for (const it of items.slice(0, 50)) qty.set(it.productId, (qty.get(it.productId) || 0) + it.qty);
    const ids = [...qty.keys()];
    const snaps = await Promise.all(ids.map((pid) => tx.get(doc(db, "products", pid))));
    const out = [];
    let sum = 0;
    snaps.forEach((s, i) => {
      const q = qty.get(ids[i]);
      if (!s.exists() || s.data().status !== "Active") throw new Error("An item in your cart is no longer available. Remove it and try again.");
      const p = s.data();
      if (p.stock < q) throw new Error(p.stock > 0 ? `Only ${p.stock} left of ${p.productName}.` : `${p.productName} is out of stock.`);
      const subtotal = Math.round(p.price * q * 100) / 100;
      sum += subtotal;
      out.push({ productId: s.id, productName: p.productName, imageUrl: (p.imageUrl || "").startsWith("http") ? p.imageUrl : "", price: p.price, quantity: q, subtotal });
    });
    snaps.forEach((s, i) => tx.update(s.ref, { stock: s.data().stock - qty.get(ids[i]) }));
    const total = Math.round(sum * 100) / 100;
    const paymentStatus = method === "GCash" ? "Pending Verification" : "Pending";
    tx.set(orderRef, {
      orderId: orderRef.id, userId: user.uid, customerName: user.displayName || delivery.recipientName, customerEmail: user.email.toLowerCase(),
      products: out, deliveryAddress: delivery, paymentMethod: method, paymentStatus, orderStatus: "Pending", totalAmount: total,
      paymentId: payRef.id, statusHistory: [{ status: "Pending", at: Timestamp.now() }], cancelRequested: false, createdAt: serverTimestamp(),
    });
    tx.set(payRef, { paymentId: payRef.id, orderId: orderRef.id, userId: user.uid, paymentMethod: method, referenceNumber: method === "GCash" ? reference : "", amount: total, paymentStatus, createdAt: serverTimestamp() });
    if (method === "GCash") tx.set(doc(db, "gcashRefs", reference), { userId: user.uid, orderId: orderRef.id, createdAt: serverTimestamp() });
    tx.set(cartRef, { cartId: user.uid, userId: user.uid, items: [], updatedAt: serverTimestamp() });
    tx.set(noteRef, { notificationId: noteRef.id, userId: user.uid, title: `Order #${id} received`, message: `We received your order of ${peso(total)}.`, isRead: false, createdAt: serverTimestamp() });
    return { lines: out, total };
  });
  await initCart(user.uid);
  sendMail(user.email, user.displayName || delivery.recipientName, `Order Confirmation #${id} - Smart Bike Shop`, [
    `Thank you! We received your order #${id}.`,
    lines.map((l) => `${l.productName} x${l.quantity} - ${peso(l.subtotal)}`).join("\n") + `\n\nTotal: ${peso(total)}`,
    method === "GCash" ? `Payment: GCash, reference ${reference}. We will verify your payment and email you once it is confirmed.` : "Payment: Cash on Delivery. Please prepare the exact amount when your order arrives.",
    `Deliver to: ${delivery.recipientName}, ${delivery.street}, ${delivery.barangay}, ${delivery.city}, ${delivery.province} ${delivery.postalCode}`,
    "Thank you for choosing Smart Bike Shop!",
  ]);
  return { orderId: orderRef.id, total };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const get = (id) => $("#" + id).value.trim();
  const delivery = Object.fromEntries(["recipientName", "phone", "street", "barangay", "city", "province", "postalCode", "notes"].map((k) => [k, get(k)]));
  const msg = (t) => { $("#msg").innerHTML = t ? `<div class="msg err">${esc(t)}</div>` : ""; };
  msg("");
  if (!/^(09|\+639)\d{9}$/.test(delivery.phone.replace(/[\s-]/g, ""))) return msg("Enter a valid mobile number, for example 09171234567.");
  if (!/^\d{4}$/.test(delivery.postalCode)) return msg("Postal code must be 4 digits.");
  if (["recipientName", "street", "barangay", "city", "province"].some((k) => delivery[k].length < 2)) return msg("Complete all delivery fields.");
  if (method() === "GCash" && !/^[A-Za-z0-9]{8,20}$/.test(get("referenceNumber"))) return msg("Enter your GCash reference number (8-20 letters or digits).");
  setBusy($("#place"), true, "Placing order…");
  try {
    const res = await placeOrder(delivery, method(), get("referenceNumber").toUpperCase());
    form.hidden = true;
    const done = $("#done");
    done.hidden = false;
    done.innerHTML = `<h2>Order placed</h2><p>Your order <b>#${shortId(res.orderId)}</b> for <b>${peso(res.total)}</b> is confirmed. We sent the details to ${esc(user.email)}.</p>
<p>${method() === "GCash" ? "We will verify your GCash payment and email you once it is confirmed." : "Please prepare the exact amount for delivery."}</p><a class="btn btn-primary" href="orders.html#track">Track my order</a>`;
    done.focus();
  } catch (err) {
    msg(friendly(err));
    setBusy($("#place"), false);
  }
});
