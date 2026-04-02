// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_POLYS   = 100;
const GRID_SIZE   = 24;
const SNAP_RADIUS = 20;
const HIT_RADIUS  = 20;

const COLORS = [
  '#7c6fff','#ff6b9d','#00e5c0','#ffa94d',
  '#60a5fa','#f472b6','#34d399','#fb923c',
  '#a78bfa','#f87171','#2dd4bf','#facc15'
];

// ─── State ────────────────────────────────────────────────────────────────────
let polylines   = [];
let currentPoly = null;
let mode        = 'draw';
let movingPoint = null;
let isDragging  = false;
let overPoint   = false;
let snapEnabled = false;
let gridVisible = true;
let shiftDown   = false;
let selectedColor = COLORS[0];
let zoom        = 1;
let panX = 0, panY = 0;
let colorIndex  = 0;

// History for undo/redo
let history     = [];
let historyIdx  = -1;

// ─── Canvas Setup ─────────────────────────────────────────────────────────────
const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const wrap    = document.getElementById('canvas-wrap');

function resizeCanvas() {
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  redraw();
}
window.addEventListener('resize', resizeCanvas);

// ─── Color Strip ──────────────────────────────────────────────────────────────
function buildColorStrip() {
  const strip = document.getElementById('color-strip');
  COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = c;
    sw.title = c;
    sw.setAttribute('role', 'radio');
    sw.setAttribute('aria-label', `Color ${c}`);
    sw.setAttribute('tabindex', i === 0 ? '0' : '-1');
    sw.onclick = () => {
      selectedColor = c;
      document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.remove('selected');
        s.setAttribute('tabindex', '-1');
      });
      sw.classList.add('selected');
      sw.setAttribute('tabindex', '0');
      announce(`Color selected: ${c}`);
    };
    strip.appendChild(sw);
  });
}
buildColorStrip();

// ─── History (Undo/Redo) ──────────────────────────────────────────────────────
function saveState() {
  const snapshot = JSON.stringify({ polylines, currentPoly });
  // Truncate future history if we branched
  history = history.slice(0, historyIdx + 1);
  history.push(snapshot);
  if (history.length > 80) history.shift();
  historyIdx = history.length - 1;
  updateUndoButtons();
}

function undo() {
  if (historyIdx <= 0) return;
  historyIdx--;
  restoreState(history[historyIdx]);
  showToast('Undone', 'info');
  announce('Undo performed');
}

function redo() {
  if (historyIdx >= history.length - 1) return;
  historyIdx++;
  restoreState(history[historyIdx]);
  showToast('Redone', 'info');
  announce('Redo performed');
}

function restoreState(snapshot) {
  const s = JSON.parse(snapshot);
  polylines   = s.polylines;
  currentPoly = s.currentPoly;
  redraw();
  updatePolyList();
  updateStatus();
  updateUndoButtons();
}

function updateUndoButtons() {
  document.getElementById('btn-undo').disabled = historyIdx <= 0;
  document.getElementById('btn-redo').disabled = historyIdx >= history.length - 1;
  document.getElementById('st-undo').textContent = history.length;
}

// ─── Autosave to localStorage ─────────────────────────────────────────────────
function autosave() {
  try {
    localStorage.setItem('polyline-editor-data', JSON.stringify(polylines));
  } catch(e) {}
}

function autoload() {
  try {
    const data = localStorage.getItem('polyline-editor-data');
    if (data) {
      polylines = JSON.parse(data);
      showToast('Session restored', 'success');
      announce('Previous session loaded');
    }
  } catch(e) {}
}

// ─── Mode ────────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  if (m === 'draw') {
    currentPoly = null;
    updatePolyList();
  }
  movingPoint = null;
  isDragging  = false;
  overPoint   = false;
  updateUI();
  updateCanvasCursor();

  const msgs = {
    draw:   'Click to place points. Double-click or right-click to finish.',
    move:   'Click and drag a point to move it.',
    delete: 'Click a point to delete it.'
  };
  showToast(msgs[m], 'info');
  announce(`Mode: ${m}`);
}

