// Globo terráqueo: se arrastra para girarlo y al tocar un país se abre su libro.
// Idea tomada del globo de la portada de LUZ (luzds.com); aquí con d3-geo y topojson.
// Mapa: Natural Earth 1:110m (dominio público), vía world-atlas. Ver mundo.json.
/* global d3, topojson */
function createGlobe(svg, opts) {
  const NS = 'http://www.w3.org/2000/svg';
  const SIZE = 600, R = 292;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const proj = d3.geoOrthographic().scale(R).translate([SIZE / 2, SIZE / 2]).clipAngle(90).precision(0.5);
  const path = d3.geoPath(proj);
  let rot = [-5, -30, 0];
  let spinning = !reduce, dragging = false, moved = 0, vel = 0, tween = null, last = null, selected = null;

  const mk = (tag, attrs = {}, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.append(e);
    return e;
  };

  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  const defs = mk('defs');
  const shade = mk('radialGradient', { id: 'g-shade', cx: '38%', cy: '32%', r: '72%' }, defs);
  mk('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': '.28' }, shade);
  mk('stop', { offset: '55%', 'stop-color': '#fff', 'stop-opacity': '0' }, shade);
  mk('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': '.32' }, shade);

  mk('circle', { class: 'g-sea', cx: SIZE / 2, cy: SIZE / 2, r: R });
  const grat = mk('path', { class: 'g-grat' });
  const landG = mk('g', { class: 'g-land' });
  const borders = mk('path', { class: 'g-borders' });
  const dotsG = mk('g', { class: 'g-dots' });
  mk('circle', { class: 'g-light', cx: SIZE / 2, cy: SIZE / 2, r: R, fill: 'url(#g-shade)' });

  const graticule = d3.geoGraticule10();
  let feats = [], mesh = null, points = [];
  const shapes = new Map(); // iso -> { el, geo }

  function draw() {
    proj.rotate(rot);
    grat.setAttribute('d', path(graticule) || '');
    for (const f of feats) f.el.setAttribute('d', path(f) || '');
    if (mesh) borders.setAttribute('d', path(mesh) || '');
    const centre = [-rot[0], -rot[1]];
    for (const p of points) {
      const on = d3.geoDistance(p.coord, centre) < Math.PI / 2 - 0.02;
      p.el.style.display = on ? '' : 'none';
      if (on) { const [x, y] = proj(p.coord); p.el.setAttribute('cx', x); p.el.setAttribute('cy', y); }
    }
  }

  function frame() {
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.t0) / tween.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      rot = [tween.from[0] + tween.d[0] * e, tween.from[1] + tween.d[1] * e, 0];
      if (t === 1) tween = null;
    } else if (!dragging) {
      if (Math.abs(vel) > 0.01) { rot[0] += vel; vel *= 0.94; }
      else if (spinning) rot[0] += 0.08;
    }
    if (visible || tween || dragging) draw();
    requestAnimationFrame(frame);
  }
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg);

  // --- interacción ---
  const tip = opts.tip;
  const isoAt = (target) => target && target.dataset && target.dataset.iso;
  function showTip(e, iso) {
    if (!tip || e.pointerType === 'touch') return;
    tip.textContent = opts.label(iso);
    const box = svg.parentElement.getBoundingClientRect();
    tip.style.left = `${e.clientX - box.left}px`;
    tip.style.top = `${e.clientY - box.top}px`;
    tip.hidden = false;
  }

  svg.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; vel = 0; tween = null; spinning = false;
    last = [e.clientX, e.clientY];
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('grabbing');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) {
      const iso = isoAt(e.target);
      if (iso) showTip(e, iso); else if (tip) tip.hidden = true;
      return;
    }
    const k = (SIZE / svg.getBoundingClientRect().width) * (75 / R);
    const dx = e.clientX - last[0], dy = e.clientY - last[1];
    moved += Math.abs(dx) + Math.abs(dy);
    last = [e.clientX, e.clientY];
    rot[0] += dx * k; vel = dx * k;
    rot[1] = Math.max(-70, Math.min(70, rot[1] - dy * k));
    if (tip) tip.hidden = true;
    if (reduce) draw();
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    svg.classList.remove('grabbing');
    if (moved < 6) {
      vel = 0;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const iso = isoAt(hit);
      if (iso) opts.onPick(iso);
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { if (tip) tip.hidden = true; });

  // Teclado: flechas giran; Intro abre el país que está en el centro.
  svg.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
    if (step) {
      e.preventDefault(); spinning = false; tween = null;
      rot[0] += step[0]; rot[1] = Math.max(-70, Math.min(70, rot[1] + step[1]));
      if (reduce) draw();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const centre = [-rot[0], -rot[1]];
      const f = feats.find((x) => x.properties.book && d3.geoContains(x, centre));
      if (f) opts.onPick(f.id);
    }
  });

  function focus(iso) {
    const s = shapes.get(iso);
    if (selected) selected.classList.remove('sel');
    if (!s) return;
    selected = s.el; selected.classList.add('sel');
    const [lon, lat] = s.centre;
    const target = [-lon, Math.max(-70, Math.min(70, -lat))];
    let dl = ((target[0] - rot[0]) % 360 + 540) % 360 - 180;
    spinning = false; vel = 0;
    if (reduce) { rot = [rot[0] + dl, target[1], 0]; draw(); return; }
    tween = { from: [rot[0], rot[1]], d: [dl, target[1] - rot[1]], t0: performance.now(), ms: 900 };
  }

  fetch('mundo.json').then((r) => r.json()).then((topo) => {
    feats = topojson.feature(topo, topo.objects.countries).features.filter((f) => f.id);
    mesh = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    for (const f of feats) {
      const color = opts.colorOf(f.id);
      f.properties = { book: !!color };
      f.el = mk('path', { class: color ? 'country has' : 'country' }, landG);
      if (color) { f.el.dataset.iso = f.id; f.el.style.fill = color; }
      if (!shapes.has(f.id) || color) shapes.set(f.id, { el: f.el, centre: d3.geoCentroid(f) });
    }
    for (const [iso, coord] of Object.entries(topo.points || {})) {
      const color = opts.colorOf(iso);
      if (!color) continue;
      const el = mk('circle', { class: 'dot', r: 6.5 }, dotsG);
      el.dataset.iso = iso; el.style.fill = color;
      points.push({ coord, el });
      shapes.set(iso, { el, centre: coord });
    }
    svg.classList.add('ready');
    if (reduce) draw(); else requestAnimationFrame(frame);
  });

  draw();
  return { focus };
}
