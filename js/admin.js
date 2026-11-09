import { boot } from "./app.js";
import { db } from "./firebase-config.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, writeBatch, increment, arrayUnion, Timestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { sendMail } from "./mailer.js";
import { $, $$, esc, peso, fmtDate, shortId, slug, badge, toast, openModal, placeholder, setBusy } from "./ui.js";
import { friendly } from "./auth.js";

// Pages are blocked unless the profile has role "admin". Firestore rules enforce the same check on every read and write.
const { user: me } = await boot({ active: "admin", need: "admin" });
const page = document.body.dataset.page;
const NAV = [["dashboard", "Overview"], ["products", "Products"], ["categories", "Categories"], ["orders", "Orders"], ["customers", "Customers"], ["reports", "Sales reports"]];
const NEXT = { Pending: ["Processing", "Cancelled"], Processing: ["Shipped", "Cancelled"], Shipped: ["Delivered"], Delivered: [], Cancelled: [] };
const all = async (name, ...q) => (await getDocs(query(collection(db, name), ...q))).docs.map((d) => ({ id: d.id, ...d.data() }));

function shell(title, actions = "") {
  $("#admin").innerHTML = `<div class="wrap dash"><aside class="dash-nav" aria-label="Admin">${NAV.map(([k, l]) => `<a href="${k}.html" class="${k === page ? "on" : ""}">${l}</a>`).join("")}<a href="../index.html">Back to shop</a></aside>
<section><div class="page-head"><h1>${title}</h1><div>${actions}</div></div><div id="body" aria-live="polite"><p class="muted">Loading…</p></div></section></div>`;
  return $("#body");
}
const table = (head, rows) => `<div class="tbl-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${head.length}" class="muted">Nothing here yet.</td></tr>`}</tbody></table></div>`;
const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
const isSale = (o) => o.orderStatus !== "Cancelled";

/* ---------- overview ---------- */
async function pDashboard() {
  const body = shell("Overview");
  const [orders, users, products] = await Promise.all([all("orders", orderBy("createdAt", "desc")), all("users", where("role", "==", "customer")), all("products")]);
  const revenue = orders.filter((o) => o.paymentStatus === "Paid" && isSale(o)).reduce((n, o) => n + o.totalAmount, 0);
  const low = products.filter((p) => p.status === "Active" && p.stock <= 5);
  body.innerHTML = `<div class="stats">${stat(orders.length, "Total orders")}${stat(orders.filter((o) => o.orderStatus === "Pending").length, "Pending orders")}${stat(orders.filter((o) => o.paymentStatus === "Pending Verification").length, "GCash payments to verify")}${stat(peso(revenue), "Paid revenue")}${stat(users.length, "Customers")}${stat(products.length, "Products")}</div>
