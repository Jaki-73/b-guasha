# Real QPay Payments — how to switch from demo to live

## How it works now (demo)

`config.json` has `"paymentsDemo": true`. Top-ups create a fake QR and a "Simulate payment" button. No real money, no internet needed. Perfect for testing.

## How real QPay works

1. Customer picks an amount → our server asks QPay to create an **invoice** → QPay returns a **QR code**.
2. Customer scans it with **any Mongolian bank app** (Khan, Golomt, TDB, Xac…) or the QPay wallet and pays.
3. QPay calls our server's **callback URL** → the server double-checks the payment with QPay → credits the customer's wallet.

All of this is already written in `server.js` (functions `qpayAuth`, `qpayCreateInvoice`, `qpayCheckPaid`, and the `/api/payments/qpay/callback` route). You only add credentials.

## Steps to go live

1. **Register a business** (sole trader or company) with a business bank account — QPay contracts require it.
2. **Apply for a QPay merchant account**: https://www.qpay.mn (or ask your bank — most Mongolian banks resell QPay merchant services). Contact: info@qpay.mn. You receive: `username`, `password`, `invoice_code`.
3. Ask for **sandbox (test) credentials** first. Put them in `config.json`:
   ```json
   "paymentsDemo": false,
   "qpay": {
     "baseUrl": "https://merchant-sandbox.qpay.mn",
     "username": "YOUR_USERNAME",
     "password": "YOUR_PASSWORD",
     "invoiceCode": "YOUR_INVOICE_CODE",
     "callbackBaseUrl": "https://yourdomain.mn"
   }
   ```
4. Test a real sandbox payment end-to-end on your hosted HTTPS site (the callback URL must be reachable from the internet — this won't work on localhost).
5. Switch `baseUrl` to **https://merchant.qpay.mn** (production) with your live credentials.
6. Register with **e-barimt** (https://ebarimt.mn) so customers get VAT receipts — QPay invoices support e-barimt fields; tell me when you're here and I'll wire it in.

Official API documentation: **https://developer.qpay.mn**

## Fees

QPay charges a commission per successful payment (typically around 1%, set in your merchant contract — confirm the exact rate when signing).

## Other Mongolian payment methods (can add later)

SocialPay (Golomt), MonPay, Storepay, Pocket, and direct card payments. The wallet screen already shows a "coming soon" slot for them. QPay alone covers every major bank's app, so it's the right first method.

## Safety rules already built in

- Amount limits 5,000–5,000,000₮ per top-up
- Invoices are tied to the logged-in user; double-crediting is impossible (an invoice can only be marked paid once)
- In real mode the server verifies with QPay (`payment/check`) before crediting — it never trusts the callback blindly
- The "Simulate payment" button refuses to work when `paymentsDemo` is `false`
