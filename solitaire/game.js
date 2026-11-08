/* Klondike-solitaire. Inga cookies, ingen spårning.
 * localStorage används bara om spelaren har tryckt på "Godkänn". */
(() => {
  'use strict';

  // ---------- Kort ----------
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suitOf = (id) => Math.floor(id / 13);
  const rankOf = (id) => (id % 13) + 1;
  const isRed = (id) => { const s = suitOf(id); return s === 1 || s === 2; };

  const PIP_LAYOUT = {
    2: [[50, 0], [50, 100]],
    3: [[50, 0], [50, 50], [50, 100]],
    4: [[0, 0], [100, 0], [0, 100], [100, 100]],
    5: [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]],
    6: [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
    7: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]],
    8: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
    9: [[0, 0], [100, 0], [0, 33.3], [100, 33.3], [50, 50], [0, 66.7], [100, 66.7], [0, 100], [100, 100]],
    10: [[0, 0], [100, 0], [50, 16.7], [0, 33.3], [100, 33.3], [0, 66.7], [100, 66.7], [50, 83.3], [0, 100], [100, 100]],
  };

  const STORE_KEY = 'solitaire-klondike-v1';
  const FOUND = ['f0', 'f1', 'f2', 'f3'];
  const TAB = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
  const ALL_PILES = ['stock', 'waste', ...FOUND, ...TAB];

  // ---------- Tillstånd ----------
  let piles, up, moves, elapsed, started, won, drawCount, undoStack;
  let settings = { draw: 1 };
  let stats = { played: 0, won: 0, bestTime: null, bestMoves: null };
  let consent = false;
  let busy = false; // under given / automatisk upplägg

  const board = document.getElementById('board');
  const $ = (id) => document.getElementById(id);
  const els = [];
  const slots = {};
  const lastPos = [];
  const zTimers = [];
  let where = {};
  let M = {};
  let colLastY = [];

  // ---------- Bygg DOM ----------
  function buildCard(id) {
    const el = document.createElement('div');
    el.className = 'card' + (isRed(id) ? ' red' : '');
    el.dataset.id = id;
    const r = rankOf(id), s = SUITS[suitOf(id)], R = RANKS[r - 1];
    let center;
    if (r === 1) center = `<div class="ace">${s}</div>`;
    else if (r > 10) center = `<div class="court"><span class="cl">${R}</span><span class="cs">${s}</span></div>`;
    else center = '<div class="pips">' + PIP_LAYOUT[r].map(([x, y]) =>
      `<span class="pip${y > 50 ? ' dn' : ''}" style="left:${x}%;top:${y}%">${s}</span>`).join('') + '</div>';
    el.innerHTML =
      `<div class="face"><div class="corner tl"><span>${R}</span><span class="s">${s}</span></div>` +
      `<div class="corner br"><span>${R}</span><span class="s">${s}</span></div>${center}` +
      `<div class="big">${s}</div></div><div class="back"></div>`;
    el.setAttribute('aria-label', `${R} ${['spader', 'hjärter', 'ruter', 'klöver'][suitOf(id)]}`);
    return el;
  }

  function buildBoard() {
    for (const key of ALL_PILES) {
      const s = document.createElement('div');
      s.className = 'slot' + (key === 'stock' ? ' stock' : '');
      s.dataset.pile = key;
      if (key[0] === 'f') s.textContent = 'A';
      if (key[0] === 't') s.textContent = 'K';
      if (key === 'waste') s.style.visibility = 'hidden';
      slots[key] = s;
      board.appendChild(s);
    }
    for (let id = 0; id < 52; id++) {
      els[id] = buildCard(id);
      board.appendChild(els[id]);
    }
  }

  // ---------- Layout ----------
  function layout() {
    const W = board.clientWidth, H = board.clientHeight;
    const pad = Math.max(6, Math.min(W, H) * 0.02);
    const gapR = 0.14;
    let cw = (W - 2 * pad) / (7 + 6 * gapR);
    cw = Math.min(cw, (H - 2 * pad) / (1.4 * 3.2), 140);
    cw = Math.max(20, Math.floor(cw));
    const ch = Math.round(cw * 1.4);
    const gap = cw * gapR;
    const totalW = 7 * cw + 6 * gap;
    const x0 = Math.round((W - totalW) / 2);
    const topY = pad + (parseFloat(getComputedStyle(board).paddingTop) || 0);
    M = { W, H, pad, cw, ch, gap, x0, topY, tabY: Math.round(topY + ch + Math.max(gap, ch * 0.12)), fanX: Math.round(cw * 0.3) };
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
    board.classList.toggle('compact', cw < 70);
    for (const key of ALL_PILES) {
      const p = slotPos(key);
      slots[key].style.transform = `translate(${p.x}px,${p.y}px)`;
    }
  }
  const colX = (i) => Math.round(M.x0 + i * (M.cw + M.gap));
  function slotPos(key) {
    if (key === 'stock') return { x: colX(0), y: M.topY };
    if (key === 'waste') return { x: colX(1), y: M.topY };
    if (key[0] === 'f') return { x: colX(3 + +key[1]), y: M.topY };
    return { x: colX(+key[1]), y: M.tabY };
  }

  // ---------- Rendering ----------
  function place(id, x, y, z, pile, index, opts) {
    const el = els[id];
    where[id] = { pile, index };
    const wasUp = el.classList.contains('up');
    el.classList.toggle('up', !!up[id]);
    if (up[id] && !wasUp && !opts.instant) {
      el.classList.remove('flipping'); void el.offsetWidth; el.classList.add('flipping');
      setTimeout(() => el.classList.remove('flipping'), 260);
    }
    const lp = lastPos[id];
    const moved = lp && (lp.x !== x || lp.y !== y);
    el.style.transform = `translate(${x}px,${y}px)`;
    if (moved && !opts.instant) {
      // Lyft kortet över allt annat medan det glider på plats
      el.style.zIndex = 1000 + z;
      clearTimeout(zTimers[id]);
      zTimers[id] = setTimeout(() => { el.style.zIndex = z; }, 230 + (parseFloat(el.style.transitionDelay) || 0) * 1000);
    } else {
      clearTimeout(zTimers[id]);
      el.style.zIndex = z;
    }
    lastPos[id] = { x, y };
  }

  function render(opts = {}) {
    where = {};
    const { cw, ch } = M;
    let p = slotPos('stock');
    piles.stock.forEach((id, i) => place(id, p.x, p.y, i + 1, 'stock', i, opts));
    slots.stock.classList.toggle('empty', piles.stock.length === 0);

    p = slotPos('waste');
    const w = piles.waste, n = w.length;
    const fanCount = drawCount === 3 ? Math.min(3, n) : 1;
    w.forEach((id, i) => {
      const k = i - (n - fanCount);
      place(id, p.x + (k > 0 ? k * M.fanX : 0), p.y, i + 1, 'waste', i, opts);
    });

    for (const f of FOUND) {
      p = slotPos(f);
      piles[f].forEach((id, i) => place(id, p.x, p.y, i + 1, f, i, opts));
    }

    const avail = M.H - M.pad - M.tabY - ch;
    colLastY = [];
    TAB.forEach((t, c) => {
      const col = piles[t];
      p = slotPos(t);
      const nDown = col.filter((id) => !up[id]).length;
      const nUp = col.length - nDown;
      let dOff = ch * 0.11;
      let uOff = ch * (board.classList.contains('compact') ? 0.3 : 0.26);
      const need = () => nDown * dOff + Math.max(0, nUp - 1) * uOff;
      if (need() > avail) {
        dOff = Math.max(ch * 0.05, nDown ? Math.min(dOff, (avail - Math.max(0, nUp - 1) * uOff) / nDown) : dOff);
        if (need() > avail && nUp > 1) uOff = Math.max(ch * 0.12, (avail - nDown * dOff) / (nUp - 1));
      }
      let y = p.y;
      col.forEach((id, i) => {
        place(id, p.x, Math.round(y), i + 1, t, i, opts);
        if (i < col.length - 1) y += up[id] ? uOff : dOff;
      });
      colLastY[c] = Math.round(y);
    });
    updateHud();
  }

  function instantRender() {
    board.classList.add('no-anim');
    render({ instant: true });
    void board.offsetWidth;
    board.classList.remove('no-anim');
  }

  // ---------- Spelregler ----------
  const top = (key) => { const a = piles[key]; return a[a.length - 1]; };

  function legal(card, to, count) {
    const t = top(to);
    if (to[0] === 'f') {
      if (count !== 1) return false;
      return t === undefined ? rankOf(card) === 1 : suitOf(t) === suitOf(card) && rankOf(card) === rankOf(t) + 1;
    }
    if (to[0] === 't') {
      return t === undefined ? rankOf(card) === 13 : up[t] && isRed(t) !== isRed(card) && rankOf(card) === rankOf(t) - 1;
    }
    return false;
  }

  function canDragFrom(pile, index) {
    const a = piles[pile];
    if (pile === 'stock') return false;
    if (pile === 'waste' || pile[0] === 'f') return index === a.length - 1;
    return !!up[a[index]];
  }

  function snapshot() { return JSON.stringify({ piles, up, moves }); }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 1000) undoStack.shift();
  }

  function begin() {
    if (!started) { started = true; stats.played++; }
  }

  function doMove(from, index, to) {
    pushUndo();
    const ids = piles[from].splice(index);
    piles[to].push(...ids);
    if (from[0] === 't') {
      const t = top(from);
      if (t !== undefined && !up[t]) up[t] = true;
    }
    moves++;
    begin();
    afterChange();
  }

  function draw() {
    if (!piles.stock.length && !piles.waste.length) return;
    pushUndo();
    if (piles.stock.length) {
      const n = Math.min(drawCount, piles.stock.length);
      for (let i = 0; i < n; i++) { const c = piles.stock.pop(); up[c] = true; piles.waste.push(c); }
    } else {
      while (piles.waste.length) { const c = piles.waste.pop(); up[c] = false; piles.stock.push(c); }
    }
    moves++;
    begin();
    afterChange();
  }

  function undo() {
    if (!undoStack.length || won || busy) return;
    const s = JSON.parse(undoStack.pop());
    piles = s.piles; up = s.up; moves = s.moves;
    render();
    updateButtons();
    save();
  }

  function afterChange() {
    render();
    updateButtons();
    checkWin();
    save();
  }

  function autoMove(pile, index) {
    const card = piles[pile][index];
    const count = piles[pile].length - index;
    if (count === 1 && pile[0] !== 'f') {
      // Föredra den grund som redan har samma färg
      const fs = FOUND.filter((f) => legal(card, f, 1));
      if (fs.length) return doMove(pile, index, fs[0]);
    }
    const others = TAB.filter((t) => t !== pile);
    let t = others.find((k) => piles[k].length && legal(card, k, count));
    if (!t && !(pile[0] === 't' && index === 0)) t = others.find((k) => !piles[k].length && legal(card, k, count));
    if (t) return doMove(pile, index, t);
    // Inget giltigt drag: skaka kortet
    for (const id of piles[pile].slice(index)) {
      const el = els[id];
      el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
      setTimeout(() => el.classList.remove('nope'), 320);
    }
  }

  function canAutoFinish() {
    if (won || piles.stock.length || piles.waste.length) return false;
    return TAB.every((t) => piles[t].every((id) => up[id])) && FOUND.some((f) => piles[f].length < 13);
  }

  function autoFinish() {
    if (busy || !canAutoFinish()) return;
    busy = true;
    const step = () => {
      let best = null;
      for (const t of TAB) {
        const c = top(t);
        if (c === undefined) continue;
        const f = FOUND.find((k) => legal(c, k, 1));
        if (f && (!best || rankOf(c) < rankOf(best.c))) best = { c, t, f };
      }
      if (!best) { busy = false; updateButtons(); return; }
      doMove(best.t, piles[best.t].length - 1, best.f);
      if (won) { busy = false; return; }
      setTimeout(step, 90);
    };
    step();
  }

  function checkWin() {
    if (won || !FOUND.every((f) => piles[f].length === 13)) return;
    won = true;
    stats.won++;
    if (stats.bestTime === null || elapsed < stats.bestTime) stats.bestTime = elapsed;
    if (stats.bestMoves === null || moves < stats.bestMoves) stats.bestMoves = moves;
    save();
    updateButtons();
    FOUND.forEach((f, fi) => piles[f].forEach((id, i) => {
      const face = els[id].querySelector('.face');
      face.style.animationDelay = `${(i * 4 + fi) * 0.03}s`;
      els[id].classList.add('hop');
    }));
    setTimeout(() => {
      $('winText').textContent = `Tid ${fmtTime(elapsed)} · ${moves} drag`;
      $('win').hidden = false;
    }, 900);
  }

  // ---------- Nytt spel ----------
  function shuffle(a) {
    const r = new Uint32Array(a.length);
    crypto.getRandomValues(r);
    for (let i = a.length - 1; i > 0; i--) {
      const j = r[i] % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clearEffects() {
    els.forEach((el) => {
      el.classList.remove('hop', 'nope', 'flipping');
      el.querySelector('.face').style.animationDelay = '';
      el.style.transitionDelay = '';
    });
  }

  function newGame() {
    clearEffects();
    $('win').hidden = true;
    const deck = shuffle([...Array(52).keys()]);
    piles = {};
    ALL_PILES.forEach((k) => (piles[k] = []));
    up = new Array(52).fill(false);
    const order = [];
    for (let row = 0; row < 7; row++) {
      for (let c = row; c < 7; c++) {
        const id = deck.pop();
        piles['t' + c].push(id);
        up[id] = c === row;
        order.push(id);
      }
    }
    piles.stock = deck;
    moves = 0; elapsed = 0; started = false; won = false;
    drawCount = settings.draw;
    undoStack = [];
    $('drawNote').hidden = true;

    // Giv-animation: alla kort börjar i högen och delas ut ett i taget
    const sp = slotPos('stock');
    board.classList.add('no-anim');
    for (let id = 0; id < 52; id++) {
      els[id].classList.remove('up');
      els[id].style.transform = `translate(${sp.x}px,${sp.y}px)`;
      lastPos[id] = { x: sp.x, y: sp.y };
    }
    void board.offsetWidth;
    board.classList.remove('no-anim');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) order.forEach((id, i) => { els[id].style.transitionDelay = `${i * 0.03}s`; });
    busy = true;
    render({ instant: true });
    setTimeout(() => {
      order.forEach((id) => { els[id].style.transitionDelay = ''; });
      busy = false;
    }, reduce ? 0 : order.length * 30 + 250);
    updateButtons();
    save();
  }

  function requestNewGame() {
    if (started && !won) $('confirm').hidden = false;
    else newGame();
  }

  // ---------- HUD & knappar ----------
  function fmtTime(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  }
  function updateHud() {
    $('hudTime').textContent = fmtTime(elapsed);
    $('hudMoves').textContent = `${moves} drag`;
  }
  function updateButtons() {
    $('btnUndo').disabled = !undoStack.length || won;
    $('btnAuto').hidden = !canAutoFinish() || busy;
  }

  setInterval(() => {
    if (started && !won && !document.hidden) {
      elapsed++;
      updateHud();
      if (elapsed % 15 === 0) save();
    }
  }, 1000);

  // ---------- Pekare: dra & klicka (mus + touch) ----------
  let press = null;

  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (press || busy || won) return;
    const cardEl = e.target.closest('.card');
    const slotEl = e.target.closest('.slot');
    press = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, dragging: false, id: null, slot: slotEl ? slotEl.dataset.pile : null };
    if (cardEl) {
      const id = +cardEl.dataset.id;
      const w = where[id];
      Object.assign(press, { id, pile: w.pile, index: w.index, canDrag: canDragFrom(w.pile, w.index) });
    }
    try { board.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });

  board.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.dragging) {
      if (!press.canDrag || Math.hypot(dx, dy) < 6) return;
      press.dragging = true;
      press.ids = piles[press.pile].slice(press.index);
      press.start = press.ids.map((id) => ({ ...lastPos[id] }));
      press.ids.forEach((id, i) => {
        clearTimeout(zTimers[id]);
        els[id].classList.add('dragging');
        els[id].style.zIndex = 3000 + i;
      });
    }
    press.ids.forEach((id, i) => {
      els[id].style.transform = `translate(${press.start[i].x + dx}px,${press.start[i].y + dy}px)`;
    });
    press.dx = dx; press.dy = dy;
  });

  function targetRect(key) {
    const p = slotPos(key);
    if (key[0] === 't') {
      const c = +key[1];
      const h = (piles[key].length ? colLastY[c] - p.y : 0) + M.ch;
      return { x: p.x, y: p.y, w: M.cw, h };
    }
    return { x: p.x, y: p.y, w: M.cw, h: M.ch };
  }

  function overlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function endDrag(cancelled) {
    const { ids, pile, index } = press;
    ids.forEach((id) => els[id].classList.remove('dragging'));
    let best = null;
    if (!cancelled) {
      const r = { x: press.start[0].x + press.dx, y: press.start[0].y + press.dy, w: M.cw, h: M.ch };
      for (const key of [...FOUND, ...TAB]) {
        if (key === pile || !legal(ids[0], key, ids.length)) continue;
        const ov = overlap(r, targetRect(key));
        if (ov > 0 && (!best || ov > best.ov)) best = { key, ov };
      }
    }
    if (best) doMove(pile, index, best.key);
    else {
      // Tillbaka till ursprungsplatsen
      ids.forEach((id) => { lastPos[id] = { x: -1, y: -1 }; });
      render();
    }
  }

  board.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const pr = press;
    if (pr.dragging) endDrag(false);
    else if (pr.id !== null) {
      if (pr.pile === 'stock') draw();
      else if (pr.canDrag) autoMove(pr.pile, pr.index);
    } else if (pr.slot === 'stock') draw();
    press = null;
  });

  board.addEventListener('pointercancel', (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (press.dragging) endDrag(true);
    press = null;
  });

  board.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); instantRender(); }, 60);
  });

  // ---------- Lagring (bara efter godkännande) ----------
  function save() {
    if (!consent) return;
    try {
      const game = won ? null : { piles, up, moves, elapsed, started, drawCount };
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, settings, stats, game }));
    } catch (_) { /* full eller blockerad lagring: spelet fungerar ändå */ }
  }

  function validGame(g) {
    if (!g || !g.piles || !Array.isArray(g.up) || g.up.length !== 52) return false;
    const seen = new Set();
    for (const k of ALL_PILES) {
      if (!Array.isArray(g.piles[k])) return false;
      for (const id of g.piles[k]) {
        if (!Number.isInteger(id) || id < 0 || id > 51 || seen.has(id)) return false;
        seen.add(id);
      }
    }
    return seen.size === 52 && (g.drawCount === 1 || g.drawCount === 3);
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { data = null; }
    if (!data) return false;
    consent = true;
    if (data.settings && (data.settings.draw === 1 || data.settings.draw === 3)) settings = data.settings;
    if (data.stats) stats = Object.assign(stats, data.stats);
    if (validGame(data.game)) {
      const g = data.game;
      piles = g.piles; up = g.up; moves = g.moves | 0; elapsed = g.elapsed | 0;
      started = !!g.started; won = false; drawCount = g.drawCount; undoStack = [];
      return true;
    }
    return 'nogame';
  }

  function forget() {
    consent = false;
    try { localStorage.removeItem(STORE_KEY); } catch (_) { /* ignore */ }
  }

  // ---------- Notis & meny ----------
  $('consentYes').onclick = () => { consent = true; save(); $('consent').hidden = true; };
  $('consentNo').onclick = () => { $('consent').hidden = true; };

  function openMenu() {
    document.querySelectorAll('input[name="draw"]').forEach((r) => { r.checked = +r.value === settings.draw; });
    $('stPlayed').textContent = stats.played;
    $('stWon').textContent = stats.won;
    $('stPct').textContent = stats.played ? Math.round((stats.won / stats.played) * 100) + ' %' : '–';
    $('stTime').textContent = stats.bestTime === null ? '–' : fmtTime(stats.bestTime);
    $('stMoves').textContent = stats.bestMoves === null ? '–' : stats.bestMoves;
    $('storeStatus').textContent = consent
      ? 'Inställningar, statistik och pågående spel sparas i webbläsaren på den här enheten. Inga cookies används.'
      : 'Inget sparas. Inga cookies används. Statistiken försvinner när du stänger sidan.';
    $('btnStore').textContent = consent ? 'Sluta spara och radera data' : 'Godkänn lagring på enheten';
    $('menu').hidden = false;
  }

  document.querySelectorAll('input[name="draw"]').forEach((r) => r.addEventListener('change', () => {
    settings.draw = +r.value;
    if (!started || won) newGame();
    else $('drawNote').hidden = settings.draw === drawCount;
    save();
  }));
  $('btnStore').onclick = () => {
    if (consent) forget(); else { consent = true; save(); $('consent').hidden = true; }
    openMenu();
  };
  $('btnResetStats').onclick = () => {
    stats = { played: started && !won ? 1 : 0, won: 0, bestTime: null, bestMoves: null };
    save();
    openMenu();
  };
  $('menuClose').onclick = () => { $('menu').hidden = true; };
  $('menu').addEventListener('click', (e) => { if (e.target.id === 'menu') $('menu').hidden = true; });

  $('btnNew').onclick = requestNewGame;
  $('btnUndo').onclick = undo;
  $('btnAuto').onclick = autoFinish;
  $('btnMenu').onclick = openMenu;
  $('confirmNo').onclick = () => { $('confirm').hidden = true; };
  $('confirmYes').onclick = () => { $('confirm').hidden = true; newGame(); };
  $('winNew').onclick = newGame;

  // ---------- Start ----------
  buildBoard();
  layout();
  const loaded = load();
  if (loaded === true) { instantRender(); updateButtons(); }
  else newGame();
  if (!consent) setTimeout(() => { $('consent').hidden = false; }, 800);
})();
