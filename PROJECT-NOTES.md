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

## 15 Nov — checkout in 4 steps, district, advance split, small fixes
- Checkout steps: Contact > Address > Payment > Review (web/js/pages2.js, stepper CSS `.stp*` at end of app.css). Completed steps are tappable.
- District: new field (optional on the server, required in the checkout form). `addresses.district` column; order address JSON carries `district`; shown in admin order, packing slip, customer order page, account addresses.
- Pincode helper: `GET /api/pincode-info/:pin` asks India Post's free public API (only the 6-digit pincode leaves the server), cached in table `pin_cache`. If it fails the customer types city/district/state. (The old `/api/pincode/:pin` is the delivery check.)
- COD advance: review step shows "Now by UPI (advance) / On delivery / Total"; side panel and order page show the same split.
- Account page: "Set a password" card removed (login is by email code only). Resend code shows a highlighted Spam/Promotions box. Login email: single selectable code, subject "123456 is your SURYA login code".
- Back-to-top button is glass (`.gl-top`).
- 15 Nov (later): "Buy now" used cart.add (+qty) so a product already in the cart ended up with a higher quantity; now `cart.buyNow` sets the exact quantity. Address step is 2 columns on phone (pincode+city, district+state). Review box lists Items / Discount / Delivery / Gift / COD charge / Total, then "Pay now by UPI" and "Pay on delivery". MRP-cut-off issue parked by owner.
- 16 Nov: cart drawer showed Subtotal/Checkout/Cart twice after +/-: two refreshes ran at once and the footer was never cleared after the price call. Now the newest refresh wins, later updates run quietly (no skeleton flash), footer is cleared together with the body.

## 19 Nov — Services form, Buy now checkout, fast quantity, glass header
- Product add/edit (bottom) and Settings > Payments (store defaults) share ONE 6-question "Services" panel (admin-web/js/lib.js `servicesPanel`): COD, advance ₹, COD charge, gift wrap, delivery, return + days. Blank / "Same as store" on a product uses the store default. Old advance/gift/flat/window fields removed from Settings pages.
- DB: products.cod_fee_rule, cod_fee_value, ship_value. Legacy adv_type/ship_rule 'paid' are read as nearest new option (src/shared/rules.js).
- Buy now: item kept in sessionStorage (`buyItem`), checkout at /checkout?buy=1 prices/orders only that item; cart untouched.
- Quantity +/-: instant UI, debounced background reprice, newest wins; blue tap flash removed.
- Glass: round gold menu button, glass logo pill (header only, splash unchanged), glass checkout stepper.

## 19 Nov (2) — Loading + upload progress (gold glass)
- Shop (web/js/core.js + app.css): top gold line on page change/API calls, glass shimmer page skeletons (by page type), gold dots on the button that was tapped, "Placing your order…" sun-ring overlay, slow-net pill after 3 s, glass "You're offline / Try again" card (old red bar removed), photo blur-up, upload card with ring + % + MB + Cancel for customer uploads (XHR).
- Admin (admin-web/js/lib.js, router.js, admin.css): every api() call with a form shows an upload card (ring, %, MB, Cancel, failure text); top gold line; shimmer skeleton while a page loads; busy buttons show gold dots and "Saved ✓".

## 20 Nov — Release 1 (back scroll, adaptive glass, MRP line, cache, order page)
- Back/forward: scroll position + earlier "Load more" pages restored; list/home/product data shown from memory for 3 min on back only (core.js `wasBack`, `pagesSeen`, GET cache). Normal visits always fetch fresh.
- Adaptive glass: header and bottom bar read what is behind them (white/cream, photo, dark) and set `data-tone`; CSS gives each tone its own glass (ui.js `adaptBars`, app.css end).
- MRP strike-through: old price never clipped at the sides (app.css end).
- "Admin change not visible": API GET responses now `Cache-Control: no-cache`; js/css/html are revalidated on every load (src/public/server.js). Pictures stay cached.
- Admin order page: summary card on top (status, photo, who, total, payment line, call/WhatsApp, "What to do now"), bigger item photos, history/profit/notes/policies inside "More details".

## 20 Nov (2) — Release 2: phone notifications, VIP messages, Sab Done, order cards
- Phone notifications (free Web Push): src/shared/push.js (VAPID key made on first use, stored in private/vapid.json; table push_subs), admin-web/sw.js (receives pushes, buttons "WhatsApp bhejo"/"Done", tap opens the order), manifest + icons so the admin installs as an app with the Surya logo, page Admin > Phone notifications (turn on, test, per-event switches, hide-on-lock-screen switch). Events: new order, payment to check, cancel, return/replacement request, stock low, contact message, review, new customer. Hooks are fire-and-forget (never slow an order). Needs `npm install --omit=dev` once (new package web-push).
- Customer messages rewritten in a warm VIP tone (settings.js messages) + new `cod_advance` message; vars {{advance}} {{balance}} {{brand}}. NOTE: if the owner already saved templates in Admin > Message templates, those saved texts stay; delete/reset them there to get the new wording.
- Messages to send: "Sab Done" button, per-message Done, record on the order ("Message sent to customer"), cards on phones. API: POST /outbox/done-all.
- Orders list: cards on phones with product photo + name (+N more), total, payment line, status colour, next action; table on PC has a photo column.

## Release 3 (login gate, drafts, glass dialogs)
- Checkout needs login (store.guest_checkout default false; one-time migration in start.js turns it off once; admin Features switch can turn it on).
- core.js: confirmBox (glass popup, reasons), guardWatch/guardOff (leave confirm: nav, back, beforeunload), draft (24h), afterLogin (return page), slideIn, glassSelect.
- Checkout draft key sy_dr_checkout; login email draft sy_dr_login; cleared on order/logout.
- CSS block "Release 3" at end of app.css; .hscroll has scroll-padding so first card keeps its gap.

## Release 4 (customer phone notifications)
- src/shared/custpush.js: table push_cust (+push_sent). Order updates (confirmed/shipped/delivered) always; offers (price drop, back in stock, new product, owner broadcast) only if offers ON, max 1/day per phone, never 10pm-8am IST.
- Hooks: orders.setStatus, admin product PUT (price down / stock 0->in), /:id/stock, publish (new product, once per product).
- Customer API: /api/account/push/{info,subscribe,unsubscribe,offers}. Admin: /broadcast, /broadcast/info (Notifications page, "Broadcast to customers", test goes to owner phone).
- Front end: web/js/notif.js glass card after order (&new=1 page) and on heart; "Not now"/blocked help = 7 days (sy_pn_snooze/sy_pn_help); Account > Profile card with offers switch. web/sw.js handles push + click (cache v2).
- iPhone: only works when site is added to Home Screen (card is skipped when unsupported).

## Release 6 part 1 (full glass look)
- app.css end: --lg-* tokens (html.dark variant), glass popups (.gc), notification card (.pn), dropdown (.gsel-b/.gsel-l), search panel/input. Part 2 (menu, bottom bar, welcome-back, filters, chips, inputs, admin) pending.
- Note: older rules use @media(prefers-color-scheme:dark) while the page theme uses html.dark (default light): on dark phones some old surfaces turn dark on a light page. Needs a decision/fix.