<h2>Recent orders</h2>${table(["Order", "Date", "Customer", "Total", "Status"], orders.slice(0, 6).map((o) => `<tr><td><a href="orders.html">#${shortId(o.id)}</a></td><td>${fmtDate(o.createdAt)}</td><td>${esc(o.customerName)}</td><td class="num">${peso(o.totalAmount)}</td><td>${badge(o.orderStatus)}</td></tr>`))}
<h2 style="margin-top:28px">Low stock (5 or fewer)</h2>${table(["Product", "Stock"], low.map((p) => `<tr><td>${esc(p.productName)}</td><td>${p.stock === 0 ? `<span class="stock out">Out of stock</span>` : p.stock}</td></tr>`))}`;
}

/* ---------- helpers: product photos and sample data ---------- */
// Photos are shrunk in the browser and saved inside the product document, so no Firebase Storage (paid plan) is needed.
function shrink(file, max, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}
async function resizeImage(file) {
  let out = await shrink(file, 640, 0.75);
  if (out.length > 450000) out = await shrink(file, 420, 0.6);
  if (out.length > 450000) throw new Error("That image is too detailed. Try a smaller photo.");
  return out;
}

async function seed() {
  const cats = [["bicycle-frames", "Bicycle Frames"], ["tires-and-tubes", "Tires and Tubes"], ["brakes", "Brakes"], ["chains-and-gears", "Chains and Gears"], ["pedals", "Pedals"], ["handlebars", "Handlebars"], ["saddles", "Saddles"], ["bike-accessories", "Bike Accessories"], ["helmets", "Helmets"], ["bike-lights", "Bike Lights"]];
  const prods = [
    ["Alloy Mountain Frame 29er", "bicycle-frames", 6800, 6], ["Road Tire 700x25c", "tires-and-tubes", 950, 40], ["MTB Tire 27.5x2.1", "tires-and-tubes", 1250, 30],
    ["Inner Tube 700c (Presta)", "tires-and-tubes", 280, 80], ["Hydraulic Disc Brake Set", "brakes", 3400, 12], ["Disc Brake Pads (Resin)", "brakes", 420, 50],
    ["9-Speed Chain", "chains-and-gears", 650, 35], ["11-36T Cassette (10-Speed)", "chains-and-gears", 1800, 15], ["Platform Pedals (Alloy)", "pedals", 1100, 25],
    ["Flat Handlebar 720mm", "handlebars", 780, 20], ["Comfort Saddle", "saddles", 1300, 18], ["Bottle Cage and 750ml Bottle", "bike-accessories", 450, 45],
    ["Mini Floor Pump", "bike-accessories", 890, 22], ["Trail Helmet", "helmets", 2200, 14], ["USB Rechargeable Light Set", "bike-lights", 760, 28],
  ];
  const b = writeBatch(db);
  cats.forEach(([id, categoryName], i) => b.set(doc(db, "categories", id), { categoryId: id, categoryName, description: "", sortOrder: i }));
  prods.forEach(([productName, category, price, stock]) => {
    const r = doc(collection(db, "products"));
    b.set(r, { productId: r.id, productName, description: "Sample item. Edit the description and add a photo.", price, imageUrl: "", category, stock, status: "Active", createdAt: serverTimestamp() });
  });
  await b.commit();
}

/* ---------- products ---------- */
async function pProducts() {
  const body = shell("Products", `<button class="btn btn-primary" id="add">Add product</button>`);
  const cats = await all("categories", orderBy("categoryName"));
  const catName = (id) => cats.find((c) => c.id === id)?.categoryName || id;
  let prods = [];
  const load = async () => { prods = await all("products", orderBy("productName")); draw(); };
  const draw = () => {
    body.innerHTML = `${cats.length ? "" : `<div class="empty"><p>No categories yet.</p><button class="btn btn-primary" id="seed">Load sample categories and products</button></div>`}<div class="toolbar"><input id="q" type="search" placeholder="Search products" aria-label="Search products"></div><div id="tbl"></div>`;
    const paint = () => {
      const t = $("#q").value.trim().toLowerCase();
      $("#tbl").innerHTML = table(["", "Product", "Category", "Price", "Stock", "Status", ""], prods.filter((p) => !t || p.productName.toLowerCase().includes(t)).map((p) => `<tr data-id="${p.id}">
<td><img class="thumb" src="${esc(p.imageUrl || placeholder(p.productName))}" alt=""></td><td><b>${esc(p.productName)}</b><br><span class="muted">${p.id}</span></td><td>${esc(catName(p.category))}</td><td class="num">${peso(p.price)}</td>
<td><input class="stock-in" type="number" min="0" step="1" value="${p.stock}" data-stock aria-label="Stock for ${esc(p.productName)}"></td><td>${badge(p.status)}</td>
<td class="num"><button class="btn btn-ghost btn-sm" data-edit>Edit</button> <button class="btn btn-danger btn-sm" data-del>Delete</button></td></tr>`));
    };
    $("#q").addEventListener("input", paint);
    paint();
  };
  const form = (p) => {
    const m = openModal(`<h2>${p ? "Edit product" : "Add product"}</h2><form id="pf" novalidate><div id="pm"></div>