function updateCanvasCursor() {
  canvas.className = `mode-${mode}`;
  if (isDragging) canvas.classList.add('dragging');
  else if (overPoint && mode === 'move') canvas.classList.add('over-point');
  else if (overPoint && mode === 'delete') canvas.classList.add('over-point');
}

// ─── Snap Helpers ─────────────────────────────────────────────────────────────
function snapToGrid(val) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function applySnap(x, y) {
  if (snapEnabled || shiftDown) {
    return { x: snapToGrid(x), y: snapToGrid(y) };
  }
  return { x, y };
}

function applyAngleSnap(x, y, fromX, fromY) {
  if (!shiftDown) return { x, y };
  const dx = x - fromX, dy = y - fromY;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return {
    x: fromX + Math.cos(snapped) * len,
    y: fromY + Math.sin(snapped) * len
  };
}

// ─── Coordinate Transform ─────────────────────────────────────────────────────
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.clientX - r.left - panX) / zoom;
  const cy = (e.clientY - r.top  - panY) / zoom;
  return { x: cx, y: cy };
}

function worldToScreen(wx, wy) {
  return { x: wx * zoom + panX, y: wy * zoom + panY };
}

// ─── Closest Point ────────────────────────────────────────────────────────────
function findClosestPoint(mx, my) {
  let best = null, bestD = Infinity;
  polylines.forEach((poly, pi) => {
    poly.points.forEach((pt, vi) => {
      const d = Math.hypot(mx - pt.x, my - pt.y);
      if (d < bestD) { bestD = d; best = { polyIdx: pi, ptIdx: vi }; }
    });
  });
  return bestD < HIT_RADIUS / zoom ? best : null;
}

// ─── Mouse Events ─────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const raw = canvasPos(e);
  let { x, y } = applySnap(raw.x, raw.y);

  if (mode === 'draw') {
    if (currentPoly === null) {
      if (polylines.length >= MAX_POLYS) {
        showToast('Max 100 polylines reached!', 'error');
        announce('Error: maximum polylines reached');
        return;
      }
      // pick next available color based on colorIndex
      const color = selectedColor || COLORS[colorIndex % COLORS.length];
      colorIndex++;
      polylines.push({ points: [], color });
      currentPoly = polylines.length - 1;
    }
    // Apply angle snap if shift held, relative to last point
    const poly = polylines[currentPoly];
    if (shiftDown && poly.points.length > 0) {
      const last = poly.points[poly.points.length - 1];
      const snapped = applyAngleSnap(x, y, last.x, last.y);
      x = snapped.x; y = snapped.y;
    }
    polylines[currentPoly].points.push({ x, y });
    saveState();
    autosave();
    redraw();
    updatePolyList();
    updateStatus();

  } else if (mode === 'move') {
    const found = findClosestPoint(raw.x, raw.y);
    if (found) {
      movingPoint = found;
      isDragging  = true;
      updateCanvasCursor();
      saveState();
    }

  } else if (mode === 'delete') {
    const found = findClosestPoint(raw.x, raw.y);
    if (found) {
      deletePoint(found);
      saveState();
      autosave();
    }
  }
});

