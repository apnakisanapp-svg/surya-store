# SURYA project notes (everything decided in the chat)

## Goal
Full online shop "SURYA" (Surya Enterprises): public website + separate owner-only admin panel. Hindi/English, premium look, owner controls everything from admin. Payments: UPI (manual UTR check) + COD. Return only for damaged/defective items within 7 days. Orders must be taken on the website itself.

## Owner situation / rules
- First-time builder, part-time, no money for hosting: prefer Rs 0. Small Rs 1-2 verification is OK; no Rs 1,000 prepayment.
- Owner is under 18: a parent/adult must be the legal owner of cloud, payment-gateway and business accounts (AWS is now verified on a parent's identity).
- Never share: passwords, OTP, MFA codes, tokens, .pem key, Aadhaar. Hide phone/address in screenshots.

## What is built
See README.md and FEATURES.md. Highlights: risk checker before publishing, profit centre, purchases with landed cost, policies/compliance, grievance rules, coupons, banners, reviews, messages, 2-step login, backups, activity log.
Added in this version:
- UPI unique paise: every waiting UPI order gets a slightly different amount (price minus 0.01 to 0.99). Admin → Orders → "Match payments": paste bank/UPI statement text, the app suggests which order was paid (sure = amount + UTR, check = amount only). Owner still presses "Payment received". Setting: Settings → Payments → unique paise.
- Delivery tracking: when you ship, courier name + number makes a tracking link for the customer.
- Admin fixes: all "Yes / Are you sure" popups work (trash, delete, bulk). Trash tab has Restore and Delete forever. Risk-checker ticks stay saved.
- UPI orders no longer say "Order placed" before payment: customer sees "Almost done: complete your payment" / "Payment being checked", and the confirmed message goes only after you press Payment received.
- Customer site: floating glass bottom bar on PC and mobile (Home, Shop, Orders, Cart, Account) with a liquid bubble that stretches and settles when you change tab, icon pop, slide-up entrance. Login/Create account no longer shows the word "null".
- New gold SURYA sun logo (header/footer/favicon) and a premium opening animation (dark screen, glow, rays draw in, letters shine, zoom-through exit). Plays once per visit, skipped when the visitor has "reduce motion" on. File: web/css/splash.css + web/js/splash.js + markup in web/index.html. If you upload your own logo in Admin, header uses yours; the opening screen keeps the sun.
- Orders with photos: customer My orders shows every order as a card with product photos, qty, price; tapping a product opens its page. Admin: Customers -> Orders (or order page -> "All orders of this buyer") shows every order of that phone number (account or guest) with photos and links to products.
- Fixed: customers stayed logged out after a page reload (server did not read the login cookie when building the page); order-line photos were built with a wrong path (also in admin order page).
- Glossy 3D WhatsApp-style chat button (own drawing, not the official logo).
- Optional free Telegram alerts to the owner's phone for every new order and every UTR submitted (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env).
- Free-hosting sync (GitHub) for Render, kept for fallback (FREE-HOSTING.md).

## Hosting history
- Firebase: no (static hosting only). Google Cloud: no (Rs 1,000 prepayment). Alibaba: no.
- Render + GitHub sync: free fallback (server sleeps, needs UptimeRobot).
- AWS: chosen. Free plan, Mumbai. Verification done (name + address verified). Server `surya-server` (t3.micro, Ubuntu 24.04, 20 GB) is running. Next steps are in AWS-SERVER-SETUP.md.

## Still to do (tomorrow)
1. Upload newest files to GitHub (src, admin-web, scripts, package.json), repo Public.
2. Follow AWS-SERVER-SETUP.md steps 1-9.
3. Fill the shop in admin: business details, UPI ID, policies (CA/lawyer to check), products with real photos, theme/logo.
4. Test a real order with a small amount and COD.
5. Later: domain + https, courier API, online payment gateway (adult KYC), WhatsApp API.

## Needs real-world work (not code)
GST/BIS advice, final policy wording, real photos and logo, payment gateway KYC.

## Update: login, COD advance, unpaid orders
- Login: email + 6-digit code (free). Mobile is just typed and saved. Without SMTP_URL the code prints in the server console (dev only; in production set SMTP_URL).
- COD advance: Admin > Settings > Payments (cod_advance_*). e.g. COD order above the minimum pays Rs 99 first by UPI; the rest is collected on delivery. Cancelled orders show "refund due" and the owner marks it refunded.
- Unpaid UPI / advance orders wait as "payment_pending": not in Needs action, no Telegram/WhatsApp alert until the customer submits the UTR.
- Banner/category photos fall back to the -img.webp variant.
- Tests: fresh DB, OTP_LOG_FILE=/tmp/otp.log, then node test/run.js (49 checks).

## Update (7 Nov): product payment rule, banner, login, emails
- Product edit > "Payment rule": Normal / UPI only / COD with compulsory advance (strictest rule in the cart wins).
- Uploaded banners show the whole picture with a blurred copy behind; text sits on a soft gradient.
- Opening animation plays on the first visit of each browser tab, even if the computer has "reduce animations" on.
- Login: 4 steps (email, 6-box code, first/last name + mobile, address with Skip). Top-bar account menu: profile, orders, track, wishlist, addresses, log out.
- Emails: branded HTML (logo, big code boxes). Password change sends a "password was changed" mail, never the password.
- Pincode does not auto-fill city/state (no free source); customers type them.
- Pages: /orders (tabs My orders + Track order), /wishlist, /profile (tabs Profile + Addresses). /account and /track still work and forward there. Glass sliding-pill tabs (segTabs in pages2.js). Account dropdown is mounted on <body> so its blur is real glass.
- Deleting an account: password users type their password; email-code users type DELETE.

## Update (9 Nov): phone pass
- Login cookie is SameSite=Lax (links from WhatsApp/Instagram keep you logged in). SECURE_COOKIES=0 now really turns Secure off; unset = on in production.
- Phone: top bar shows only menu, logo, search, cart (account/wishlist/language are in the bottom bar and menu). Slim cookie notice, hidden on login/checkout.
- Opening animation: ~2s and light on phones, tap to skip.
- Old browsers: fallbacks for color-mix() and backdrop-filter so glass never disappears.
- /orders no longer scrolls sideways on phones.

## 10 Nov: glass pass 2
- Top bar: heart (wishlist) on phone + PC; cart only in bottom bar; cart panel is glass with a new empty state.
- Orders / Profile glass cards; Profile has a sticky Save bar (enabled only when something changed + Undo). Addresses: add, edit, make default, remove (PUT /account/addresses/:id, POST /account/addresses/:id/default).
- Home: category tiles 3 per row phone / 6 on PC with tints; product cards glass; hero text sizes adjusted.
- Footer: full only on home; other pages show a slim Terms · Privacy · Refund · Contact strip.
- Product page: gallery arrows no longer open the full photo; glass arrows/thumbs; Add to cart (frosted) vs Buy now (gold); returns text moved to "Returns & replacement" tab ("Easy 7-day replacement").
- Checkout: only the battery/safety tick remains; terms are a fine-print line (terms:true sent automatically); address auto-saved for logged-in users; gift is a switch; marketing opt-in lives in Profile (default off).
- Link preview: src/public/share.js makes 1200x630 JPEG cards at /share/home.jpg and /share/p/<slug>.jpg (home uses the admin "Picture shown when the link is shared" if set, converted to JPEG). og:image URL carries a version hash so WhatsApp refreshes after changes.
- Tests: `ORDER_RATE_MAX=200` when running test/run.js (order rate limit).

## 10 Nov (2)
- WhatsApp floating icon removed everywhere; WhatsApp button lives on /contact (Support).
- Discount % counts up (pctBadge in ui.js) on cards and product page.
- ☰ menu is glass with staggered slide-in pills (.menu-glass).
- Product page: one glass bottom bar (.buybar): qty − +, total, delivery/Free delivery, Add to cart + Buy now. Page text sizes reduced. (Class .pbar is the top progress bar, do not reuse.)
- SEO: set SITE_URL=https://suryastore.shop in server .env (sitemap/canonical), then Google Search Console (meta tag goes in Admin > SEO "verification_google").

## 10 Nov (3)
- Login: /auth/otp/send answers within ~0.35s; the mail is finished in the background (fails -> logged; customer can press Resend). Early failure (e.g. mail not set up) still shows the error.
- Price, discount and total animate on every phone (also with "reduce motion"); MRP strike-through draws left to right.
- Product page: bottom nav hidden (body.on-product), ← back button in the top bar (phone replaces ☰), buy bar sits at the bottom.
- Checkout: Next/Back scroll to the top of the steps with a slide-in; glass Next buttons; invalid field is scrolled into view.
- Price animation v2 (fillPrice in ui.js): MRP -> red cut line -> price falls to real price -> % off pops; plays per card only when it scrolls into view (IntersectionObserver, no timers).
- Home trust strip (UPI/COD, 7-day, WhatsApp support): 3 compact glass tiles per row on phone and PC.
- Bottom nav: clearer glass + rim light, gold active state, ripple, gold cart badge. Checkout: .co-nav row (small glass Back left, gold Place order right; sticky glass bar on phone).

## 10 Nov audit
- Full crawl (26 routes x phone/PC): no overflow, no JS errors, no broken images; admin APIs OK; no secret files exposed.
- npm audit fix --force: sharp 0.35.5, nodemailer 10.5, body-parser/multer patched (0 vulnerabilities). Server needs: npm install --omit=dev after git pull.
- Unknown URLs now return HTTP 404 (was 200 soft-404).

## 11 Nov: smart search
- src/shared/search.js: synonym groups (Hindi/English/Hinglish), key() flattening, typo tolerance (Levenshtein), prefix match, fallback related()/popular. catalog.listPublic uses it (index cached 15 s, dropped on reindex). /products and /suggest return `fallback` ('similar'|'popular') when nothing matches; shop page shows a note. Add new synonym lines in GROUPS (search.js).
- Admin product form: "Search words" (the old tags field) + "Copy prompt for AI" button. Empty box is fine: name + category are always searched.
- Glass search panel, suggestions, fallback note.

## 12 Nov: logo, back button, SEO, reviews, page editor
- New brand logo (bag + S + sun) in web/img: favicon (.ico, 16/32/48), apple-touch-icon, icon-192/512, icon-maskable-512, logo.png/.webp. Header shows logo + gradient "SURYA". Splash screen unchanged. Share card and emails use the new logo.
- Back button: every drawer/modal/search/photo viewer pushes one history entry (core.js pushOverlay/releaseOverlay/overlayPopped); phone back closes the top overlay first. Tested: cart, search, menu, popup, checkout.
- SEO: per-page titles/descriptions (home, shop, about, contact, faq, grievance, each policy), brand name "SURYA Store", Organization + WebSite JSON-LD with alternate names (SURYA, SURYA Shop, SURYA Store India).
- Reviews: text is optional (stars only allowed, 1-2 characters rejected). Star-only reviews count in the average but are not listed. Admin > Reviews has "Approve all star-only".
- About default text no longer says "Write your story here" (ABOUT_DEFAULT in policies-default.js).
- Admin pages (About/policies) use a plain-text editor (# heading, - list, **bold**, [Insert] placeholders) with "Advanced (HTML)" toggle; old HTML pages still work.
- Admin "View" links use the same host on the live site (no :3000).

## 14 Nov — per-product services & rules
- products table: adv_type (none/fixed/percent), adv_value, gift_rule (yes/no), gift_price, ret_rule (replacement/refund/either/exchange/none), ret_days, ship_rule (free/paid), plus existing pay_rule. Blank = follow Settings. order_items snapshots ret_rule/ret_days.
- src/shared/rules.js turns a product row into effective rules. pricing.priceCart: advances of products are SUMMED (pricing.cartAdvance); "none" on every item = no advance; else global rule. ship_rule free (all items) = free, paid = never free. Gift off if any item says no; price = highest own price.
- Return requests (orders.serializeForCustomer + /orders/:n/request) follow each item's rule and days; "No return" still handled by chat for damaged/wrong items.
- Admin: Product edit > "Services & rules for this product". Tests added in test/run.js (use ORDER_RATE_MAX=500 and a seeded fresh DATA_DIR).