<div class="field"><label for="n">Product name</label><input id="n" required maxlength="120" value="${esc(p?.productName)}"></div>
<div class="field"><label for="c">Category</label><select id="c" required>${cats.map((c) => `<option value="${esc(c.id)}" ${p?.category === c.id ? "selected" : ""}>${esc(c.categoryName)}</option>`).join("")}</select></div>
<div class="field"><label for="d">Description</label><textarea id="d" maxlength="2000">${esc(p?.description)}</textarea></div>
<div class="row2"><div class="field"><label for="pr">Price (PHP)</label><input id="pr" type="number" min="0" step="0.01" required value="${p?.price ?? ""}"></div><div class="field"><label for="s">Available stock</label><input id="s" type="number" min="0" step="1" required value="${p?.stock ?? 0}"></div></div>
<div class="field"><label for="st">Status</label><select id="st"><option ${p?.status !== "Inactive" ? "selected" : ""}>Active</option><option ${p?.status === "Inactive" ? "selected" : ""}>Inactive</option></select></div>
<div class="field"><label for="img">Product image</label><input id="img" type="file" accept="image/jpeg,image/png,image/webp"><p class="hint">JPG, PNG or WebP. It is shrunk automatically.${p?.imageUrl ? " Leave empty to keep the current image." : ""}</p></div><div class="field"><label for="iu">Or paste an image link (https)</label><input id="iu" type="url" placeholder="https://"></div>
<button class="btn btn-primary" id="sv">Save product</button></form>`);
    $("#pf", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = (t) => { $("#pm", m.el).innerHTML = `<div class="msg err">${esc(t)}</div>`; };
      const name = $("#n", m.el).value.trim(), price = Number($("#pr", m.el).value), stock = Number($("#s", m.el).value), file = $("#img", m.el).files[0];
      if (name.length < 2) return err("Enter a product name.");
      if (!cats.length) return err("Create a category first.");
      if (!Number.isFinite(price) || price < 0) return err("Enter a valid price.");
      if (!Number.isInteger(stock) || stock < 0) return err("Stock must be a whole number, 0 or more.");
      if (file && (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024)) return err("Image must be a JPG, PNG or WebP up to 5 MB.");
      setBusy($("#sv", m.el), true, "Saving…");
      try {
        const id = p?.id || doc(collection(db, "products")).id;
        let imageUrl = p?.imageUrl || "";
        const link = $("#iu", m.el).value.trim();
        if (file) imageUrl = await resizeImage(file);
        else if (link) { if (!link.startsWith("https://")) throw new Error("The image link must start with https://"); imageUrl = link; }
        await setDoc(doc(db, "products", id), { productId: id, productName: name, description: $("#d", m.el).value.trim(), price, category: $("#c", m.el).value, stock, status: $("#st", m.el).value, imageUrl, createdAt: p?.createdAt || serverTimestamp() });
        m.close(); toast("Product saved."); await load();
      } catch (e2) { err(friendly(e2)); setBusy($("#sv", m.el), false); }
    });
  };
  $("#add").addEventListener("click", () => form(null));
  body.addEventListener("click", async (e) => {
    if (e.target.id === "seed") { e.target.disabled = true; try { await seed(); location.reload(); } catch (err) { toast(friendly(err), "err"); e.target.disabled = false; } return; }
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const p = prods.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-edit]")) form(p);
    if (e.target.closest("[data-del]") && confirm(`Delete "${p.productName}"? Past orders keep their own copy of the item.`)) {
      try {
        await deleteDoc(doc(db, "products", p.id)); toast("Product deleted."); await load();
      } catch (err) { toast(friendly(err), "err"); }
    }
  });
  body.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-stock]")) return;
    const id = e.target.closest("tr").dataset.id, n = Number(e.target.value);
    if (!Number.isInteger(n) || n < 0) { toast("Stock must be a whole number, 0 or more.", "err"); return load(); }
    try { await updateDoc(doc(db, "products", id), { stock: n }); toast("Stock updated."); prods.find((x) => x.id === id).stock = n; }
    catch (err) { toast(friendly(err), "err"); load(); }
  });
  await load();
}

/* ---------- categories ---------- */
async function pCategories() {
  const body = shell("Categories", `<button class="btn btn-primary" id="add">Add category</button>`);
  let cats = [], prods = [];
  const load = async () => {
    [cats, prods] = await Promise.all([all("categories"), all("products")]);
    cats.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.categoryName.localeCompare(b.categoryName));
    body.innerHTML = table(["Category", "Description", "Products", ""], cats.map((c) => `<tr data-id="${c.id}"><td><b>${esc(c.categoryName)}</b></td><td>${esc(c.description)}</td><td>${prods.filter((p) => p.category === c.id).length}</td><td class="num"><button class="btn btn-ghost btn-sm" data-edit>Edit</button> <button class="btn btn-danger btn-sm" data-del>Delete</button></td></tr>`));
  };
  const form = (c) => {
    const m = openModal(`<h2>${c ? "Edit category" : "Add category"}</h2><form id="cf"><div id="cm"></div><div class="field"><label for="cn">Category name</label><input id="cn" required maxlength="60" value="${esc(c?.categoryName)}"></div>
