// 1. Firebase console > Project settings > Your apps > Web app: paste your config below.
// 2. Put your real GCash number and name in SHOP.
// 3. Fill in the EmailJS keys (see README, step 3). Leave them empty to run without emails.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBoSl5-Qc9SqvExOf1c7r72FS_ZZyvjnHA",
  authDomain: "smart-bike-shop.firebaseapp.com",
  projectId: "smart-bike-shop",
  storageBucket: "smart-bike-shop.firebasestorage.app",
  messagingSenderId: "704775839037",
  appId: "1:704775839037:web:53a5206d2f717aee0c7954",
};

export const SHOP = {
  name: "Smart Bike Shop",
  gcashNumber: "09608652459",
  gcashName: "Angelo Bryan Anzano",
  loginAlerts: false, // each sign-in sends one email; set false to save your EmailJS quota
  emailjs: { publicKey: "K7kDyVQka7F2ePz-2", serviceId: "service_nrgr66g", templateId: "template_1bmphs8" },
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
