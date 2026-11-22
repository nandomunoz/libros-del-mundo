// Lee la tabla de readme.md y pinta la estantería. Para añadir un libro basta editar readme.md.
// Continente -> nombre del token de color (--c-* cubiertas, --g-* globo, en styles.css)
const COLORS = { 'África': 'africa', 'América': 'america', 'Asia': 'asia', 'Europa': 'europa', 'Oceanía': 'oceania' };
const $ = (id) => document.getElementById(id);
const KEY = 'libros-del-mundo:leidos';

let books = [];
let shown = [];
let continents = {};
let read = new Set();
let filter = 'Todos';
let current = null;
let globe = null;
const byIso = new Map();

try { read = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* sin almacenamiento */ }
const saveRead = () => { try { localStorage.setItem(KEY, JSON.stringify([...read])); } catch (e) { /* ignorar */ } };

function parse(md) {
  const out = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('| ') || !line.includes('worldcat')) continue;
    const c = line.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
    if (c.length < 4) continue;
    const m = c[2].match(/^(.*?)\s*\((\d{4})\s*,?\s*([^)]*)\)\s*$/);
    const url = (c[3].match(/\((https?:[^)]+)\)/) || [])[1];
    out.push({
      country: c[0], author: c[1],
      title: m ? m[1] : c[2], year: m ? m[2] : '', note: m ? m[3] : '',
      url: url || '#', continent: (continents[c[0]] || [])[0] || 'Otros', iso: (continents[c[0]] || [])[1],
    });
  }
  return out;
}

function norm(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
const colorOf = (b, kind = 'c') => (COLORS[b.continent] ? `var(--${kind}-${COLORS[b.continent]})` : 'var(--luz-text-secondary)');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Cubierta tipográfica: tres diseños, elegidos de forma estable por país.
function cover(b) {
  const c = el('div', 'cover v' + (hash(b.country) % 3));
  c.dataset.initial = b.title.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase();
  c.append(el('span', 'c-country', b.country), el('span', 'c-title', b.title), el('span', 'c-author', b.author), el('span', 'ribbon'));
  return c;
}

function render() {
  const q = norm($('q').value.trim());
  const onlyRead = $('onlyRead').checked;
  shown = books.filter((b) =>
    (filter === 'Todos' || b.continent === filter) &&
    (!onlyRead || read.has(b.country)) &&
    (!q || norm(`${b.country} ${b.author} ${b.title}`).includes(q)));
  const frag = document.createDocumentFragment();
  for (const b of shown) {
    const btn = el('button', 'book' + (read.has(b.country) ? ' read' : ''));
    btn.type = 'button';
    btn.style.setProperty('--c', colorOf(b));
    btn.setAttribute('aria-label', `${b.country}: ${b.title}, de ${b.author}${read.has(b.country) ? ' (leído)' : ''}`);
    const vol = el('div', 'vol');
    vol.append(cover(b));
    btn.append(vol);
    btn.onclick = () => open(b, true);
    frag.append(btn);
  }
  $('shelf').replaceChildren(frag);
  $('empty').hidden = shown.length > 0;
  progress();
}

function progress() {
  const total = books.length;
  const done = books.filter((b) => read.has(b.country)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('barFill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', pct);
  $('passportText').textContent = `Pasaporte literario: ${done} de ${total} países leídos (${pct}%)`;
}

function stamp() {
  const done = read.has(current.country);
  $('stamp').classList.toggle('done', done);
  $('sStatus').textContent = done ? '✓ Leído' : 'Por leer';
  $('dRead').textContent = done ? '✓ Leído (quitar)' : 'Marcar como leído';
}

function open(b, animate) {
  current = b;
  const d = $('card');
  d.style.setProperty('--c', colorOf(b));
  $('dCountry').textContent = b.country;
  $('dTitle').textContent = b.title;
  $('dAuthor').textContent = b.author;
  $('dYear').textContent = b.year + (b.note ? ` · ${b.note}` : '');
  $('dLink').href = b.url;
  $('dNum').textContent = `Nº ${books.indexOf(b) + 1} de ${books.length}`;
  $('sCountry').textContent = b.country;
  $('sContinent').textContent = b.continent;
  $('leafFront').replaceChildren(cover(b));
  stamp();
  if (animate) {
    d.classList.remove('opening', 'closing');
    void d.offsetWidth; // reinicia la animación
    d.classList.add('opening');
  }
  if (!d.open) d.showModal();
  if (globe) globe.focus(b.iso);
  if (b.iso) history.replaceState(null, '', `#pais=${b.iso}`);
}

function step(n) {
  const list = shown.includes(current) ? shown : books;
  const i = list.indexOf(current);
  open(list[(i + n + list.length) % list.length], false);
}

$('dRead').onclick = () => {
  if (!current) return;
  read.has(current.country) ? read.delete(current.country) : read.add(current.country);
  saveRead();
  stamp();
  render();
};
$('dPrev').onclick = () => step(-1);
$('dNext').onclick = () => step(1);
// Cerrar con animación: la tapa vuelve a su sitio y el libro se va.
function closeBook() {
  const d = $('card');
  if (!d.open || d.classList.contains('closing')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { d.close(); return; }
  d.classList.remove('opening');
  d.classList.add('closing');
  const done = () => { d.classList.remove('closing'); d.close(); };
  d.querySelector('.openbook').addEventListener('animationend', done, { once: true });
  setTimeout(() => { if (d.open && d.classList.contains('closing')) done(); }, 1500);
}
$('dClose').onclick = closeBook;
$('card').addEventListener('cancel', (e) => { e.preventDefault(); closeBook(); });
$('card').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeBook(); } });
$('card').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));
$('card').addEventListener('click', (e) => { if (e.target === $('card')) closeBook(); });
$('card').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});
$('random').onclick = () => {
  const list = shown.length ? shown : books;
  if (list.length) open(list[Math.floor(Math.random() * list.length)], true);
};
$('q').addEventListener('input', render);
$('onlyRead').addEventListener('change', render);