canvas.addEventListener('mousemove', e => {
  const raw = canvasPos(e);
  let { x, y } = applySnap(raw.x, raw.y);

  // Update status bar (raw screen coords for clarity)
  document.getElementById('st-mouse').textContent =
    `${Math.round(raw.x)}, ${Math.round(raw.y)}`;

  // Detect hover over point (for cursor change)
  if (mode === 'move' || mode === 'delete') {
    const wasOver = overPoint;
    overPoint = !!findClosestPoint(raw.x, raw.y);
    if (wasOver !== overPoint) updateCanvasCursor();
  }

  if (mode === 'move' && isDragging && movingPoint) {
    polylines[movingPoint.polyIdx].points[movingPoint.ptIdx] = { x, y };
    autosave();
    redraw();
    return;
  }

  if (mode === 'draw' && currentPoly !== null) {
    const poly = polylines[currentPoly];
    if (poly.points.length > 0) {
      const last = poly.points[poly.points.length - 1];
      let tx = x, ty = y;
      if (shiftDown) {
        const snapped = applyAngleSnap(x, y, last.x, last.y);
        tx = snapped.x; ty = snapped.y;
        // Show angle badge
        const angle = Math.atan2(ty - last.y, tx - last.x) * 180 / Math.PI;
        const badge = document.getElementById('angle-badge');
        badge.textContent = `${Math.round(angle)}°`;
        badge.classList.add('show');
      } else {
        document.getElementById('angle-badge').classList.remove('show');
      }
      redraw();
      // Preview dashed line
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = poly.color + '99';
      ctx.lineWidth = 1.5;
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      // Snap indicator at cursor
      if (snapEnabled || shiftDown) {
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5c088';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    } else {
      redraw();
    }
  }
});

canvas.addEventListener('mouseup', e => {
  if (mode === 'move' && isDragging) {
    autosave();
    // Update final state in history
    history[historyIdx] = JSON.stringify({ polylines, currentPoly });
  }
  isDragging  = false;
  movingPoint = null;
  updateCanvasCursor();
});

canvas.addEventListener('dblclick', e => {
  if (mode === 'draw' && currentPoly !== null) {
    finishPolyline();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (mode === 'draw' && currentPoly !== null) finishPolyline();
});

function finishPolyline() {
  const n = polylines[currentPoly]?.points.length || 0;
  showToast(`Polyline ${currentPoly + 1} finished (${n} pts)`, 'success');
  announce(`Polyline ${currentPoly + 1} finished with ${n} points`);
  currentPoly = null;
  saveState();
  autosave();
  updatePolyList();
  updateStatus();
}

// ─── Keyboard Events ──────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Shift') {
    shiftDown = true;
    document.getElementById('angle-badge');
    return;
  }

  // Prevent shortcut conflicts when typing in inputs
  if (e.target !== document.body && e.target !== canvas) return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); return; }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); showExport(); return; }
    return;
  }

  switch (e.key.toLowerCase()) {
    case 'b': setMode('draw');   break;
    case 'm': setMode('move');   break;
    case 'd': setMode('delete'); break;
    case 'g': toggleGrid();      break;
    case 's': toggleSnap();      break;
    case 'q': clearAll();        break;
    case '?': showHelp();        break;
    case '+': case '=': zoomIn();    break;
    case '-': case '_': zoomOut();   break;
    case '0': resetZoom();       break;
    case 'escape':
      if (currentPoly !== null) finishPolyline();
      if (document.getElementById('help-overlay').classList.contains('show')) hideHelp();
      if (document.getElementById('export-modal').classList.contains('show')) hideExport();
      break;
  }
});

document.addEventListener('keyup', e => {
  if (e.key === 'Shift') {
    shiftDown = false;
    document.getElementById('angle-badge').classList.remove('show');
  }
});

// ─── Delete Point ─────────────────────────────────────────────────────────────
function deletePoint({ polyIdx, ptIdx }) {
  const poly = polylines[polyIdx];
  poly.points.splice(ptIdx, 1);
  if (poly.points.length === 0) {
    polylines.splice(polyIdx, 1);
    if (currentPoly === polyIdx) currentPoly = null;
    else if (currentPoly > polyIdx) currentPoly--;
    showToast('Polyline removed', 'info');
    announce('Polyline removed — no points remain');
  } else {
    showToast('Point deleted', 'info');
    announce(`Point ${ptIdx + 1} deleted`);
  }
  redraw();
  updatePolyList();
  updateStatus();
}