<div class="field"><label for="cd">Description</label><textarea id="cd" maxlength="300">${esc(c?.description)}</textarea></div><button class="btn btn-primary" id="cs">Save category</button></form>`);
    $("#cf", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#cn", m.el).value.trim();
      const err = (t) => { $("#cm", m.el).innerHTML = `<div class="msg err">${esc(t)}</div>`; };
      if (name.length < 2) return err("Enter a category name.");
      const id = c?.id || slug(name);
      if (!id) return err("Use letters or numbers in the name.");
      if (!c && cats.some((x) => x.id === id)) return err("That category already exists.");
      setBusy($("#cs", m.el), true, "Saving…");
      try {
        await setDoc(doc(db, "categories", id), { categoryId: id, categoryName: name, description: $("#cd", m.el).value.trim(), sortOrder: c?.sortOrder ?? cats.length });
        m.close(); toast("Category saved."); await load();
      } catch (e2) { err(friendly(e2)); setBusy($("#cs", m.el), false); }
    });
  };
  $("#add").addEventListener("click", () => form(null));
  body.addEventListener("click", async (e) => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const c = cats.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-edit]")) form(c);
    if (e.target.closest("[data-del]")) {
      if (prods.some((p) => p.category === c.id)) return toast("Move or delete this category's products first.", "err");
      if (confirm(`Delete "${c.categoryName}"?`)) { try { await deleteDoc(doc(db, "categories", c.id)); toast("Category deleted."); await load(); } catch (err) { toast(friendly(err), "err"); } }
    }
  });
  await load();
}

/* ---------- orders ---------- */
const mailLines = {
  Processing: "We are preparing your order.",
  Shipped: "Your order is on its way.",
  Delivered: "Your order was delivered. Thank you for riding with us!",
};

// Changes an order's status in one batch: order, payment, stock (on cancel) and a notification for the customer. Then emails the customer.
async function setStatus(o, status) {
  if (!NEXT[o.orderStatus].includes(status)) throw new Error(`An order that is ${o.orderStatus} cannot become ${status}.`);
  if (o.paymentMethod === "GCash" && status !== "Cancelled" && o.paymentStatus !== "Paid") throw new Error("Verify the GCash payment before processing this order.");
  const batch = writeBatch(db);
  const patch = { orderStatus: status, statusHistory: arrayUnion({ status, at: Timestamp.now() }), updatedAt: serverTimestamp() };
  const payRef = doc(db, "payments", o.paymentId);
  let paidNow = false;
  if (status === "Delivered" && o.paymentMethod === "COD") { patch.paymentStatus = "Paid"; paidNow = true; batch.update(payRef, { paymentStatus: "Paid" }); }
  if (status === "Cancelled") {
    const snaps = await Promise.all(o.products.map((l) => getDoc(doc(db, "products", l.productId))));
    snaps.forEach((s, i) => { if (s.exists()) batch.update(s.ref, { stock: increment(o.products[i].quantity) }); });
    const ps = o.paymentStatus === "Paid" ? "Refund Pending" : o.paymentStatus === "Rejected" ? "Rejected" : "Cancelled";
    patch.paymentStatus = ps; patch.cancelRequested = false;
    batch.update(payRef, { paymentStatus: ps });
  }
  batch.update(doc(db, "orders", o.id), patch);
  const text = status === "Cancelled" ? (o.paymentStatus === "Paid" ? "Your order was cancelled. Because you already paid, we will contact you about your refund." : "Your order was cancelled and the items went back into stock.") : mailLines[status];
  const id = shortId(o.id);
  const n = doc(collection(db, "notifications"));
  batch.set(n, { notificationId: n.id, userId: o.userId, title: `Order #${id} is ${status}`, message: text, isRead: false, createdAt: serverTimestamp() });
  await batch.commit();
  await sendMail(o.customerEmail, o.customerName, `Order #${id} is now ${status} - Smart Bike Shop`, [`Your order #${id} is now ${status}.`, text, `Order total: ${peso(o.totalAmount)}`, "Thank you for choosing Smart Bike Shop!"]);
  if (paidNow) await sendMail(o.customerEmail, o.customerName, `Payment received for order #${id} - Smart Bike Shop`, [`We received your Cash on Delivery payment of ${peso(o.totalAmount)} for order #${id}.`, "Thank you for choosing Smart Bike Shop!"]);
}

