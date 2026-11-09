import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Guests keep their cart in localStorage. Signed-in customers keep it in carts/{uid}.
// On sign-in the guest cart is merged into the account cart, so nothing is lost when Buy Now sends a guest to login.
const KEY = "sbs_cart_v1";
let uid = null;
let items = [];
const subs = new Set();
const valid = (i) => i && typeof i.productId === "string" && Number.isInteger(i.qty) && i.qty > 0;
const emit = () => subs.forEach((f) => f());
const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(valid) : []; } catch { return []; } };

async function persist() {
  if (uid) await setDoc(doc(db, "carts", uid), { cartId: uid, userId: uid, items, updatedAt: serverTimestamp() });
  else localStorage.setItem(KEY, JSON.stringify(items));
  emit();
}

export async function initCart(userId) {
  uid = userId;
  if (!uid) { items = readLocal(); emit(); return; }
  const snap = await getDoc(doc(db, "carts", uid));
  items = snap.exists() ? (snap.data().items || []).filter(valid) : [];
  const local = readLocal();
  if (local.length) {
    for (const l of local) {
      const f = items.find((i) => i.productId === l.productId);
      if (f) f.qty = Math.min(99, f.qty + l.qty); else items.push({ productId: l.productId, qty: l.qty });
    }
    localStorage.removeItem(KEY);
    await persist();
  }
  emit();
}

export const onCartChange = (f) => subs.add(f);
export const getItems = () => items.map((i) => ({ ...i }));
export const cartCount = () => items.reduce((n, i) => n + i.qty, 0);

export async function addItem(p, qty = 1) {
  if (p.stock <= 0) throw new Error("This item is out of stock.");
  const cur = items.find((i) => i.productId === p.id);
  if (cur && cur.qty >= p.stock) throw new Error("You already have the maximum available in your cart.");
  if (cur) cur.qty = Math.min(cur.qty + qty, p.stock, 99);
  else items.push({ productId: p.id, qty: Math.min(qty, p.stock, 99) });
  await persist();
}

export async function ensureItem(p) {
  if (p.stock <= 0) throw new Error("This item is out of stock.");
  if (!items.some((i) => i.productId === p.id)) { items.push({ productId: p.id, qty: 1 }); await persist(); }
}

export async function setQty(productId, qty, max = 99) {
  const i = items.find((x) => x.productId === productId);
  if (!i) return;
  const q = Math.min(Math.floor(qty) || 0, max, 99);
  if (q <= 0) items = items.filter((x) => x.productId !== productId); else i.qty = q;
  await persist();
}

export const removeItem = (id) => setQty(id, 0);

export async function prune(validIds) {
  const before = items.length;
  items = items.filter((i) => validIds.includes(i.productId));
  if (items.length !== before) await persist();
}

// Current product data for each cart line (prices always come from Firestore, never from the cart).
export async function loadLines() {
  const rows = await Promise.all(items.map(async (it) => {
    try {
      const s = await getDoc(doc(db, "products", it.productId));
      return s.exists() ? { ...it, product: { id: s.id, ...s.data() } } : null;
    } catch { return null; }
  }));
  return rows.filter(Boolean);
}
