import { h, $, clear, api, toast, card, pageHead, busy } from './lib.js';
import { reg } from './router.js';

const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(r); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const EVENTS = [
  ['order', 'New order', 'A customer placed an order'], ['payment', 'Payment to check', 'Customer sent a UTR / advance'],
  ['cancel', 'Order cancelled', 'Customer or payment problem'], ['ret', 'Return or replacement request', ''],
  ['stock', 'Stock low or finished', ''], ['contact', 'New message or complaint', ''], ['review', 'New review', ''], ['customer', 'New customer account', ''],
];

reg(/^\/notifications$/, async v => {
  const info = await api('/push/info');
  const state = h('div'), prefsBox = h('div', { class: 'stack' });
  async function current() { try { const reg0 = await navigator.serviceWorker.getRegistration(); return reg0 ? await reg0.pushManager.getSubscription() : null; } catch { return null; } }
  async function paint() {
    const sub = supported() ? await current() : null, perm = supported() ? Notification.permission : 'unsupported';
    clear(state);
    if (!supported()) { state.append(h('div', { class: 'note warn' }, 'This browser cannot show phone notifications. Open the admin in Chrome on your Android phone.')); return; }
    const on = !!sub && perm === 'granted';
    state.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('b', { style: { fontSize: '1.1rem' } }, on ? '✅ Notifications are ON on this phone' : '🔕 Notifications are OFF on this phone'), h('span', { class: 'muted small' }, `${info.devices} phone${info.devices === 1 ? '' : 's'} registered`)));
    if (perm === 'denied') state.append(h('div', { class: 'note bad' }, 'Notifications are blocked for this site. Open Chrome > Settings > Site settings > Notifications, find this site, and choose Allow. Then come back here.'));
    const row = h('div', { class: 'row' });
    if (!on) row.append(h('button', { class: 'btn primary', onclick: async e => {
      try { await busy(e.currentTarget, async () => {
        const p = await Notification.requestPermission(); if (p !== 'granted') throw new Error('Permission was not given. Tap Allow when Chrome asks.');
        const reg0 = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
        const s = (await reg0.pushManager.getSubscription()) || await reg0.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(info.key) });
        const r = await api('/push/subscribe', { method: 'POST', body: { subscription: s.toJSON() } }); info.devices = r.devices;
      }); toast('Notifications are on ✓'); paint();
      } catch (x) { toast(x.message, true); } } }, 'Turn on notifications'));
    else {
      row.append(h('button', { class: 'btn primary', onclick: async e => { try { const r = await busy(e.currentTarget, () => api('/push/test', { method: 'POST', body: {} })); toast(r.sent ? 'Test sent. Look at your phone.' : 'Nothing was sent. Turn notifications off and on again.', !r.sent); } catch (x) { toast(x.message, true); } } }, 'Send a test notification'),
        h('button', { class: 'btn', onclick: async e => { try { await busy(e.currentTarget, async () => { const s = await current(); if (s) { await api('/push/unsubscribe', { method: 'POST', body: { endpoint: s.endpoint } }); await s.unsubscribe(); } }); info.devices = Math.max(0, info.devices - 1); toast('Turned off on this phone'); paint(); } catch (x) { toast(x.message, true); } } }, 'Turn off on this phone'));
    }
    if (window.__installPrompt) row.append(h('button', { class: 'btn', onclick: async () => { const ev = window.__installPrompt; window.__installPrompt = null; ev.prompt(); await ev.userChoice.catch(() => {}); paint(); } }, 'Install app on home screen'));
    state.append(row);
  }
  function paintPrefs() {
    clear(prefsBox);
    const save = async (k, val) => { try { info.prefs[k] = val; await api('/settings/push', { method: 'PUT', body: { [k]: val } }); toast('Saved'); } catch (x) { toast(x.message, true); } };
    for (const [k, l, d] of EVENTS) prefsBox.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: info.prefs[k] !== false, onchange: e => save(k, e.target.checked) }), h('span', null, l, d ? h('span', { class: 'muted small' }, ' · ' + d) : null)));
    prefsBox.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' } }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: info.prefs.lock_hide === true, onchange: e => save('lock_hide', e.target.checked) }), h('span', null, 'Hide details on the lock screen ', h('span', { class: 'muted small' }, '· shows only "Open the app to see the details"'))));
  }
  v.append(pageHead('Phone notifications'),
    card('This phone', state),
    h('div', { style: { height: '14px' } }),
    card('What should buzz your phone?', prefsBox),
    h('div', { style: { height: '14px' } }),
    card('How to set up (Android)', h('ol', { class: 'small', style: { margin: 0, paddingLeft: '20px', lineHeight: 1.7 } },
      h('li', null, 'In Chrome, open the menu (⋮) and choose "Install app" or "Add to Home screen". The Surya icon appears on your home screen.'),
      h('li', null, 'Open the app from that icon, come to this page and press "Turn on notifications". Tap Allow.'),
      h('li', null, 'Press "Send a test notification". It should buzz within a few seconds.'),
      h('li', null, 'Phone settings > Apps > Surya Admin: set Battery to "Unrestricted" and keep Notifications on. On Xiaomi, Oppo, Vivo and Realme also allow "Autostart", or notifications can arrive late.'),
      h('li', null, 'Notifications never include a phone number or the full address. The full order opens when you tap.'))));
  paintPrefs(); await paint();
});