function buildChips() {
  const box = $('chips');
  for (const name of ['Todos', ...Object.keys(COLORS)]) {
    const b = el('button', 'chip', name);
    b.type = 'button';
    if (COLORS[name]) b.style.setProperty('--c', `var(--c-${COLORS[name]})`);
    b.setAttribute('aria-pressed', name === filter);
    b.onclick = () => {
      filter = name;
      box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
      render();
    };
    box.append(b);
  }
}

async function init() {
  buildChips();
  try {
    const [md, pj] = await Promise.all([
      fetch('readme.md').then((r) => r.text()),
      fetch('paises.json').then((r) => r.json()),
    ]);
    continents = pj;
    books = parse(md);
    const nc = new Set(books.map((b) => b.continent)).size;
    $('stats').textContent = `${books.length} países · ${nc} continentes`;
    for (const b of books) if (b.iso && !byIso.has(b.iso)) byIso.set(b.iso, b);
    render();
    if (window.d3 && window.topojson && window.createGlobe) {
      globe = createGlobe($('globe'), {
        tip: $('tip'),
        colorOf: (iso) => (byIso.has(iso) ? colorOf(byIso.get(iso), 'g') : null),
        label: (iso) => { const b = byIso.get(iso); return `${b.country} · ${b.title}`; },
        onPick: (iso) => open(byIso.get(iso), true),
      });
    } else {
      $('globe').closest('figure').hidden = true;
    }
    // Enlace directo: …/#pais=ES abre el libro de ese país
    const deep = location.hash.match(/^#pais=([A-Z]{2})$/);
    if (deep && byIso.has(deep[1])) open(byIso.get(deep[1]), true);
  } catch (e) {
    console.error(e);
    $('stats').textContent = 'No se pudo cargar la lista. Si abres el archivo directamente, usa un servidor local.';
  }
}
init();