async function reviewPayment(o, approve) {
  if (o.paymentStatus !== "Pending Verification") throw new Error("This payment is not waiting for verification.");
  const st = approve ? "Paid" : "Rejected";
  const batch = writeBatch(db);
  batch.update(doc(db, "orders", o.id), { paymentStatus: st, updatedAt: serverTimestamp() });
  batch.update(doc(db, "payments", o.paymentId), { paymentStatus: st, verifiedBy: me.uid, verifiedAt: serverTimestamp() });
  const id = shortId(o.id);
  const title = approve ? `Payment confirmed for order #${id}` : `Payment problem with order #${id}`;
  const text = approve ? `We confirmed your GCash payment of ${peso(o.totalAmount)}. We will start preparing your order.` : "We could not verify your GCash reference number. Please contact the shop so we can sort it out.";
  const n = doc(collection(db, "notifications"));
  batch.set(n, { notificationId: n.id, userId: o.userId, title, message: text, isRead: false, createdAt: serverTimestamp() });
  await batch.commit();
  await sendMail(o.customerEmail, o.customerName, `${approve ? "Payment Confirmed" : "Payment problem"} for order #${id} - Smart Bike Shop`, [text, "Thank you for choosing Smart Bike Shop!"]);
}

async function pOrders() {
  const body = shell("Orders");
  let orders = [], tab = "active", term = "";
  const load = async () => { orders = await all("orders", orderBy("createdAt", "desc")); draw(); };
  const draw = () => {
    const tabs = [["active", "Active"], ["history", "History"], ["all", "All"]];
    const list = orders.filter((o) => (tab === "all" || (tab === "history") === ["Delivered", "Cancelled"].includes(o.orderStatus)) && (!term || `${o.id} ${o.customerName} ${o.customerEmail}`.toLowerCase().includes(term)));
    body.innerHTML = `<div class="toolbar"><div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div><input id="q" type="search" placeholder="Search by order, name or email" aria-label="Search orders" value="${esc(term)}"></div>
${table(["Order", "Date", "Customer", "Total", "Payment", "Status", ""], list.map((o) => `<tr><td>#${shortId(o.id)}</td><td>${fmtDate(o.createdAt)}</td><td>${esc(o.customerName)}<br><span class="muted">${esc(o.customerEmail)}</span></td><td class="num">${peso(o.totalAmount)}</td><td>${o.paymentMethod === "COD" ? "COD" : "GCash"} ${badge(o.paymentStatus)}</td><td>${badge(o.orderStatus)}${o.cancelRequested && o.orderStatus === "Pending" ? ' <span class="badge b-cancelled">Cancel requested</span>' : ""}</td><td><button class="btn btn-ghost btn-sm" data-manage="${o.id}">Manage</button></td></tr>`))}`;
    $("#q").addEventListener("input", (e) => { term = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; draw(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); });
  };
  const manage = async (o) => {
    let pay = null;
    try { const s = await getDoc(doc(db, "payments", o.paymentId)); if (s.exists()) pay = s.data(); } catch { /* ignore */ }
    // Customers' browsers write the order, so check it here before you act on it.
    const warnings = [];
    const lineSum = Math.round(o.products.reduce((n, l) => n + l.price * l.quantity, 0) * 100) / 100;
    if (Math.abs(lineSum - o.totalAmount) > 0.01) warnings.push(`The total (${peso(o.totalAmount)}) does not match the items (${peso(lineSum)}). Do not process this order.`);
    const live = await Promise.all(o.products.map((l) => getDoc(doc(db, "products", l.productId)).catch(() => null)));
    live.forEach((s, i) => { if (s?.exists() && s.data().price !== o.products[i].price) warnings.push(`${o.products[i].productName} was ordered at ${peso(o.products[i].price)} but costs ${peso(s.data().price)} now. This is normal if you changed the price.`); });
    const a = o.deliveryAddress;
    const m = openModal(`<h2>Order #${shortId(o.id)}</h2><div id="om">${warnings.map((w) => `<div class="msg err">${esc(w)}</div>`).join("")}${o.cancelRequested && o.orderStatus === "Pending" ? `<div class="msg err">The customer asked to cancel this order.</div>` : ""}</div><p>${badge(o.orderStatus)} ${badge(o.paymentStatus)} <span class="muted">${fmtDate(o.createdAt)}</span></p>
${table(["Item", "Qty", "Price", "Subtotal"], o.products.map((p) => `<tr><td>${esc(p.productName)}</td><td>${p.quantity}</td><td class="num">${peso(p.price)}</td><td class="num">${peso(p.subtotal)}</td></tr>`))}
<p><b>Total ${peso(o.totalAmount)}</b></p><p><b>${esc(o.customerName)}</b> (${esc(o.customerEmail)})<br>${esc(a.recipientName)}, ${esc(a.phone)}<br>${esc(a.street)}, ${esc(a.barangay)}, ${esc(a.city)}, ${esc(a.province)} ${esc(a.postalCode)}${a.notes ? `<br><i>${esc(a.notes)}</i>` : ""}</p>
<p><b>Payment:</b> ${o.paymentMethod === "COD" ? "Cash on Delivery" : `GCash, reference <b>${esc(pay?.referenceNumber || "-")}</b>`}</p>
<div id="acts" style="display:flex;gap:8px;flex-wrap:wrap">${o.paymentStatus === "Pending Verification" ? `<button class="btn btn-primary" data-pay="1">Verify payment</button><button class="btn btn-danger" data-pay="0">Reject payment</button>` : ""}
${NEXT[o.orderStatus].map((s) => `<button class="btn ${s === "Cancelled" ? "btn-danger" : "btn-dark"}" data-status="${s}">${s === "Cancelled" ? "Cancel order" : "Mark as " + s}</button>`).join("")}</div>`, { wide: true });
    $("#acts", m.el).addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.status === "Cancelled" && !confirm("Cancel this order? Stock is returned and the customer is notified.")) return;
      $$("#acts button", m.el).forEach((x) => (x.disabled = true));
      try {
        if (b.dataset.pay !== undefined) await reviewPayment(o, b.dataset.pay === "1");
        else await setStatus(o, b.dataset.status);
        m.close(); toast("Updated. The customer was notified."); await load();
      } catch (err) { $("#om", m.el).insertAdjacentHTML("afterbegin", `<div class="msg err">${esc(friendly(err))}</div>`); $$("#acts button", m.el).forEach((x) => (x.disabled = false)); }
    });
  };
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; draw(); }
    const mg = e.target.closest("[data-manage]"); if (mg) manage(orders.find((o) => o.id === mg.dataset.manage));
  });
  await load();
}

