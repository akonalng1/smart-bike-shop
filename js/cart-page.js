import { boot } from "./app.js";
import { loadLines, setQty, removeItem, prune } from "./cart.js";
import { $, esc, peso, placeholder, toast } from "./ui.js";

const { user } = await boot({ active: "cart" });

async function render() {
  const box = $("#cart");
  const lines = await loadLines();
  await prune(lines.map((l) => l.productId));
  if (!lines.length) { box.innerHTML = `<div class="empty"><p>Your cart is empty.</p><a class="btn btn-primary" href="products.html">Browse parts</a></div>`; return; }
  let total = 0, blocked = false;
  const rows = lines.map((l) => {
    const p = l.product;
    const over = l.qty > p.stock;
    const qty = Math.min(l.qty, p.stock);
    if (p.stock <= 0) blocked = true;
    if (over && p.stock > 0) setQty(p.id, p.stock, p.stock);
    total += p.price * qty;
    return `<div class="cart-row" data-id="${esc(p.id)}" data-max="${p.stock}">
<a href="product-details.html?id=${encodeURIComponent(p.id)}"><img src="${esc(p.imageUrl || placeholder(p.productName))}" alt=""></a>
<div><b>${esc(p.productName)}</b><br><span class="muted">${peso(p.price)} each</span>${p.stock <= 0 ? `<br><span class="stock out">Out of stock. Remove it to continue.</span>` : over ? `<br><span class="stock low">Only ${p.stock} available. Quantity adjusted.</span>` : ""}</div>
<span class="qty"><button data-dec aria-label="Decrease quantity">−</button><input data-q type="number" min="1" max="${p.stock}" value="${qty}" aria-label="Quantity"><button data-inc aria-label="Increase quantity">+</button></span>
<b class="num">${peso(p.price * qty)}</b><button class="btn btn-danger btn-sm" data-rm>Remove</button></div>`;
  }).join("");
  box.innerHTML = `<div class="two"><div>${rows}</div><aside class="panel summary"><h2>Summary</h2><div class="tot"><span>Subtotal</span><span>${peso(total)}</span></div>
<div class="tot big"><span>Total</span><span>${peso(total)}</span></div><a class="btn btn-primary" style="width:100%;margin-top:14px;${blocked ? "pointer-events:none;opacity:.5" : ""}" href="checkout.html">Checkout</a>
${user ? "" : `<p class="hint">You will sign in or create an account at checkout. Your cart stays saved.</p>`}<p><a href="products.html">Continue shopping</a></p></aside></div>`;
}

$("#cart").addEventListener("click", async (e) => {
  const row = e.target.closest(".cart-row");
  if (!row) return;
  const id = row.dataset.id, max = +row.dataset.max, input = $("[data-q]", row);
  try {
    if (e.target.closest("[data-rm]")) await removeItem(id);
    else if (e.target.closest("[data-inc]")) await setQty(id, +input.value + 1, max);
    else if (e.target.closest("[data-dec]")) await setQty(id, +input.value - 1, max);
    else return;
    await render();
  } catch (err) { toast(err.message, "err"); }
});
$("#cart").addEventListener("change", async (e) => {
  const row = e.target.closest(".cart-row");
  if (!row || !e.target.matches("[data-q]")) return;
  await setQty(row.dataset.id, +e.target.value, +row.dataset.max);
  await render();
});
await render();
