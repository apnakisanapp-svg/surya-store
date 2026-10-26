# Features: done / partly / not included

## Done (website)
Home with sections you can reorder, hero banners, categories, 1:1 product cards that fit any photo, product page with multiple images, zoom, variants, similar-products loop, reviews (moderated, verified-buyer tag), wishlist, recently viewed, search with suggestions (and "no result" logging), filters and sorting, cart drawer with free-shipping bar, coupons, pincode check with delivery estimate, guest checkout, UPI (QR + UPI link + UTR + screenshot, timer, auto-expire) and COD (fee, limits, pincode block, phone-confirm), policy consent per order with version recorded, order tracking by number + phone, cancel before shipping, damaged/defective replacement or refund request with photos within the window, account (orders, addresses, wishlist, data export, delete account), notify-me when out of stock, newsletter, contact + grievance form (acknowledge in 48 hours, resolve in 1 month), English/Hinglish switch, light/dark-ready theme tokens, themes (4 looks), self-hosted fonts, cookie notice, welcome and exit popups, announcement bar, WhatsApp button, back-to-top, scroll progress, 3D tilt, add-to-cart animation, sticky mobile buy bar, PWA/offline shell, SEO (titles, meta, JSON-LD, sitemap, robots, redirects), accessibility basics, no Skip button on any loading animation.

## Done (admin)
Owner-only login, forced password change, 2-step login (authenticator app) with recovery codes, login history, IP allow-list option, activity log, daily backups + download, dashboard with to-do counts, global search, orders (status flow, verify UPI, COD confirm, courier + tracking, invoices, notes, refunds, return handling, CSV), products (editor, images with auto-crop, variants, similar, bulk CSV import, scheduled publishing, trash, 360 frames and GLB upload), risk checker that blocks publishing until fixed or acknowledged, profit calculator with green/yellow/red verdict, break-even price, max ad spend, purchases with landed cost (FIFO), suppliers + quotes + cheapest source, expenses, profit centre, daily tips from your own data, compliance centre, policies with versions and consent records export, categories, coupons, banners, home layout, testimonials, FAQ, reviews, customers (block/unblock, export), messages and complaints with overdue flags, outbox (WhatsApp links, email), settings for brand, theme, payments, shipping, returns, popups, SEO, redirects, profit rules, message templates, store options.

## Partly
- 3D / 360 view: the viewer and upload work. You must provide real 360 photos or a GLB file; generic renders are only placeholders.
- Email: works once you add SMTP_URL. Otherwise messages wait in "Messages to send".
- Daily tips use only your store data. They do not know market trends or competitor prices.
- Dark mode: theme tokens exist, the visitor toggle is not shown yet.

## Not included (needs outside accounts / paid services / professionals)
- Online payment gateway (Razorpay/Cashfree): needs your merchant account and KYC. UPI is manual by design.
- WhatsApp Business API and SMS (DLT registration): links open WhatsApp manually instead.
- Courier API (Shiprocket etc.): you type courier name + tracking number.
- Google Trends / marketplace price scraping.
- BIS/ISI certification, GST registration advice, final policy wording: please get a CA/lawyer to check. Drafts are starting points only.
- Real product photos and brand logo: add them in admin.
