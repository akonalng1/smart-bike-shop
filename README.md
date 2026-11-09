# Smart Bike Shop (Firebase, free Spark plan)

Bike parts ordering system built with Firebase Authentication, Cloud Firestore and Firebase Hosting, plus EmailJS for emails. It runs on the **free Spark plan** with no payment card, so it uses no Cloud Functions, Cloud Storage, PHP or MySQL.

## How it fits together

| Part | Job |
|---|---|
| `*.html`, `js/*.js`, `css/style.css` | The website (Firebase JS SDK v10 from the CDN, no build step) |
| `firestore.rules` | Who can read and write what. This is the security layer |
| `js/mailer.js` | Sends emails through EmailJS, using your Gmail account |
| `js/checkout.js` | Places orders in one Firestore transaction |
| `js/admin.js` | Admin pages: products, categories, orders, payments, customers, reports |

How it works on the free plan:
- **Admin** = a user whose profile document has `role: "admin"`. Customers cannot change their role (the rules forbid it), so you promote an admin by editing that one field in the Firebase console.
- **Orders** are created by the customer's browser in one transaction that re-reads the cart and the live prices, checks stock, lowers stock and saves the order and payment together. The rules only allow a customer to create a correctly shaped order for themselves, to *lower* stock, and to use each GCash reference once.
- **Cancelling:** a customer can only *request* cancellation. The admin cancels, which returns the stock and notifies the customer.
- **Product photos** are shrunk in the browser and stored inside the product document (no Storage needed). You can also paste an image link.
- **Buy Now** adds the item to the cart and opens checkout. Guests are sent to `login.html?next=checkout.html`; their cart is merged into their account on sign-in, then they land back on checkout.
- Registration accepts **@gmail.com addresses only**.

## 1. Create the Firebase project

1. https://console.firebase.google.com > Add project.
2. **Build > Authentication > Get started > Email/Password > Enable.**
3. **Build > Firestore Database > Create database**, production mode, a nearby location (for example `asia-southeast1`).
4. **Project settings > Your apps > Web (`</>`)**: register an app and copy the config into `js/firebase-config.js`. Put your real GCash number and name there too.
5. Skip Storage. You do not need it.

## 2. Install the tools and deploy

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # choose your project, alias: default
firebase deploy --only firestore,hosting
```

Your site is then live at `https://YOUR_PROJECT_ID.web.app`. To see changes after editing a file, run the deploy again.

## 3. Set up EmailJS (order, payment, status and login emails)

Firebase Authentication already sends the **verification** and **password reset** emails. EmailJS sends everything else.

1. Create a free account at https://www.emailjs.com.
2. **Email Services > Add New Service > Gmail**, and connect the Gmail account that will send your shop emails. Note the **Service ID**.
3. **Email Templates > Create New Template**. Set:
   - **Subject:** `{{subject}}`
   - **To Email:** `{{to_email}}`
   - **From Name:** `Smart Bike Shop`
   - **Content** (switch to the code editor): 
   ```html
   <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e3e3e3;border-radius:8px;overflow:hidden"><div style="background:#000;color:#fff;padding:16px 20px;font-size:20px;font-weight:bold"><span style="color:#3ddc84">Smart</span> Bike Shop</div><div style="padding:20px;color:#111;font-size:15px;line-height:1.5"><p>Hello {{to_name}},</p>{{{message_html}}}</div></div>
   ```
   Save it and note the **Template ID**. One template serves every email.
4. **Account > General**: copy your **Public Key**.
5. Paste the three values into `emailjs` in `js/firebase-config.js`, then redeploy.
6. In EmailJS **Account > Security**, restrict the allowed domains to your site if your plan offers it.

The free plan allows about 200 emails a month, shared by every email the shop sends. Each sign-in sends a login alert; set `loginAlerts: false` in `firebase-config.js` to save quota.

## 4. Make yourself the admin

1. Register a normal account on your site and verify its email.
2. Firebase console > **Firestore Database > users** > open your document > change `role` from `customer` to `admin` > Update.
3. Sign out and sign in again. An **Admin** link appears in the header.
4. Open Admin > Products and click **Load sample categories and products**. Then add photos.

## 5. Test it

Use two Gmail accounts: one customer, one admin.

| # | Test | Expected |
|---|---|---|
| 1 | Register with a non-Gmail address | Rejected with a message |
| 2 | Register with a Gmail address | "Check your inbox". The verification email and the welcome email arrive |
| 3 | Sign in before verifying | Refused, and a new verification link is sent |
| 4 | Open the verification link | Lands on the homepage with a "verified" message |
| 5 | Sign in | Your name shows in the header. A "New Login to Smart Bike Shop" email arrives |
| 6 | Forgot password | Reset email arrives and the new password works |
| 7 | Signed out, add two products, then click **Buy now** on a third | Redirected to login, and the cart still has the items |
| 8 | Sign in | Returned to checkout with all the products |
| 9 | Order with Cash on Delivery | Order saved, payment Pending, confirmation email arrives, stock drops |
| 10 | Order with GCash and a reference | Payment "Pending Verification". Reusing the same reference is refused |
| 11 | Try to buy more than the stock | Refused, with the quantity left |
| 12 | Admin: Orders > Manage a GCash order > Verify payment | Customer gets a payment email and a notification |
| 13 | Mark Processing, Shipped, Delivered | Customer gets an email each time and My Orders updates live |
| 14 | Deliver a COD order | Payment becomes Paid and a payment email is sent |
| 15 | Customer: Request cancellation on a Pending order. Admin: Cancel order | Stock returns and the customer is emailed |
| 16 | Admin: add, edit, delete a product, upload a photo, change stock inline | Changes appear in the shop |
| 17 | Admin: Reports | Revenue, top products and status counts match your orders |
| 18 | As a customer, open `admin/dashboard.html` | Redirected to the homepage |
| 19 | As a customer in the browser console, try to change a product price or read another user's order | Permission denied |

## Known limits of the free plan

Be upfront about these in your documentation:
- **Orders are written by the browser.** The rules stop a customer from touching other people's data, changing prices or raising stock, but they cannot recompute an order's total. A technical user could submit an order with wrong prices. The admin order screen checks every order's total and prices and warns you before you process it.
- **Stock can be lowered by any signed-in customer** (that is how checkout works without a server). Someone could abuse that to hide items. You can set stock back in Admin > Products.
- **EmailJS keys are public.** Anyone who reads your site code could send emails through your EmailJS quota, and the free plan caps it. Cloud Functions with Gmail SMTP (Blaze plan) is the safer design if you upgrade later.

## Troubleshooting

- **"The query requires an index"**: run `firebase deploy --only firestore:indexes` and wait a few minutes.
- **Products do not show**: they must have status Active and the category must exist. Use the sample data button in Admin > Products.
- **Admin link missing**: sign out and in again, and check that the `role` field says exactly `admin`.
- **No emails**: open the browser console on the page. A warning such as "EmailJS is not set up" means a key is missing in `firebase-config.js`.
- **Permission denied when ordering**: redeploy the rules with `firebase deploy --only firestore`.
