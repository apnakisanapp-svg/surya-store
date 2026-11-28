/* Motion helpers: small, cheap animations (transform / opacity only, one element at a time). */
export function squash(el, cls = 'fx') {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 650);
}
function cartIcon() {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  return [...document.querySelectorAll('.bb-i[data-k="cart"], .ibtn[aria-label="Cart"], .ibtn[aria-label="cart"], .fab [aria-label*="art" i]')].find(vis) || null;
}
/* Add to cart: wind-up + stretch on the button, a small copy of the photo flies to the cart in an arc, the cart bounces on landing. */
export function atcFx(btn) {
  squash(btn, 'fx-atc');
  const tb = [...document.querySelectorAll('.toast button')].pop(), tgt = cartIcon() || tb || null; if (!btn || !tgt || !document.body.animate) return;
  const src = document.querySelector('.gal-main img, .pc-img img');
  const a = btn.getBoundingClientRect(), b = tgt.getBoundingClientRect(), S = 52;
  const sx = a.left + a.width / 2 - S / 2, sy = a.top + a.height / 2 - S / 2, dx = b.left + b.width / 2 - S / 2 - sx, dy = b.top + b.height / 2 - S / 2 - sy;
  const w = document.createElement('div'), n = document.createElement('div');
  w.className = 'fly-w'; n.className = 'fly-n'; w.style.cssText = `left:${sx}px;top:${sy}px`;
  if (src && src.currentSrc) n.style.backgroundImage = `url("${src.currentSrc}")`;
  w.append(n); document.body.append(w);
  const D = 620, lift = Math.min(dy, 0) - 70;
  const ax = w.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { duration: D, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'forwards' });
  n.animate([{ transform: 'translateY(0) scale(1)', opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.7,.4,1)' }, { transform: `translateY(${lift}px) scale(.8)`, opacity: 1, offset: .4, easing: 'cubic-bezier(.6,0,.9,.5)' }, { transform: `translateY(${dy}px) scale(.25)`, opacity: .5, offset: 1 }], { duration: D, fill: 'forwards' });
  ax.onfinish = () => { w.remove(); const ic = tgt.querySelector('svg'); squash(ic || tgt, 'fx-land'); };
  setTimeout(() => w.remove(), D + 400);
}
/* Wishlist heart: pop + ring when it turns on (works for every heart button on the site). */
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.heart'); if (b) setTimeout(() => { if (b.classList.contains('on')) squash(b, 'fx'); }, 150); }, true);
