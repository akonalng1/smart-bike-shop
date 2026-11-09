import { auth, db, SHOP } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, updateProfile, setPersistence, browserLocalPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { $, BASE, safeNext, setBusy } from "./ui.js";
import { sendMail } from "./mailer.js";

const GMAIL_RE = /^[a-z0-9](?:[a-z0-9.+]{0,62}[a-z0-9])?@gmail\.com$/;

// Resolves once with the signed-in user. Unverified users count as signed out. Admin = role "admin" on the user's profile.
export const authReady = new Promise((resolve) => {
  const off = onAuthStateChanged(auth, async (u) => {
    off();
    const user = u && u.emailVerified ? u : null;
    let admin = false;
    if (user) { try { admin = (await getDoc(doc(db, "users", user.uid))).data()?.role === "admin"; } catch { /* no profile yet */ } }
    resolve({ user, admin });
  });
});

export async function logout() {
  await signOut(auth);
  location.href = BASE + "index.html";
}

const verifyUrl = () => new URL("index.html?verified=1", location.href).href;

export function friendly(e) {
  const map = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "An account with this Gmail already exists. Sign in instead.",
    "auth/weak-password": "Choose a stronger password.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "permission-denied": "That action was not allowed. If you paid with GCash, the reference number may already be used. Otherwise refresh and try again.",
    unavailable: "Network problem. Check your connection and try again.",
  };
  return map[e?.code] || (e?.message || "Something went wrong. Please try again.").replace(/^Firebase: /, "").replace(/ ?\(auth\/[a-z-]+\)\.?$/, "");
}

const show = (kind, text) => { $("#msg").innerHTML = text ? `<div class="msg ${kind}">${text.replace(/</g, "&lt;")}</div>` : ""; };
const field = (f, n) => f.elements[n];

async function register(f) {
  const fullName = field(f, "fullName").value.trim();
  const email = field(f, "email").value.trim().toLowerCase();
  const pw = field(f, "password").value;
  if (fullName.length < 2) throw new Error("Enter your full name.");
  if (!GMAIL_RE.test(email)) throw new Error("Use a valid Gmail address (name@gmail.com).");
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new Error("Password needs at least 8 characters with a letter and a number.");
  if (pw !== field(f, "confirm").value) throw new Error("Passwords do not match.");
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  await updateProfile(cred.user, { displayName: fullName });
  await sendEmailVerification(cred.user, { url: verifyUrl() });
  try {
    await setDoc(doc(db, "users", cred.user.uid), { uid: cred.user.uid, fullName, email, role: "customer", createdAt: serverTimestamp(), emailVerified: false });
  } catch (e) { console.warn("Profile will be created at first sign-in", e); }
  await sendMail(email, fullName, "Welcome to Smart Bike Shop", [
    "Thanks for creating a Smart Bike Shop account. We sent a separate message with a link to verify your email address. Open it, then sign in to start shopping.",
    "Thank you for choosing Smart Bike Shop!",
  ]);
  await signOut(auth);
  return email;
}

// Makes sure the profile exists and is up to date, sends the login alert, and reports whether this user is an admin.
async function afterLogin(user) {
  const ref = doc(db, "users", user.uid);
  const email = user.email.toLowerCase();
  const snap = await getDoc(ref);
  let profile;
  if (!snap.exists()) {
    profile = { uid: user.uid, fullName: user.displayName || email.split("@")[0], email, role: "customer", createdAt: serverTimestamp(), emailVerified: true };
    await setDoc(ref, profile);
  } else {
    profile = snap.data();
    if (!profile.emailVerified) await updateDoc(ref, { emailVerified: true });
  }
  const last = Number(localStorage.getItem("sbs_login_mail") || 0);
  if (SHOP.loginAlerts && Date.now() - last > 30000) {
    localStorage.setItem("sbs_login_mail", Date.now());
    const now = new Date(), tz = { timeZone: "Asia/Manila" };
    sendMail(email, profile.fullName, "New Login to Smart Bike Shop", [
      "Your Smart Bike Shop account was successfully accessed.",
      `Login Date: ${now.toLocaleDateString("en-PH", { ...tz, dateStyle: "long" })}\nLogin Time: ${now.toLocaleTimeString("en-PH", { ...tz, timeStyle: "medium" })} (Philippine Time)\nAccount: ${email}`,
      "If you do not recognize this activity, please secure your account.",
      "Thank you for choosing Smart Bike Shop!",
    ]);
  }
  return profile.role === "admin";
}

async function login(f) {
  const email = field(f, "email").value.trim().toLowerCase();
  const pw = field(f, "password").value;
  if (!email || !pw) throw new Error("Enter your email and password.");
  await setPersistence(auth, field(f, "remember").checked ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  if (!cred.user.emailVerified) {
    try { await sendEmailVerification(cred.user, { url: verifyUrl() }); } catch { /* rate limited */ }
    await signOut(auth);
    throw new Error(`Your email is not verified yet. We sent a verification link to ${email}. Open it, then sign in again.`);
  }
  try { return await afterLogin(cred.user); } catch (e) { console.warn(e); return false; }
}

if (document.body.dataset.page === "login") {
  const { user } = await authReady;
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (user) location.replace(next || "index.html");
  const f = $("#login");
  if (next) show("ok", "Sign in to continue. Your cart is saved.");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    show("", "");
    setBusy($("#go"), true, "Signing in…");
    try {
      const isAdmin = await login(f);
      location.replace(next || (isAdmin ? "admin/dashboard.html" : "index.html"));
    } catch (err) {
      show("err", friendly(err));
      setBusy($("#go"), false);
    }
  });
  $("#forgot").addEventListener("click", async () => {
    const email = field(f, "email").value.trim().toLowerCase();
    if (!email) return show("err", "Enter your email above first.");
    try { await sendPasswordResetEmail(auth, email, { url: new URL("login.html", location.href).href }); } catch (e) { if (e.code === "auth/invalid-email") return show("err", friendly(e)); }
    show("ok", "If an account exists for that email, a password reset link is on its way.");
  });
}

if (document.body.dataset.page === "register") {
  const f = $("#register");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    show("", "");
    setBusy($("#go"), true, "Creating account…");
    try {
      const email = await register(f);
      f.innerHTML = `<h2>Check your inbox</h2><div class="msg ok">We sent a verification link to ${email.replace(/</g, "&lt;")}. Open it to activate your account.</div><p><a class="btn btn-primary" href="login.html">Go to sign in</a></p>`;
    } catch (err) {
      show("err", friendly(err));
      setBusy($("#go"), false);
    }
  });
}
