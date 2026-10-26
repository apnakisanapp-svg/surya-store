# SURYA store (website + separate admin panel)

Two apps, one database:
- **Website** (customers): port 3000
- **Admin panel** (only you): port 4000, listens on 127.0.0.1 only (not open to the internet by default)

## Run on your computer (first time)
1. Install Node.js 20 or newer (nodejs.org).
2. In this folder: `npm install`
3. `npm start`
4. The first start prints your admin email + a one-time password. Copy it. (If you missed it, delete the `data` folder and start again, only before real orders.)
5. Open http://localhost:3000 (website) and http://localhost:4000 (admin). Admin asks you to choose a new password.
6. Optional, to see sample products: `npm run seed:demo`

## First 15 minutes in admin
1. Settings → **Business details**: name, address, support phone/timing, Grievance Officer (you), GST on/off.
2. Settings → **Payments**: your UPI ID, COD rules.
3. **Policies**: read all, edit with a lawyer/CA. **Compliance centre**: tick the checklist.
4. **Purchases**: enter what you paid for stock (freight, duty, GST). Profit verdicts start working.
5. **Products** → Add product: photos, price, details. The **risk checker** on the right tells what must be fixed before publishing (battery, origin, safety text, claims). Product is published only after that.
6. Settings → **Look & theme**: logo, colours, fonts. **Banners & home page**: sections order.
7. Security → turn on 2-step login.

## Daily use
Dashboard shows what needs you: payments to verify (check your bank app for the UTR, press "Payment received"), COD calls, orders to pack, complaints (acknowledge in 48 hours), low stock.
Messages to send: WhatsApp texts open ready-to-send (click). Emails go automatically if `SMTP_URL` is set.

## Put it online
You need a server that keeps files (not Vercel/Netlify). Options: a small VPS (Hostinger/DigitalOcean/AWS Lightsail, about ₹400-600 per month), or Railway/Render **with a persistent disk**.
- Copy `.env.example` to `.env` and fill it. `DATA_DIR` must be on persistent storage.
- Run with `npm start` (use pm2 or systemd to keep it alive), put Nginx/Caddy in front for https.
- Website: point your domain to port 3000.
- Admin: keep it private. Either use an SSH tunnel (`ssh -L 4000:127.0.0.1:4000 you@server`, then open localhost:4000), or give it a separate sub-domain like admin.yourshop.in behind https with `ADMIN_HOST=0.0.0.0` and `ADMIN_IP_ALLOW=your.ip`.
- Docker: `docker build -t surya . && docker run -p 3000:3000 -v surya-data:/data -e ADMIN_HOST=0.0.0.0 ...`
- Backups run daily into `DATA_DIR/backups`. Download one regularly from Admin → Backup and keep it elsewhere.

## Tests
With both servers running: `ORDER_RATE_MAX=1000 npm start` in one terminal, then `npm test` (set ADMIN_EMAIL / ADMIN_PASSWORD).

## Things that need your own accounts or real-world work
See FEATURES.md "Not included".
