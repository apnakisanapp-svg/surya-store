'use strict';
/* Smart product search: ignores capitals/spaces/matras, understands Hindi + English + Hinglish
   synonyms, forgives typos, matches half-typed words, and never ends in "nothing found". */

// Words that mean the same thing for shoppers (Hindi, English, Hinglish, common typos).
const GROUPS = `
diya diye diyas deepak deepam dipak deep dia dya दीया दिया दीपक दीप दिए | diwali deepawali deepavali dipawali dipavali dewali दिवाली दीवाली दीपावली | festival tyohar tyauhar त्योहार त्यौहार utsav
led light lights lamp lamps bulb bulbs roshni roshani batti bati lite laite rosni लाइट लाइटें लैंप बल्ब रोशनी बत्ती एलईडी | torch flashlight tourch टॉर्च | tubelight tube
fairy string lights jhalar jhalar-light jhalar झालर lari ladi लड़ी लड़ | rangoli रंगोली | toran तोरण
charger chargar charging charjar adapter adaptor adapters चार्जर चार्जिंग एडाप्टर | cable cord wire taar tar केबल तार | usb typec type-c typec lightning | fastcharger
powerbank power-bank bank पावरबैंक | earphone earphones earbud earbuds headphone headphones headset ear-phone ईयरफोन हेडफोन इयरबड्स | speaker speakers bluetooth blutooth बोतल-स्पीकर स्पीकर ब्लूटूथ
phone mobile cellphone smartphone fon फोन मोबाइल | holder stand mount stends holdar होल्डर स्टैंड | cover case back-cover कवर केस | glass tempered guard screenguard
bottle bottles botal bottal flask sipper thermos bottel बोतल बॉटल फ्लास्क सिपर | water paani pani पानी वाटर | cup mug glass-cup kap mugg कप मग गिलास glass-tumbler tumbler
lighter lighters arc plasma lyter लाइटर | matchbox machis माचिस | rechargeable recharge rechargable रिचार्जेबल
kitchen rasoi rasoee kichen kitchan किचन रसोई | cooker pressure-cooker cookar कुकर | pan tawa tava kadhai kadai karahi पैन तवा कड़ाही कढ़ाही | knife chaku chaaku chhuri चाकू छुरी | peeler cutter chopper katar कटर चॉपर | spoon chamach chammach चम्मच चमचा | box dabba dibba डिब्बा बॉक्स | container jar
mixer grinder juicer blender मिक्सर ग्राइंडर | gas-lighter stove chulha चूल्हा | tiffin lunchbox lunch-box टिफिन
home ghar ghr घर | decor decoration decorative sajawat sajavat sajaawat सजावट डेकोर | wall deewar diwar दीवार | clock ghadi ghari घड़ी | frame photo-frame फ्रेम | showpiece shopiece शोपीस | flower phool phul फूल | plant paudha poudha पौधा | candle mombatti mombati मोमबत्ती कैंडल | mirror aaina shisha sheesha आईना शीशा
car gaadi gadi gaddi कार गाड़ी | bike motorcycle scooter baik bykes बाइक | seat-cover seatcover | perfume freshener sugandh परफ्यूम खुशबू | cleaner clean saaf safai सफाई क्लीनर | wiper | dashboard dash
personal-care grooming trimmer shaver razor ustra | hair baal bal बाल | comb kangi kanghi कंघी | beard dadhi दाढ़ी | massager massage maalish मालिश | brush brash ब्रश | cream lotion
travel yatra safar यात्रा सफर | bag baig thaila bagpack backpack झोला थैला बैग | outdoor camping | pouch organizer organiser organizers
gift gifts upahar uphar tohfa उपहार गिफ्ट तोहफा | combo set pack kit सेट कॉम्बो
toy toys khilona khilauna खिलौना टॉय खिलौने | kids bachche bacche children बच्चे
mat matt carpet floor-mat | chair kursi कुर्सी | table mej meaz टेबल मेज
fan pankha pankhe पंखा फैन | cooler heater geyser hiter
steel stainless ss स्टील | plastic plastik प्लास्टिक | glass-material kaanch kanch कांच | copper tamba taamba ताम्बा | brass pital पीतल
big bada bade बड़ा | small chota chhota chhote छोटा | mini
red laal lal लाल | blue neela nila नीला | green hara हरा | black kaala kala काला | white safed safaid सफेद | yellow peela pila पीला | gold sunehri golden सुनहरा | pink gulabi गुलाबी
torch-light searchlight
`.trim().split('\n').flatMap(l => l.split('|')).map(s => s.trim().split(/\s+/).filter(Boolean)).filter(g => g.length > 1);

