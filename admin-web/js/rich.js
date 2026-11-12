/* Plain-text page editor for policies / About: people type normally, we store clean HTML.
   # Heading   ## Smaller heading   - list item   1. numbered item   **bold**   [text](https://link) */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^\s)"'<>]+)\)/g, '<a href="$2">$1</a>');

export function mdToHtml(text) {
  const out = []; let para = [], list = null;
  const flushP = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.t}>` + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + `</${list.t}>`); list = null; } };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { flushP(); flushL(); }
    else if ((m = line.match(/^##\s+(.*)$/))) { flushP(); flushL(); out.push('<h3>' + inline(m[1]) + '</h3>'); }
    else if ((m = line.match(/^#\s+(.*)$/))) { flushP(); flushL(); out.push('<h2>' + inline(m[1]) + '</h2>'); }
    else if ((m = line.match(/^[-*]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); }
    else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); }
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL();
  return out.join('\n');
}

const OK_TAGS = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'BR', 'A']);
/** true when the HTML only uses things the plain editor can keep (no styles, classes, tables, nested lists...) */
export function isSimple(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html'); let ok = true;
  for (const n of doc.body.childNodes) { if (n.nodeType === 3 ? n.textContent.trim() : !['P', 'H2', 'H3', 'UL', 'OL'].includes(n.nodeName)) { ok = false; break; } }
  if (!ok) return false;
  for (const el of doc.body.querySelectorAll('*')) {
    if (!OK_TAGS.has(el.nodeName)) return false;
    for (const a of el.attributes) if (!(el.nodeName === 'A' && a.name === 'href' && /^(https?:|mailto:|tel:|\/)/.test(a.value))) return false;
    if (el.nodeName === 'LI' && el.querySelector('ul,ol,p,h2,h3')) return false;
  }
  return true;
}

export function htmlToMd(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  const inl = node => [...node.childNodes].map(c => {
    if (c.nodeType === 3) return c.textContent.replace(/\s+/g, ' ');
    if (c.nodeName === 'BR') return '\n';
    if (c.nodeName === 'STRONG' || c.nodeName === 'B') return '**' + inl(c).trim() + '**';
    if (c.nodeName === 'A') return '[' + inl(c).trim() + '](' + c.getAttribute('href') + ')';
    return inl(c);
  }).join('');
  const out = [];
  for (const n of doc.body.children) {
    if (n.nodeName === 'H2') out.push('# ' + inl(n).trim());
    else if (n.nodeName === 'H3') out.push('## ' + inl(n).trim());
    else if (n.nodeName === 'UL') out.push([...n.children].map(li => '- ' + inl(li).trim()).join('\n'));
    else if (n.nodeName === 'OL') out.push([...n.children].map((li, i) => (i + 1) + '. ' + inl(li).trim()).join('\n'));
    else out.push(inl(n).trim());
  }
  return out.join('\n\n');
}

/** safe-ish preview: drop scripts and on* handlers (admin only sees its own text, but be careful anyway) */
export function previewHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  doc.body.querySelectorAll('script,style,iframe,object,embed').forEach(e => e.remove());
  doc.body.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name); }));
  return doc.body.innerHTML;
}