// ─── Clear All ────────────────────────────────────────────────────────────────
function clearAll() {
  if (polylines.length === 0) { showToast('Nothing to clear', 'info'); return; }
  if (confirm('Clear all polylines? This cannot be undone beyond the history limit.')) {
    saveState();
    polylines = [];
    currentPoly = null;
    colorIndex = 0;
    redraw();
    updatePolyList();
    updateStatus();
    autosave();
    showToast('All cleared', 'info');
    announce('All polylines cleared');
  }
}

// ─── Snap & Grid Toggles ──────────────────────────────────────────────────────
function toggleSnap() {
  snapEnabled = !snapEnabled;
  document.getElementById('snap-switch').classList.toggle('on', snapEnabled);
  document.getElementById('snap-toggle-row').setAttribute('aria-checked', snapEnabled);
  document.getElementById('snap-status').style.display = snapEnabled ? '' : 'none';
  showToast('Grid snap ' + (snapEnabled ? 'on' : 'off'), 'info');
  announce('Grid snap ' + (snapEnabled ? 'enabled' : 'disabled'));
  redraw();
}

function toggleGrid() {
  gridVisible = !gridVisible;
  document.getElementById('grid-switch').classList.toggle('on', gridVisible);
  document.getElementById('grid-toggle-row').setAttribute('aria-checked', gridVisible);
  announce('Grid ' + (gridVisible ? 'shown' : 'hidden'));
  redraw();
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────
function zoomIn()  { zoom = Math.min(zoom * 1.25, 6); updateZoomLabel(); redraw(); }
function zoomOut() { zoom = Math.max(zoom / 1.25, 0.2); updateZoomLabel(); redraw(); }
function resetZoom() { zoom = 1; panX = 0; panY = 0; updateZoomLabel(); redraw(); }
function updateZoomLabel() {
  document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
  announce(`Zoom: ${Math.round(zoom * 100)}%`);
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Grid
  if (gridVisible) {
    const startX = -panX / zoom;
    const startY = -panY / zoom;
    const endX   = (canvas.width  - panX) / zoom;
    const endY   = (canvas.height - panY) / zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    const gs = GRID_SIZE;
    const ox = Math.floor(startX / gs) * gs;
    const oy = Math.floor(startY / gs) * gs;
    for (let x = ox; x < endX; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
    }
    for (let y = oy; y < endY; y += gs) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
    }
    // Axis lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, startY); ctx.lineTo(0, endY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(startX, 0); ctx.lineTo(endX, 0); ctx.stroke();
  }

  // Draw polylines
  polylines.forEach((poly, pi) => {
    if (poly.points.length === 0) return;
    const isActive = pi === currentPoly;

    // Glow
    ctx.shadowColor = poly.color;
    ctx.shadowBlur  = isActive ? 14 : 5;

    // Lines
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x, poly.points[i].y);
    }
    ctx.strokeStyle = poly.color;
    ctx.lineWidth   = isActive ? 2.5 : 1.8;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Length measurement labels between segments
    if (isActive) {
      ctx.font = `${9 / zoom}px DM Mono`;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 1; i < poly.points.length; i++) {
        const a = poly.points[i - 1], b = poly.points[i];
        const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
        const mx  = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.fillText(len + 'px', mx + 4, my - 4);
      }
    }

    // Points
    poly.points.forEach((p, vi) => {
      const r = (mode === 'move' || mode === 'delete') ? 9 : 5;
      // Check if this is the hovered point
      const isHovered = overPoint && mode !== 'draw' &&
        findClosestPoint(p.x, p.y) &&
        findClosestPoint(p.x, p.y).polyIdx === pi &&
        findClosestPoint(p.x, p.y).ptIdx === vi;

      // Outer ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isHovered ? '#fff' : poly.color;
      ctx.lineWidth   = isHovered ? 2 : 1.2;
      ctx.stroke();

      // Inner fill
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? '#fff' : poly.color;
      ctx.fill();

      // Index
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font      = `${9 / zoom}px DM Mono`;
      ctx.fillText(vi, p.x + 8 / zoom, p.y - 6 / zoom);
    });
  });

  ctx.restore();
}

