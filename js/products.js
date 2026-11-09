import { boot } from "./app.js";
import { db } from "./firebase-config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { addItem, ensureItem, getItems, setQty } from "./cart.js";
import { $, esc, peso, placeholder, toast } from "./ui.js";

const page = document.body.dataset.page;
let categories = [];
let products = [];
const catName = (id) => categories.find((c) => c.id === id)?.categoryName || "Other";

async function loadCatalog() {
  const [c, p] = await Promise.all([
    getDocs(collection(db, "categories")),
    getDocs(query(collection(db, "products"), where("status", "==", "Active"))),
  ]);
  categories = c.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.categoryName.localeCompare(b.categoryName));
  products = p.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function stockLabel(p) {
  if (p.stock <= 0) return `<span class="stock out">Out of stock</span>`;
  if (p.stock <= 5) return `<span class="stock low">Only ${p.stock} left</span>`;
  return `<span class="stock">${p.stock} in stock</span>`;
}

function card(p) {
  const href = `product-details.html?id=${encodeURIComponent(p.id)}`;
  const off = p.stock <= 0 ? "disabled" : "";
  return `<article class="card"><a class="card-img" href="${href}"><img loading="lazy" src="${esc(p.imageUrl || placeholder(p.productName))}" alt="${esc(p.productName)}"></a>
<div class="card-body"><span class="cat">${esc(catName(p.category))}</span><h3><a href="${href}">${esc(p.productName)}</a></h3>
<div class="price-row"><span class="price">${peso(p.price)}</span>${stockLabel(p)}</div>
<div class="card-actions"><button class="btn btn-ghost" data-add="${esc(p.id)}" ${off}>Add to cart</button><button class="btn btn-primary" data-buy="${esc(p.id)}" ${off}>Buy now</button></div></div></article>`;
}

// Add to cart / Buy now buttons (cards and detail page share this handler).
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-add],[data-buy]");
  if (!b) return;
  const p = products.find((x) => x.id === (b.dataset.add || b.dataset.buy));
  if (!p) return;
  const qty = Math.max(1, parseInt($("#qty")?.value, 10) || 1);
  try {
    if (b.dataset.add) { await addItem(p, $("#qty") ? qty : 1); toast(`${p.productName} added to cart`); }
    else {
      // Buy now: make sure the item is in the cart, then go to checkout. Guests are sent to login and come back to checkout with the cart intact.
      if ($("#qty")) {
        if (getItems().some((i) => i.productId === p.id)) await setQty(p.id, qty, p.stock); else await addItem(p, qty);
      } else await ensureItem(p);
      location.href = "checkout.html";
    }
  } catch (err) { toast(err.message, "err"); }
});

function home() {
  $("#cats").innerHTML = categories.map((c) => `<a class="cat-tile" href="products.html?category=${encodeURIComponent(c.id)}"><strong>${esc(c.categoryName)}</strong><span>${products.filter((p) => p.category === c.id).length} items</span></a>`).join("") || `<p class="muted">Categories are coming soon.</p>`;
  const latest = [...products].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 8);
  $("#featured").innerHTML = latest.map(card).join("") || `<div class="empty">No products yet. Check back soon.</div>`;
}

function listing() {
  const q = new URLSearchParams(location.search);
  $("#f-cat").innerHTML = `<option value="">All categories</option>` + categories.map((c) => `<option value="${esc(c.id)}">${esc(c.categoryName)}</option>`).join("");
  $("#f-cat").value = q.get("category") || "";
  $("#f-q").value = q.get("q") || "";
  const render = () => {
    const term = $("#f-q").value.trim().toLowerCase();
    const cat = $("#f-cat").value;
    let list = products.filter((p) => (!cat || p.category === cat) && (!term || `${p.productName} ${p.description} ${catName(p.category)}`.toLowerCase().includes(term)));
    const sort = $("#f-sort").value;
    list.sort((a, b) => (sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : a.productName.localeCompare(b.productName)));
    $("#count").textContent = `${list.length} ${list.length === 1 ? "product" : "products"}`;
    $("#grid").innerHTML = list.map(card).join("") || `<div class="empty">No parts match your search. Try another word or category.</div>`;
  };
  $("#filters").addEventListener("input", render);
  $("#filters").addEventListener("change", render);
  render();
}

function details() {
  const id = new URLSearchParams(location.search).get("id");
  const p = products.find((x) => x.id === id);
  if (!p) { $("#detail").innerHTML = `<div class="empty"><p>This product is not available.</p><a class="btn btn-primary" href="products.html">Back to shop</a></div>`; return; }
  document.title = `${p.productName} - Smart Bike Shop`;
  const off = p.stock <= 0 ? "disabled" : "";
  $("#detail").innerHTML = `<div class="detail"><img src="${esc(p.imageUrl || placeholder(p.productName))}" alt="${esc(p.productName)}">
<div><a href="products.html?category=${encodeURIComponent(p.category)}">${esc(catName(p.category))}</a><h1>${esc(p.productName)}</h1>
<p class="price" style="font-size:2.2rem">${peso(p.price)}</p><p>${esc(p.description).replace(/\n/g, "<br>")}</p><p>${stockLabel(p)} <span class="muted">Product ID: ${esc(p.id)}</span></p>
<p><span class="qty"><button type="button" aria-label="Decrease" onclick="const i=document.getElementById('qty');i.value=Math.max(1,i.value-1)">−</button><input id="qty" type="number" min="1" max="${p.stock}" value="1" aria-label="Quantity"><button type="button" aria-label="Increase" onclick="const i=document.getElementById('qty');i.value=Math.min(${p.stock},+i.value+1)">+</button></span></p>
<p><button class="btn btn-ghost" data-add="${esc(p.id)}" ${off}>Add to cart</button> <button class="btn btn-primary" data-buy="${esc(p.id)}" ${off}>Buy now</button></p></div></div>`;
  const rel = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
  if (rel.length) { $("#rel-h").hidden = false; $("#related").innerHTML = rel.map(card).join(""); }
}

await boot({ active: page === "home" ? "home" : "shop" });
try {
  await loadCatalog();
  ({ home, shop: listing }[page] || details)();
} catch (e) {
  console.error(e);
  const box = $("#grid") || $("#featured") || $("#detail");
  if (box) box.innerHTML = `<div class="empty">We could not load products. Check your connection and refresh.</div>`;
}