/* ---------- customers ---------- */
async function pCustomers() {
  const body = shell("Customers");
  const [users, orders] = await Promise.all([all("users", where("role", "==", "customer")), all("orders")]);
  users.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  body.innerHTML = `<div class="toolbar"><input id="q" type="search" placeholder="Search customers" aria-label="Search customers"></div><div id="tbl"></div>`;
  const paint = () => {
    const t = $("#q").value.trim().toLowerCase();
    $("#tbl").innerHTML = table(["Name", "Email", "Verified", "Joined", "Orders"], users.filter((u) => !t || `${u.fullName} ${u.email}`.toLowerCase().includes(t)).map((u) => `<tr><td>${esc(u.fullName)}</td><td>${esc(u.email)}</td><td>${u.emailVerified ? "Yes" : "No"}</td><td>${fmtDate(u.createdAt, false)}</td><td>${orders.filter((o) => o.userId === u.id).length}</td></tr>`));
  };
  $("#q").addEventListener("input", paint);
  paint();
}

/* ---------- reports ---------- */
async function pReports() {
  const body = shell("Sales reports");
  const orders = await all("orders", orderBy("createdAt", "desc"));
  const paid = orders.filter((o) => o.paymentStatus === "Paid" && isSale(o));
  const day = (ts) => ts.toDate().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const days = [...Array(14)].map((_, i) => day({ toDate: () => new Date(Date.now() - (13 - i) * 864e5) }));
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  paid.forEach((o) => { const d = day(o.createdAt); if (d in byDay) byDay[d] += o.totalAmount; });
  const max = Math.max(1, ...Object.values(byDay));
  const units = {};
  orders.filter(isSale).forEach((o) => o.products.forEach((p) => { units[p.productName] = (units[p.productName] || 0) + p.quantity; }));
  const top = Object.entries(units).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const status = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"].map((s) => [s, orders.filter((o) => o.orderStatus === s).length]);
  const rev = paid.reduce((n, o) => n + o.totalAmount, 0);
  const unpaid = orders.filter((o) => isSale(o) && o.paymentStatus !== "Paid").reduce((n, o) => n + o.totalAmount, 0);
  body.innerHTML = `<div class="stats">${stat(peso(rev), "Paid revenue")}${stat(peso(unpaid), "Awaiting payment")}${stat(paid.length, "Paid orders")}${stat(peso(paid.length ? rev / paid.length : 0), "Average paid order")}</div>
<div class="panel"><h2>Paid revenue, last 14 days</h2><div class="bars" role="img" aria-label="Daily paid revenue for the last 14 days">${days.map((d) => `<div class="bar" style="height:${(byDay[d] / max) * 100}%" title="${d}: ${peso(byDay[d])}"></div>`).join("")}</div><div class="bar-l">${days.map((d) => `<span>${d.slice(8)}</span>`).join("")}</div></div>
<div class="row2"><div><h2>Top products by units</h2>${table(["Product", "Units"], top.map(([n, u]) => `<tr><td>${esc(n)}</td><td>${u}</td></tr>`))}</div><div><h2>Orders by status</h2>${table(["Status", "Orders"], status.map(([s, n]) => `<tr><td>${badge(s)}</td><td>${n}</td></tr>`))}</div></div>`;
}

const router = { dashboard: pDashboard, products: pProducts, categories: pCategories, orders: pOrders, customers: pCustomers, reports: pReports };
try { await router[page](); }
catch (e) { console.error(e); ($("#body") || $("#admin")).innerHTML = `<div class="msg err">Could not load this page: ${esc(friendly(e))}</div>`; }
