import { SHOP } from "./firebase-config.js";
import { esc } from "./ui.js";

// Sends one email through EmailJS (your Gmail is connected there). Failures never block shopping.
let emailjs;
export async function sendMail(to, name, subject, lines) {
  const c = SHOP.emailjs;
  if (!c.publicKey || !c.serviceId || !c.templateId) { console.warn("EmailJS is not set up, email skipped:", subject); return false; }
  try {
    if (!emailjs) { const m = await import("https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/+esm"); emailjs = m.default || m; }
    await emailjs.send(c.serviceId, c.templateId, {
      to_email: to, to_name: name, subject,
      message_html: lines.map((l) => `<p style="margin:0 0 14px">${esc(l).replace(/\n/g, "<br>")}</p>`).join(""),
    }, { publicKey: c.publicKey });
    return true;
  } catch (e) { console.warn("Email failed:", e); return false; }
}
