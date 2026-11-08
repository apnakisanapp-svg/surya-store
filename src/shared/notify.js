// Optional free alerts to the owner's phone through a Telegram bot.
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env. If they are empty nothing happens.
// Never throws and never delays an order.
const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const chat = () => process.env.TELEGRAM_CHAT_ID || '';
const enabled = () => !!(token() && chat());

function send(text) {
  if (!enabled()) return;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  fetch(`https://api.telegram.org/bot${token()}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
    body: JSON.stringify({ chat_id: chat(), text: String(text).slice(0, 1500), disable_web_page_preview: true }),
  }).catch(() => {}).finally(() => clearTimeout(timer));
}

const inr = n => '₹' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
function orderPlaced(o) {
  if (o.payment_method === 'upi') return; // an unpaid UPI order is not news yet: we alert when the customer submits the payment
  const pay = o.payment_method === 'upi' ? 'UPI (waiting for payment)' : 'Cash on delivery';
  send(`🛒 New order ${o.number}\nAmount: ${inr(Number(o.total) + Number(o.upi_adjust || 0))}\nPayment: ${pay}\nCustomer: ${o.name || ''}`);
}
function paymentSubmitted(o, utr) {
  send(`💸 Payment submitted for ${o.number}\nPay amount: ${inr(o.pay_amount != null ? o.pay_amount : o.total)}\nUTR: ${utr}\nCheck your bank, then open Admin → Orders → Payment received.`);
}
module.exports = { enabled, send, orderPlaced, paymentSubmitted };
