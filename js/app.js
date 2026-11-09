import { authReady, logout } from "./auth.js";
import { initCart, onCartChange, cartCount } from "./cart.js";
import { $, $$, esc, BASE } from "./ui.js";

const here = () => location.pathname.split("/").pop() + location.search;

// Every page calls boot(): waits for auth, enforces access rules, loads the cart, then draws the header and footer.
export async function boot({ active = "", need = null } = {}) {
  const { user, admin } = await authReady;
  if (need === "user" && !user) { location.replace(`${BASE}login.html?next=${encodeURIComponent(here())}`); return new Promise(() => {}); }
  if (need === "admin" && !admin) { location.replace(BASE + "index.html"); return new Promise(() => {}); }
  await initCart(user ? user.uid : null);
  chrome(user, admin, active);
  if (new URLSearchParams(location.search).get("verified") && !user) {
    const { toast } = await import("./ui.js");
    toast("Email verified. Sign in to start shopping.");
  }
  return { user, admin };
}

function chrome(user, admin, active) {
  const on = (k) => (active === k ? 'class="on"' : "");
  const first = esc((user?.displayName || user?.email || "").split(" ")[0]);
  $("#nav").innerHTML = `<header class="nav" id="hdr"><div class="wrap nav-in">
<a class="brand" href="${BASE}index.html"><span>Smart</span> Bike Shop</a>
<div class="menu" id="menu"><a href="${BASE}index.html" ${on("home")}>Home</a><a href="${BASE}products.html" ${on("shop")}>Shop</a>${admin ? `<a href="${BASE}admin/dashboard.html" ${on("admin")}>Admin</a>` : ""}<span class="sp"></span>
${user ? `<a href="${BASE}orders.html" ${on("orders")}>My orders</a><a href="${BASE}profile.html" ${on("profile")}>${first}</a><button class="linklike" id="logout">Logout</button>`
       : `<a href="${BASE}login.html">Sign in</a><a class="btn btn-primary btn-sm" href="${BASE}register.html">Sign up</a>`}</div>
<a class="cart-link" href="${BASE}cart.html" aria-label="Cart">Cart <span class="count" id="cart-count">0</span></a>
<button class="burger" id="burger" aria-label="Menu" aria-expanded="false">☰</button></div></header>`;
  $("#foot").innerHTML = `<footer class="foot"><div class="wrap"><b>Smart Bike Shop</b><br>Bicycle parts and accessories. Pay with GCash or cash on delivery.</div></footer>`;
  const setCount = () => { $("#cart-count").textContent = cartCount(); };
  setCount();
  onCartChange(setCount);
  $("#burger").addEventListener("click", () => { const o = $("#hdr").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", o); });
  $("#logout")?.addEventListener("click", logout);
  dashNav();
}

function dashNav() {
  const el = $("#dash-nav");
  if (!el) return;
  const items = [["profile.html#profile", "My profile"], ["cart.html", "My shopping cart"], ["orders.html#orders", "My orders"], ["orders.html#history", "Order history"], ["orders.html#track", "Track my order"], ["profile.html#settings", "Account settings"]];
  el.innerHTML = items.map(([h, l]) => `<a href="${h}" data-h="${h}">${l}</a>`).join("") + `<button class="linklike" id="dash-logout">Logout</button>`;
  $("#dash-logout").addEventListener("click", logout);
  const mark = () => {
    const file = location.pathname.split("/").pop();
    const hash = location.hash || (file === "orders.html" ? "#orders" : "#profile");
    $$("a", el).forEach((a) => { const [p, h] = a.dataset.h.split("#"); a.classList.toggle("on", p === file && (!h || "#" + h === hash)); });
  };
  mark();
  addEventListener("hashchange", mark);
}
