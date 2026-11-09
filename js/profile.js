import { boot } from "./app.js";
import { auth, db } from "./firebase-config.js";
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { $, esc, fmtDate, toast, setBusy } from "./ui.js";
import { friendly } from "./auth.js";

const { user } = await boot({ active: "profile", need: "user" });
let profile = {};
try { const s = await getDoc(doc(db, "users", user.uid)); if (s.exists()) profile = s.data(); } catch (e) { console.warn(e); }
const name = profile.fullName || user.displayName || "";

$("#panel").innerHTML = `<section id="profile" class="panel"><h2>My profile</h2>
<p><b>${esc(name)}</b><br>${esc(user.email)}</p><p class="muted">Email ${user.emailVerified ? "verified" : "not verified"}. Member since ${fmtDate(profile.createdAt, false)}.</p></section>
<section id="settings" class="panel"><h2>Account settings</h2><div id="msg"></div>
<form id="name-form" class="field"><label for="fn">Full name</label><div style="display:flex;gap:8px"><input id="fn" value="${esc(name)}" minlength="2" maxlength="80" required><button class="btn btn-primary" id="save">Save name</button></div></form>
<p><button class="btn btn-ghost" id="pw">Email me a password reset link</button></p></section>
<section class="panel"><h2>Notifications</h2><div id="notes"><p class="muted">Loading…</p></div></section>`;

$("#name-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = $("#fn").value.trim();
  if (v.length < 2) return toast("Enter your full name.", "err");
  setBusy($("#save"), true, "Saving…");
  try {
    await updateProfile(auth.currentUser, { displayName: v });
    await updateDoc(doc(db, "users", user.uid), { fullName: v });
    toast("Name updated.");
  } catch (err) { toast(friendly(err), "err"); }
  setBusy($("#save"), false);
});
$("#pw").addEventListener("click", async () => {
  try { await sendPasswordResetEmail(auth, user.email, { url: new URL("login.html", location.href).href }); toast("Password reset link sent to your email."); }
  catch (err) { toast(friendly(err), "err"); }
});

onSnapshot(query(collection(db, "notifications"), where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(20)), (snap) => {
  $("#notes").innerHTML = snap.empty ? `<p class="muted">No notifications yet.</p>` : snap.docs.map((d) => {
    const n = d.data();
    return `<div class="order" style="${n.isRead ? "" : "border-color:var(--green)"}"><b>${esc(n.title)}</b><br>${esc(n.message)}<br><span class="muted">${fmtDate(n.createdAt)}</span>${n.isRead ? "" : ` <button class="linklike" data-read="${d.id}">Mark as read</button>`}</div>`;
  }).join("");
}, (err) => { console.error(err); $("#notes").innerHTML = `<p class="muted">Notifications are unavailable right now.</p>`; });
$("#notes").addEventListener("click", (e) => { const id = e.target.dataset.read; if (id) updateDoc(doc(db, "notifications", id), { isRead: true }); });