const strip = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
// Hinglish spelling flattening so diya/dia/dya, chargar/charger, botal/bottle line up.
const key = w => strip(w).replace(/[-_']/g, '').replace(/ph/g, 'f').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u').replace(/aa/g, 'a').replace(/w/g, 'v').replace(/(.)\1+/g, '$1');
const words = s => strip(s).replace(/<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}\p{M}\s-]/gu, ' ').split(/\s+/).filter(Boolean);

const GKEYS = GROUPS.map(g => [...new Set(g.map(key))]);

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i], best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}
const maxErr = w => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);

// every word that means the same as the shopper's word
function expand(tok) {
  const k = key(tok), out = new Set();
  for (const g of GKEYS) {
    const hit = g.some(m => m === k || (k.length >= 3 && m.startsWith(k)) || (k.length >= 4 && m.length >= 4 && lev(m, k, maxErr(k)) <= maxErr(k)));
    if (hit) g.forEach(m => out.add(m));
  }
  out.delete(k);
  return [...out];
}

function buildIndex(rows) {
  return rows.map(r => {
    const f = { name: words(`${r.name} ${r.name_hi || ''}`), tags: words(String(r.tags_text || '')), cat: words(r.category || ''), tag: words(r.tagline || ''), desc: words(r.description || '').slice(0, 150) };
    const k = o => Object.fromEntries(Object.entries(o).map(([n, ws]) => [n, [...new Set(ws.map(key))]]));
    return { id: r.id, sold: r.sold_count || 0, views: r.views || 0, f: k(f) };
  });
}
const W = { name: 6, tags: 5, cat: 3, tag: 3, desc: 1 };

function scoreWord(v, p, fuzzy) {
  let best = 0;
  for (const fld of Object.keys(W)) {
    for (const w of p.f[fld]) {
      let s = 0;
      if (w === v) s = W[fld];
      else if (v.length >= 2 && w.startsWith(v)) s = W[fld] * 0.75;
      else if (v.length >= 3 && w.length > v.length && w.includes(v) && fld !== 'desc') s = W[fld] * 0.4;
      else if (fuzzy && v.length >= 4 && fld !== 'desc') { const e = lev(w, v, maxErr(v)); if (e <= maxErr(v)) s = W[fld] * 0.5; }
      if (s > best) best = s;
    }
  }
  return best;
}

function rank(q, index) {
  const toks = [...new Set(words(q).map(key))].filter(Boolean).slice(0, 8);
  if (!toks.length) return [];
  const exp = toks.map(t => ({ t, syn: expand(t) }));
  const out = [];
  for (const p of index) {
    let total = 0, matched = 0;
    for (const { t, syn } of exp) {
      let s = scoreWord(t, p, true);
      for (const v of syn) { const x = scoreWord(v, p, false) * 0.8; if (x > s) s = x; }
      if (s > 0) { matched++; total += s; }
    }
    if (!matched) continue;
    out.push({ id: p.id, score: total + matched * 4 + (matched === toks.length ? 6 : 0) + Math.min(p.sold, 50) * 0.02, all: matched === toks.length });
  }
  out.sort((a, b) => b.score - a.score);
  return out.map(o => o.id);
}

// Nothing matched: show things that are close, then what most people buy.
function related(q, index) {
  const toks = [...new Set(words(q).map(key))].filter(w => w.length >= 3);
  const loose = [];
  for (const p of index) {
    let s = 0;
    for (const t of toks) {
      const probe = t.slice(0, Math.max(3, Math.ceil(t.length * 0.6)));
      for (const fld of ['name', 'tags', 'cat', 'tag']) if (p.f[fld].some(w => w.includes(probe) || (w.length >= 4 && t.includes(w)) || (t.length >= 5 && lev(w, t, 2) <= 2))) s += W[fld];
    }
    if (s > 0) loose.push({ id: p.id, s });
  }
  if (loose.length) return { kind: 'similar', ids: loose.sort((a, b) => b.s - a.s).slice(0, 24).map(x => x.id) };
  return { kind: 'popular', ids: [...index].sort((a, b) => (b.sold * 3 + b.views) - (a.sold * 3 + a.views)).slice(0, 24).map(x => x.id) };
}

module.exports = { buildIndex, rank, related, expand, key, words };
