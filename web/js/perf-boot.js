// Decides, before anything is drawn, whether this phone gets the light version of the site (class "lite" on <html>).
// Auto: slow phones (little memory / few CPU cores / data saver / 2G) start light, and a 1-second smoothness check can switch a laggy phone to light.
// Owner setting (Admin > Settings > Store options > Animations) can force it for everyone; ?anim=full|light|auto in a link forces it on that phone only (auto clears it).
(function () {
  var d = document.documentElement, mode = 'auto', seen = null;
  try {
    var q = /[?&]anim=(full|light|auto)\b/.exec(location.search); if (q) { if (q[1] === 'auto') localStorage.removeItem('sy_anim_o'); else localStorage.setItem('sy_anim_o', q[1]); }
    mode = localStorage.getItem('sy_anim_o') || localStorage.getItem('sy_anim') || 'auto'; seen = localStorage.getItem('sy_perf');
  } catch (e) { /* storage blocked: decide from the phone alone */ }
  var n = navigator, c = n.connection || {};
  var slow = (n.deviceMemory && n.deviceMemory <= 3) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || c.saveData === true || /(^|slow-)2g|3g/.test(c.effectiveType || '');
  var lite = mode === 'light' || (mode === 'auto' && (seen === 'lite' || (seen !== 'ok' && slow)));
  if (lite) d.classList.add('lite');
  if (mode !== 'auto' || seen === 'lite' || !window.requestAnimationFrame) return;
  // Smoothness check: count slow frames during the first ~1.2 s (opening animation + page start).
  var last = 0, bad = 0, cnt = 0, t0 = 0;
  function f(t) {
    if (document.hidden) return; // tab in background: no verdict
    if (!t0) t0 = t;
    if (last) { cnt++; if (t - last > 50) bad++; }
    last = t;
    if (t - t0 < 1200) return requestAnimationFrame(f);
    var verdict = (cnt < 20 || bad >= 5) ? 'lite' : 'ok';
    if (verdict === 'lite') d.classList.add('lite');
    // One bad first visit (cold cache) is not enough to mark a phone slow: it must be slow on two visits (or look slow on paper).
    try { if (verdict === 'lite') localStorage.setItem('sy_perf', (slow || seen === 's1') ? 'lite' : 's1'); else if (!lite) localStorage.setItem('sy_perf', 'ok'); } catch (e) { /* ignore */ }
  }
  requestAnimationFrame(f);
})();
