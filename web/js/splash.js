// Opening animation: plays once per visit. Pure CSS does the animation; this only skips repeats and cleans up.
(function () {
  var s = document.getElementById('splash'); if (!s) return;
  try { if (sessionStorage.getItem('sy_splash')) { s.remove(); return; } sessionStorage.setItem('sy_splash', '1'); sessionStorage.setItem('sy_intro', '1'); } catch (e) { /* storage blocked: still plays, CSS ends it */ }
  s.addEventListener('animationend', function (e) { if (e.animationName === 'spOut') s.remove(); });
  setTimeout(function () { if (s.isConnected) s.remove(); }, 4500);
})();
