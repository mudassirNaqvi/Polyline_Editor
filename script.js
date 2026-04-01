// ===== VARIABLES =====
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let mode = 'b';
let polys = new Array(100).fill(null).map(() => ({
  active: false,
  points: []
}));

let currentPoly = -1;
let moving = null;


// ===== MODE =====
function setMode(m) {
  mode = m;
  currentPoly = -1;

  document.querySelectorAll(".btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(m)?.classList.add("active");

  document.getElementById("mode").innerText =
    m === 'b' ? "Draw" :
    m === 'd' ? "Delete" :
    m === 'm' ? "Move" :
    m === 'i' ? "Insert" : "";

  draw();
}


// ===== RESET =====
function resetAll() {
  polys.forEach(p => { p.active = false; p.points = []; });
  currentPoly = -1;
  draw();
}


// ===== DRAW =====
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  polys.forEach(poly => {
    if (!poly.active || poly.points.length === 0) return;

    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);

    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x, poly.points[i].y);
    }

    ctx.stroke();

    poly.points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}


// ===== HELPERS =====
function nearestVertex(x, y) {
  let minDist = 15;
  let result = null;

  polys.forEach((poly, pi) => {
    if (!poly.active) return;

    poly.points.forEach((p, i) => {
      let d = Math.hypot(p.x - x, p.y - y);
      if (d < minDist) {
        minDist = d;
        result = { polyIndex: pi, pointIndex: i };
      }
    });
  });

  return result;
}

function nearestSegment(x, y) {
  let minDist = 15;
  let result = null;

  polys.forEach((poly, pi) => {
    if (!poly.active) return;

    for (let i = 0; i < poly.points.length - 1; i++) {
      let p1 = poly.points[i];
      let p2 = poly.points[i + 1];

      let dx = p2.x - p1.x;
      let dy = p2.y - p1.y;

      let t = ((x - p1.x) * dx + (y - p1.y) * dy) / (dx * dx + dy * dy);
      if (t < 0 || t > 1) continue;

      let px = p1.x + t * dx;
      let py = p1.y + t * dy;

      let dist = Math.hypot(px - x, py - y);

      if (dist < minDist) {
        minDist = dist;
        result = { polyIndex: pi, segmentIndex: i, x: px, y: py };
      }
    }
  });

  return result;
}


// ===== MOUSE =====
canvas.addEventListener("click", (e) => {
  let rect = canvas.getBoundingClientRect();
  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;

  if (mode === 'b') {
    if (currentPoly === -1) {
      currentPoly = polys.findIndex(p => !p.active);
      if (currentPoly === -1) return;

      polys[currentPoly].active = true;
      polys[currentPoly].points = [];
    }
    polys[currentPoly].points.push({ x, y });
  }

  else if (mode === 'd') {
    let v = nearestVertex(x, y);
    if (v) polys[v.polyIndex].points.splice(v.pointIndex, 1);
  }

  else if (mode === 'm') {
    let v = nearestVertex(x, y);
    if (!moving && v) moving = v;
    else if (moving) {
      polys[moving.polyIndex].points[moving.pointIndex] = { x, y };
      moving = null;
    }
  }

  else if (mode === 'i') {
    let s = nearestSegment(x, y);
    if (s) {
      polys[s.polyIndex].points.splice(s.segmentIndex + 1, 0, { x: s.x, y: s.y });
    }
  }

  draw();
});


// ===== KEYBOARD =====
document.addEventListener("keydown", (e) => {
  if (['b','d','m','i'].includes(e.key)) setMode(e.key);
  else if (e.key === 'r') resetAll();
});


// ===== START =====
draw();
