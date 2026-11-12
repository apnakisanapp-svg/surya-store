'use strict';
// Starter drafts. They are templates, NOT legal advice: a lawyer must review them before launch.
// Placeholders like {{brand}} are filled from Admin > Settings when the page is shown.

const ABOUT_DEFAULT = `<p><strong>{{brand}}</strong> is a small online store from India. We sell useful everyday gadgets for the home, kitchen and car, picked for being practical and fairly priced.</p>
<h3>Why shop with us</h3>
<ul>
<li>Delivery across India</li>
<li>Pay by UPI, or choose Cash on Delivery</li>
<li>{{return_days}}-day replacement if an item arrives damaged</li>
<li>Real people reply on WhatsApp and email</li>
</ul>
<p>We are a young store, so every order matters to us. We check each parcel before it goes out, and if something is not right, we will fix it.</p>
<p>Questions? Email us at {{email}} or call/WhatsApp {{phone}}.</p>`;
const NOTE = '<p class="draft-note"><strong>Draft:</strong> this text is a starting template. Please have it reviewed by a lawyer and edit it for your business before launch.</p>';

module.exports = [
  {
    slug: 'terms', title: 'Terms & Conditions', title_hi: 'Terms & Conditions', protected: 1, sort: 1,
    body: `${NOTE}
<h2>1. About these terms</h2>
<p>These terms apply when you browse or buy from {{brand}} ("we", "us"), operated by {{legal_name}}, {{address}}. By placing an order you agree to these terms, our Privacy Policy and our Return, Refund & Cancellation Policy.</p>
<h2>2. Products and prices</h2>
<p>We try to show accurate photos, descriptions and prices. Prices are in Indian rupees and include applicable taxes unless stated. The selling price is never above the MRP. If we find a pricing or stock error after you order, we may cancel the order and refund any payment you made.</p>
<h2>3. Orders</h2>
<p>Your order is an offer to buy. It is accepted when we confirm it. We may decline or cancel an order, for example when stock is unavailable, payment cannot be verified, the address is not serviceable, or we suspect misuse.</p>
<h2>4. Payment</h2>
<p><strong>UPI:</strong> pay the exact amount to the UPI ID shown at checkout and enter the transaction ID (UTR). Your order is confirmed after we verify the payment, which may take some time. Unpaid UPI orders are cancelled automatically after the time shown at checkout.</p>
<p><strong>Cash on delivery (COD):</strong> pay the courier when the parcel arrives. We may call you to confirm a COD order. See the COD terms in the Shipping Policy.</p>
<h2>5. Delivery</h2>
<p>Delivery times are estimates. See our Shipping Policy for charges, restrictions and what happens if delivery fails.</p>
<h2>6. Returns, replacement and refunds</h2>
<p>Please read the Return, Refund & Cancellation Policy. Damaged or defective products can be replaced or refunded within {{return_days}} days of delivery as described there.</p>
<h2>7. Safe use</h2>
<p>Some products (for example products with batteries or heating parts) can be dangerous if misused. Read and follow the safety instructions on the product page and in the box. Keep such products away from children. We are not responsible for harm caused by misuse or by ignoring the instructions.</p>
<h2>8. Your account</h2>
<p>Keep your login details private. You are responsible for activity on your account. Give correct information when you order.</p>
<h2>9. Intellectual property</h2>
<p>The {{brand}} name, logo, photos and text belong to us or our licensors. Do not copy or reuse them without permission.</p>
<h2>10. Limits of liability</h2>
<p>To the extent allowed by law, we are not liable for indirect or consequential loss. Nothing in these terms limits your rights under the Consumer Protection Act, 2019 or any other law that cannot be limited.</p>
<h2>11. Governing law</h2>
<p>These terms are governed by the laws of India. Courts at {{city}} have jurisdiction, subject to your rights as a consumer to approach the consumer commission that has jurisdiction over you.</p>
<h2>12. Changes</h2>
<p>We may update these terms. The version number and date at the top show the latest version. When we make an important change we will ask you to accept it again.</p>
<h2>13. Contact and complaints</h2>
<p>Write to us at {{email}} or {{phone}}. Our Grievance Officer's details are on the Grievance page. We acknowledge complaints within 48 hours and aim to resolve them within one month.</p>`,
  },
  {
    slug: 'privacy', title: 'Privacy Policy', title_hi: 'Privacy Policy', protected: 1, sort: 2,
    body: `${NOTE}
<h2>1. Who we are</h2>
<p>{{legal_name}} ({{brand}}) decides why and how your personal data is used for this website. Contact: {{email}}.</p>
<h2>2. What we collect</h2>
<ul>
<li><strong>Order details:</strong> name, phone number, email, delivery address, items bought, amount.</li>
<li><strong>Payment reference:</strong> UPI transaction ID and, if you upload one, a payment screenshot. We never see your card or UPI PIN.</li>
<li><strong>Account details:</strong> email and an encrypted password if you create an account.</li>
<li><strong>Messages:</strong> what you write to us (contact form, returns, reviews).</li>
<li><strong>Technical data:</strong> a shortened device identifier, browser type and, if you accept analytics cookies, how you use the site.</li>
</ul>
<h2>2A. Why we use it</h2>
<ul>
<li>To take, deliver and support your order (needed to serve you).</li>
<li>To follow tax, accounting and consumer laws.</li>
<li>To prevent fraud and fake orders.</li>
<li>To send offers by WhatsApp, SMS or email <strong>only if you tick the separate marketing box</strong>. You can withdraw this any time.</li>
</ul>
<h2>3. Who we share it with</h2>
<p>Only those who help us serve you: courier partners (name, phone, address), our website hosting and backup providers, and our email service. We do not sell your data.</p>
<h2>4. How long we keep it</h2>
<p>Order and invoice records are kept for as long as the law requires. Other data is kept only while it is needed and then deleted or anonymised.</p>
<h2>5. Your rights</h2>
<p>You can ask to see your data, correct it, delete it, or withdraw consent. Use your account page or write to {{email}}. If something goes wrong you can complain to our Grievance Officer. We will reply within the time required by law.</p>
<h2>6. Security</h2>
<p>Passwords are stored encrypted, payment screenshots are kept private, and access to our admin area is restricted. If a data breach affects you, we will inform you and the authorities as the law requires.</p>
<h2>7. Children</h2>
<p>Our products are not meant for children and we do not knowingly collect data from children.</p>
<h2>8. Cookies</h2>
<p>See our Cookie Policy.</p>
<h2>9. Changes</h2>
<p>When we change this policy we will update the version and date and ask you to accept important changes.</p>`,
  },
  {
    slug: 'returns', title: 'Return, Refund & Cancellation Policy', title_hi: 'Return, Refund aur Cancellation', protected: 1, sort: 3,
    body: `${NOTE}
<h2>1. When you can return or replace</h2>
<p>If your product arrives <strong>damaged, defective, or is not what you ordered</strong>, tell us within <strong>{{return_days}} days of delivery</strong>. We will replace it or refund you.</p>
<h2>2. What we need from you</h2>
<ul>
<li>Your order number and a short description of the problem.</li>
<li>Clear photos or a video. We recommend recording an <strong>unboxing video</strong> when you open the parcel.</li>
<li>The product with all accessories and packaging, where possible.</li>
</ul>
<h2>3. What is not covered</h2>
<ul>
<li>Change of mind or a wrong choice made by the customer.</li>
<li>Damage caused by misuse, dropping, water, heat or charging with a wrong charger.</li>
<li>Products that were opened, used or changed in a way that hides the original fault.</li>
<li>Requests made after {{return_days}} days.</li>
</ul>
<p>This does not reduce any right you have under the Consumer Protection Act, 2019.</p>
<h2>4. How to request</h2>
<p>Open your order from "Track order" and press "Request replacement or refund", or write to {{email}}. We usually reply within 48 hours.</p>
<h2>5. Replacement or refund</h2>
<p>We replace the product if stock is available. If not, we refund. Refunds go to the original payment method (UPI/bank) within 5-7 working days after we approve the request. For COD orders we refund to the UPI ID or bank account you give us.</p>
<h2>6. Cancelling an order</h2>
<ul>
<li>Before the order is packed: cancel from your order page or contact us. Prepaid amounts are refunded in full.</li>
<li>After it is shipped: please refuse the delivery or contact us. Shipping charges may be deducted.</li>
<li>UPI orders not paid in time are cancelled automatically.</li>
</ul>
<h2>7. Wrong or missing parcels</h2>
<p>If a parcel looks opened or damaged at delivery, please do not accept it, or record a video while opening it, and tell us the same day.</p>`,
  },
  {
    slug: 'shipping', title: 'Shipping Policy', title_hi: 'Shipping Policy', protected: 1, sort: 4,
    body: `${NOTE}
<h2>1. Where we deliver</h2>
<p>We deliver to serviceable pincodes in India. Enter your pincode on the product page or at checkout to check.</p>
<h2>2. Time</h2>
<p>We usually pack within 1-2 working days. Delivery takes about {{eta_min}}-{{eta_max}} working days after dispatch, depending on your location. Delays can happen because of weather, strikes or courier issues.</p>
<h2>3. Charges</h2>
<p>Shipping is free above the amount shown in the store. Below that, a flat charge applies and is shown before you pay.</p>
<h2>4. Products with batteries</h2>
<p>Lithium batteries are treated as dangerous goods by couriers. Such products may be sent by road only, may take longer, and may not be available for some pincodes. Where this applies, the product page and checkout will tell you.</p>
<h2>5. Tracking</h2>
<p>When your order ships you will get the courier name and tracking number on your order page and by message.</p>
<h2>6. Cash on delivery</h2>
<p>COD may have an extra fee and order limits. We may call you to confirm. If a COD parcel is refused repeatedly without a valid reason, we may stop COD for that phone number.</p>
<h2>7. Wrong address or failed delivery</h2>
<p>Please check your address and phone number. If delivery fails because the address is wrong or you are unreachable, the parcel may return to us and we may ask for the shipping cost to send it again.</p>`,
  },
  {
    slug: 'warranty', title: 'Warranty & Replacement Policy', title_hi: 'Warranty aur Replacement', protected: 0, sort: 5,
    body: `${NOTE}
<p>Each product page states its own warranty or guarantee, if any. If it says "No warranty", only the damaged/defective replacement window in our Return policy applies.</p>
<h2>What the warranty covers</h2><p>Manufacturing faults that appear during normal use within the warranty period.</p>
<h2>What it does not cover</h2><p>Physical damage, water or heat damage, misuse, use of wrong chargers, opening or repairing the product by others, and normal wear.</p>
<h2>How to claim</h2><p>Contact us with the order number and a short video showing the fault: {{email}} / {{phone}}.</p>`,
  },
  {
    slug: 'cookies', title: 'Cookie Policy', title_hi: 'Cookie Policy', protected: 1, sort: 6,
    body: `${NOTE}
<p>Cookies and browser storage are small pieces of data saved on your device.</p>
<h2>Essential (always on)</h2><p>Keeps your cart, language, login and security working. The site does not work properly without these.</p>
<h2>Analytics (only if you accept)</h2><p>Helps us understand which pages are used so we can improve the site. Switched on only after you press Accept.</p>
<h2>Your choice</h2><p>The cookie banner has Accept and Reject buttons of equal size. You can change your choice any time using "Cookie settings" in the footer.</p>`,
  },
  {
    slug: 'safety', title: 'Product Safety & Disclaimer', title_hi: 'Product Safety', protected: 1, sort: 7,
    body: `${NOTE}
<h2>Products with a rechargeable battery</h2>
<ul>
<li>Charge only with the supplied cable or a good-quality USB adapter.</li>
<li>Do not leave the product charging unattended or overnight.</li>
<li>Keep away from water, heat, direct sunlight and flammable material.</li>
<li>Stop using it if it becomes very hot, swollen, smells, or leaks, and contact us.</li>
<li>Do not open, crush or burn the product.</li>
</ul>
<h2>Lighters and ignition products</h2>
<ul>
<li>Not a toy. Keep out of reach of children.</li>
<li>Never point at people, animals or your own face.</li>
<li>Do not use near gas leaks or in places with flammable vapours.</li>
<li>Use the safety lock when carrying or storing the product.</li>
</ul>
<h2>Disclaimer</h2>
<p>We are not responsible for injury or damage caused by misuse or by not following the instructions. This does not limit any right you have under law.</p>`,
  },
  {
    slug: 'about', title: 'About us', title_hi: 'Hamare baare mein', protected: 0, sort: 8, in_footer: 1,
    body: ABOUT_DEFAULT,
  },
];

module.exports.ABOUT_DEFAULT = ABOUT_DEFAULT;