// ─── UI Updates ───────────────────────────────────────────────────────────────
function updateUI() {
  ['draw', 'move', 'delete'].forEach(m => {
    const btn = document.getElementById('btn-' + m);
    const isActive = m === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive);
  });

  const badge = document.getElementById('st-mode-badge');
  badge.textContent = mode.toUpperCase();
  badge.className = `status-mode-badge mode-${mode}-badge`;
}

function updateStatus() {
  document.getElementById('st-polys').textContent  = polylines.length;
  document.getElementById('poly-count').textContent = polylines.length;
  document.getElementById('st-points').textContent =
    polylines.reduce((s, p) => s + p.points.length, 0);
}

function updatePolyList() {
  const list = document.getElementById('poly-list');
  list.innerHTML = '';
  polylines.forEach((poly, i) => {
    const div = document.createElement('div');
    div.className = 'poly-item' + (i === currentPoly ? ' selected' : '');
    div.setAttribute('role', 'listitem');
    div.setAttribute('aria-label', `Polyline ${i + 1}, ${poly.points.length} points`);
    div.setAttribute('tabindex', '0');
    div.innerHTML = `
      <span class="poly-dot" style="background:${poly.color}"></span>
      <span class="poly-name">Poly ${i + 1}</span>
      <span class="poly-pts">${poly.points.length}pts</span>
      <button class="poly-del" title="Delete polyline" aria-label="Delete polyline ${i + 1}">✕</button>
    `;
    div.querySelector('.poly-del').addEventListener('click', ev => {
      ev.stopPropagation();
      saveState();
      polylines.splice(i, 1);
      if (currentPoly === i) currentPoly = null;
      else if (currentPoly > i) currentPoly--;
      autosave();
      redraw();
      updatePolyList();
      updateStatus();
      showToast(`Polyline ${i + 1} deleted`, 'info');
      announce(`Polyline ${i + 1} deleted`);
    });
    div.addEventListener('click', () => {
      currentPoly = i;
      redraw();
      updatePolyList();
    });
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { currentPoly = i; redraw(); updatePolyList(); }
    });
    list.appendChild(div);
  });
  updateStatus();
}

// ─── Accessibility Announcement ───────────────────────────────────────────────
function announce(msg, assertive = false) {
  const el = document.getElementById(assertive ? 'aria-alert' : 'aria-live');
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const TOAST_ICONS = { success: '✓', error: '✕', info: '·' };
let toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || '·'}</span>${msg}`;
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = '', 2200);
}

// ─── Help / Export ────────────────────────────────────────────────────────────
function showHelp() { document.getElementById('help-overlay').classList.add('show'); }
function hideHelp() { document.getElementById('help-overlay').classList.remove('show'); }
function showExport() { document.getElementById('export-modal').classList.add('show'); }
function hideExport() { document.getElementById('export-modal').classList.remove('show'); }

document.getElementById('help-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideHelp();
});
document.getElementById('export-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideExport();
});

// ─── Export ───────────────────────────────────────────────────────────────────
function exportSVG() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" style="background:#080810">`;
  polylines.forEach(poly => {
    if (poly.points.length < 2) return;
    const pts = poly.points.map(p => `${p.x},${p.y}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${poly.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    poly.points.forEach(p => {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${poly.color}"/>`;
    });
  });
  svg += '</svg>';
  download('polylines.svg', 'image/svg+xml', svg);
  hideExport();
  announce('SVG exported');
}

function exportJSON() {
  const data = JSON.stringify({ polylines, exportedAt: new Date().toISOString() }, null, 2);
  download('polylines.json', 'application/json', data);
  hideExport();
  announce('JSON exported');
}

function exportPNG() {
  const dataURL = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = 'polylines.png';
  a.click();
  hideExport();
  announce('PNG exported');
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
resizeCanvas();
autoload();
saveState(); // initial empty state
updateUI();
updatePolyList();
updateStatus();
updateZoomLabel();
showHelp(); // show help on first load
