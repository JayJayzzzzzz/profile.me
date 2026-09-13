/**
 * Cursor + trail switcher.
 *
 * Two independent layers, each remembered in localStorage:
 *   - the cursor  (the head that follows the pointer)   — default "blend"
 *   - the trail   (what it leaves behind)               — default "webgl"
 *
 * "blend" + "webgl" reproduces the original site exactly: the blend-mode disc
 * plus the WebGL shader trail from public/cursor-trail/effect.js (driven here
 * through window.__webglTrail). Everything else is drawn on two 2-D canvases —
 * #cursor-fxb sits behind the page, #cursor-fx in front.
 *
 * Removed wholesale on touch / coarse pointers.
 */

const CURSOR_KEY = "pm:cursor";
const TRAIL_KEY = "pm:trail";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

interface WebglTrail {
  available: boolean;
  enabled: boolean;
  setEnabled(on: boolean): void;
}
declare global {
  interface Window {
    __webglTrail?: WebglTrail;
  }
}

/* ---- shared runtime state ---------------------------------------------- */

let host: HTMLDivElement;
let fx: HTMLCanvasElement;
let fxb: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let ctxB: CanvasRenderingContext2D;
let W = innerWidth;
let H = innerHeight;
const DPR = Math.min(devicePixelRatio || 1, 2);

let mx = innerWidth / 2;
let my = innerHeight / 2;
let lastX = mx;
let lastY = my;
let vx = 0;
let vy = 0;
let speed = 0;
let hotEl: Element | null = null;

/** Bright accent for canvas strokes, refreshed from --highlight. */
let VIO: [number, number, number] = [176, 137, 244];
let baseVIO: [number, number, number] = [176, 137, 244];
let party = false;
let sprite: HTMLCanvasElement;

addEventListener("pm:konami", (e) => {
  party = !!(e as CustomEvent).detail;
  if (!party && sprite) {
    VIO = baseVIO;
    paintSprite();
  }
});

function hsl(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function readAccent(): void {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--highlight")
    .trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (!m) return;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // lift toward white so it glows on near-black
  baseVIO = [
    Math.round(r + (255 - r) * 0.42),
    Math.round(g + (255 - g) * 0.42),
    Math.round(b + (255 - b) * 0.42),
  ];
  if (!party) VIO = baseVIO;
  if (sprite) paintSprite();
}

function paintSprite(): void {
  const s = sprite.getContext("2d")!;
  s.clearRect(0, 0, 64, 64);
  const g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
  // In party mode the core is a bright tint of the current hue, not white, so
  // the rainbow actually reads instead of being washed out.
  g.addColorStop(
    0,
    party ? `rgba(${255},${230},${255},1)` : "rgba(255,255,255,1)",
  );
  g.addColorStop(0.25, `rgba(${VIO[0]},${VIO[1]},${VIO[2]},${party ? 1 : 0.9})`);
  g.addColorStop(1, `rgba(${VIO[0]},${VIO[1]},${VIO[2]},0)`);
  s.fillStyle = g;
  s.fillRect(0, 0, 64, 64);
}

function rgba(c: [number, number, number], a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function lerp(a: number, b: number, n: number): number {
  return a + (b - a) * n;
}
function el(cls: string, css: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  d.style.cssText = css;
  return d;
}
function clearHost(): void {
  host.innerHTML = "";
  document.getElementById("spotlight")?.remove();
}
function clearFront(): void {
  ctx.clearRect(0, 0, W, H);
}
function clearAll(): void {
  ctx.clearRect(0, 0, W, H);
  ctxB.clearRect(0, 0, W, H);
  bctx.clearRect(0, 0, W, H);
}

/* ---- feedback buffer for the 2-D plasma-ish trails -------------------- */
const buf = document.createElement("canvas");
const bctx = buf.getContext("2d")!;

function resize(): void {
  W = innerWidth;
  H = innerHeight;
  for (const c of [fx, fxb, buf]) {
    c.width = W * DPR;
    c.height = H * DPR;
  }
  fx.style.width = fxb.style.width = W + "px";
  fx.style.height = fxb.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctxB.setTransform(DPR, 0, 0, DPR, 0, 0);
  bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* ===================== CURSORS ===================== */

interface Cursor {
  slug: string;
  name: string;
  desc: string;
  mount?(): void;
  onMove?(): void;
  onFrame?(t: number): void;
  // instance scratch
  [k: string]: unknown;
}

const cursors: Cursor[] = [
  {
    slug: "blend",
    name: "Blend Circle",
    desc: "the original — white disc, inverts what's under it",
    mount() {
      this.n = el("cur cur-blend", "width:38px;height:38px;border-radius:50%;background:#fff");
      this.x = mx;
      this.y = my;
      host.appendChild(this.n as Node);
    },
    onFrame() {
      this.x = lerp(this.x as number, mx, REDUCED ? 1 : 0.32);
      this.y = lerp(this.y as number, my, REDUCED ? 1 : 0.32);
      (this.n as HTMLElement).style.left = (this.x as number) - 19 + "px";
      (this.n as HTMLElement).style.top = (this.y as number) - 19 + "px";
    },
  },
  {
    slug: "ring",
    name: "Dot & Ring",
    desc: "exact dot, ring springs behind and swells over links",
    mount() {
      this.dot = el("cur", "width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:var(--highlight)");
      this.ring = el(
        "cur",
        "width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid var(--highlight);transition:width .18s,height .18s,margin .18s,background .18s",
      );
      this.rx = mx;
      this.ry = my;
      host.append(this.ring as Node, this.dot as Node);
    },
    onFrame() {
      (this.dot as HTMLElement).style.transform = `translate(${mx}px,${my}px)`;
      this.rx = lerp(this.rx as number, mx, REDUCED ? 1 : 0.18);
      this.ry = lerp(this.ry as number, my, REDUCED ? 1 : 0.18);
      const ring = this.ring as HTMLElement;
      ring.style.transform = `translate(${this.rx}px,${this.ry}px)`;
      const s = hotEl ? 52 : 34;
      ring.style.width = ring.style.height = s + "px";
      ring.style.marginLeft = ring.style.marginTop = -s / 2 + "px";
      ring.style.background = hotEl ? "var(--highlight-glow)" : "transparent";
    },
  },
  {
    slug: "crosshair",
    name: "Crosshair",
    desc: "thin reticle with a gap; spins 45° over targets",
    mount() {
      this.n = el("cur", "width:0;height:0");
      this.inner = el(
        "",
        "position:absolute;left:-17px;top:-17px;width:34px;height:34px;transition:transform .16s ease;filter:drop-shadow(0 0 4px var(--highlight-glow))",
      );
      const L = "position:absolute;background:var(--highlight);border-radius:1px;";
      (this.inner as HTMLElement).innerHTML =
        `<span style="${L}left:16px;top:0;width:2.5px;height:13px"></span>` +
        `<span style="${L}left:16px;bottom:0;width:2.5px;height:13px"></span>` +
        `<span style="${L}top:16px;left:0;height:2.5px;width:13px"></span>` +
        `<span style="${L}top:16px;right:0;height:2.5px;width:13px"></span>`;
      (this.n as HTMLElement).appendChild(this.inner as Node);
      host.appendChild(this.n as Node);
    },
    onFrame() {
      (this.n as HTMLElement).style.transform = `translate(${mx}px,${my}px)`;
      (this.inner as HTMLElement).style.transform = hotEl
        ? "rotate(45deg) scale(1.4)"
        : "rotate(0deg) scale(1)";
    },
  },
  {
    slug: "orb",
    name: "Glow Orb",
    desc: "edgeless violet light, screen-blended, breathing",
    mount() {
      this.n = el(
        "cur",
        "width:64px;height:64px;border-radius:50%;mix-blend-mode:screen;background:radial-gradient(circle,var(--highlight) 0,var(--highlight-glow) 40%,transparent 72%)",
      );
      this.x = mx;
      this.y = my;
      host.appendChild(this.n as Node);
    },
    onFrame(t) {
      this.x = lerp(this.x as number, mx, REDUCED ? 1 : 0.22);
      this.y = lerp(this.y as number, my, REDUCED ? 1 : 0.22);
      const n = this.n as HTMLElement;
      n.style.left = (this.x as number) - 32 + "px";
      n.style.top = (this.y as number) - 32 + "px";
      n.style.opacity = REDUCED ? "1" : String(0.82 + Math.sin(t / 420) * 0.12 + (hotEl ? 0.15 : 0));
    },
  },
  {
    slug: "inkblot",
    name: "Inkblot",
    desc: "gooey metaball that stretches when flung, then melts back",
    mount() {
      this.wrap = el("cur", "filter:url(#pm-goo);width:0;height:0");
      const dot = (d: number) =>
        el(
          "",
          `position:absolute;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;border-radius:50%;background:var(--highlight)`,
        );
      this.a = dot(24);
      this.b = dot(17);
      this.c = dot(13);
      (this.wrap as HTMLElement).append(this.a as Node, this.b as Node, this.c as Node);
      host.appendChild(this.wrap as Node);
      ensureGoo();
      this.bx = mx;
      this.by = my;
      this.cx = mx;
      this.cy = my;
    },
    onFrame() {
      (this.a as HTMLElement).style.transform = `translate(${mx}px,${my}px)`;
      this.bx = lerp(this.bx as number, mx, REDUCED ? 1 : 0.28);
      this.by = lerp(this.by as number, my, REDUCED ? 1 : 0.28);
      this.cx = lerp(this.cx as number, mx, REDUCED ? 1 : 0.15);
      this.cy = lerp(this.cy as number, my, REDUCED ? 1 : 0.15);
      (this.b as HTMLElement).style.transform = `translate(${this.bx}px,${this.by}px)`;
      (this.c as HTMLElement).style.transform = `translate(${this.cx}px,${this.cy}px)`;
    },
  },
  {
    slug: "spotlight",
    name: "Spotlight",
    desc: "the page dims; a clear circle follows like a torch",
    mount() {
      const s = document.createElement("div");
      s.id = "spotlight";
      document.body.appendChild(s);
      this.s = s;
      this.n = el("cur", "width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--highlight)");
      host.appendChild(this.n as Node);
    },
    onMove() {
      (this.s as HTMLElement).style.setProperty("--sx", mx + "px");
      (this.s as HTMLElement).style.setProperty("--sy", my + "px");
    },
    onFrame() {
      (this.n as HTMLElement).style.transform = `translate(${mx}px,${my}px)`;
    },
  },
  {
    slug: "blade",
    name: "Velocity Blade",
    desc: "a nib — square at rest, rakes into a streak on the move",
    mount() {
      this.n = el(
        "cur",
        "width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:3px;background:var(--highlight);box-shadow:0 0 10px var(--highlight-glow)",
      );
      this.ang = 0;
      this.st = 0;
      host.appendChild(this.n as Node);
    },
    onFrame() {
      if (speed > 0.4) this.ang = Math.atan2(vy, vx);
      this.st = lerp(this.st as number, Math.min(speed / 7, 3.4), 0.25);
      (this.n as HTMLElement).style.transform =
        `translate(${mx}px,${my}px) rotate(${this.ang}rad) scale(${1 + (this.st as number)},1)`;
    },
  },
  {
    slug: "halo",
    name: "Halo",
    desc: "ring with three orbiting moons; snaps to a box over links",
    mount() {
      this.n = el(
        "cur",
        "width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:1.5px solid var(--highlight);transition:width .2s,height .2s,margin .2s,border-radius .2s",
      );
      (this.n as HTMLElement).innerHTML =
        '<i style="position:absolute;inset:0"></i>'.repeat(3);
      this.moons = (this.n as HTMLElement).querySelectorAll("i");
      (this.moons as NodeListOf<HTMLElement>).forEach((m) => {
        m.innerHTML =
          '<span style="position:absolute;left:50%;top:-2px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--highlight)"></span>';
      });
      this.x = mx;
      this.y = my;
      host.appendChild(this.n as Node);
    },
    onFrame(t) {
      const n = this.n as HTMLElement;
      if (hotEl) {
        const r = hotEl.getBoundingClientRect();
        this.x = lerp(this.x as number, r.left + r.width / 2, 0.25);
        this.y = lerp(this.y as number, r.top + r.height / 2, 0.25);
        const w = r.width + 14;
        const h = r.height + 14;
        n.style.width = w + "px";
        n.style.height = h + "px";
        n.style.marginLeft = -w / 2 + "px";
        n.style.marginTop = -h / 2 + "px";
        n.style.borderRadius = "8px";
      } else {
        this.x = lerp(this.x as number, mx, REDUCED ? 1 : 0.3);
        this.y = lerp(this.y as number, my, REDUCED ? 1 : 0.3);
        n.style.width = n.style.height = "28px";
        n.style.marginLeft = n.style.marginTop = "-14px";
        n.style.borderRadius = "50%";
      }
      n.style.transform = `translate(${this.x}px,${this.y}px)`;
      const spin = REDUCED ? 0 : t / 900;
      (this.moons as NodeListOf<HTMLElement>).forEach((m, i) => {
        m.style.transform = `rotate(${spin + (i * Math.PI * 2) / 3}rad)`;
      });
    },
  },
];

function ensureGoo(): void {
  if (document.getElementById("pm-goo")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML =
    '<defs><filter id="pm-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>' +
    '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="g"/>' +
    '<feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></defs>';
  document.body.appendChild(svg);
}

/* ===================== TRAILS ===================== */

interface Trail {
  slug: string;
  name: string;
  desc: string;
  mount?(): void;
  frame?(dt: number, t: number): void;
  [k: string]: unknown;
}

const trails: Trail[] = [
  { slug: "none", name: "None", desc: "just the cursor" },
  {
    slug: "webgl",
    name: "WebGL Plasma",
    desc: "the original shader trail (public/cursor-trail)",
    // handled specially via window.__webglTrail — no per-frame work here
  },
  {
    slug: "ribbon",
    name: "Neon Ribbon",
    desc: "a glowing tapered line whipping along the path",
    mount() {
      this.pts = [];
    },
    frame() {
      const pts = this.pts as { x: number; y: number }[];
      pts.push({ x: mx, y: my });
      if (pts.length > 34) pts.shift();
      clearFront();
      if (pts.length < 3) return;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.shadowColor = rgba(VIO, 1);
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        // party: keep the core coloured (a bright tint of the hue) so the
        // rainbow shows instead of a white line down the middle.
        ctx.strokeStyle = pass
          ? party
            ? rgba([Math.min(255, VIO[0] + 60), Math.min(255, VIO[1] + 60), Math.min(255, VIO[2] + 60)], 0.95)
            : "rgba(255,255,255,0.9)"
          : rgba(VIO, party ? 0.7 : 0.5);
        ctx.lineWidth = pass ? 2 : 9;
        ctx.shadowBlur = pass ? 6 : 18;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    slug: "ember",
    name: "Ember",
    desc: "warm sparks that peel off, drift up and fade",
    mount() {
      this.ps = [];
    },
    frame() {
      const ps = this.ps as { x: number; y: number; vx: number; vy: number; r: number; a: number }[];
      const n = Math.min(3, Math.floor(speed / 5));
      for (let k = 0; k < n; k++)
        ps.push({
          x: mx + (Math.random() - 0.5) * 8,
          y: my + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 0.8 - vx * 0.05,
          vy: (Math.random() - 0.5) * 0.8 - 0.4,
          r: 4 + Math.random() * 8,
          a: 1,
        });
      clearFront();
      ctx.globalCompositeOperation = "lighter";
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.006;
        p.a -= 0.02;
        if (p.a <= 0) {
          ps.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.a * 0.7;
        ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    slug: "sparks",
    name: "Sparks",
    desc: "sharp four-point stars scattering off fast moves",
    mount() {
      this.ps = [];
    },
    frame() {
      const ps = this.ps as { x: number; y: number; vx: number; vy: number; r: number; a: number; rot: number }[];
      const n = Math.min(5, Math.floor(speed / 4));
      for (let k = 0; k < n; k++)
        ps.push({
          x: mx,
          y: my,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          r: 2 + Math.random() * 3,
          a: 1,
          rot: Math.random() * 6,
        });
      clearFront();
      ctx.globalCompositeOperation = "lighter";
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.a -= 0.04;
        p.rot += 0.15;
        if (p.a <= 0) {
          ps.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(VIO, p.a);
        ctx.beginPath();
        for (let s = 0; s < 8; s++) {
          const rad = s % 2 ? p.r * 0.36 : p.r;
          const ang = (Math.PI / 4) * s;
          if (s) ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
          else ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    slug: "streak",
    name: "Light Streak",
    desc: "a velocity-stretched blur — reads as pure speed",
    mount() {
      this.segs = [];
    },
    frame() {
      const segs = this.segs as { x1: number; y1: number; x2: number; y2: number; a: number }[];
      segs.push({ x1: lastX, y1: lastY, x2: mx, y2: my, a: 1 });
      if (segs.length > 22) segs.shift();
      clearFront();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        s.a -= 0.05;
        const f = i / segs.length;
        ctx.strokeStyle = rgba(VIO, Math.max(0, s.a) * 0.5 * f);
        ctx.lineWidth = 1 + f * 12;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    slug: "ripple",
    name: "Ripple Wake",
    desc: "expanding rings dropped along the path",
    mount() {
      this.rings = [];
      this.acc = 0;
    },
    frame(dt) {
      const rings = this.rings as { x: number; y: number; r: number; a: number }[];
      this.acc = (this.acc as number) + dt;
      if ((this.acc as number) > 110 && speed > 1) {
        this.acc = 0;
        rings.push({ x: mx, y: my, r: 4, a: 0.8 });
      }
      clearFront();
      ctx.globalCompositeOperation = "lighter";
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += 1.6;
        r.a -= 0.012;
        if (r.a <= 0) {
          rings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = rgba(VIO, r.a);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, 7);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    slug: "aurora",
    name: "Aurora",
    desc: "soft blobs lagging at different rates, hue drifting (behind the page)",
    mount() {
      this.b = [
        { x: mx, y: my, k: 0.06 },
        { x: mx, y: my, k: 0.03 },
        { x: mx, y: my, k: 0.017 },
      ];
    },
    frame(dt, t) {
      const blobs = this.b as { x: number; y: number; k: number }[];
      ctxB.clearRect(0, 0, W, H);
      ctxB.globalCompositeOperation = "lighter";
      blobs.forEach((o, i) => {
        o.x = lerp(o.x, mx, o.k);
        o.y = lerp(o.y, my, o.k);
        const hue = 265 + Math.sin(t / 1400 + i * 2) * 35;
        const R = 120 - i * 22;
        const g = ctxB.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
        g.addColorStop(0, `hsla(${hue},90%,68%,0.32)`);
        g.addColorStop(1, `hsla(${hue},90%,60%,0)`);
        ctxB.fillStyle = g;
        ctxB.beginPath();
        ctxB.arc(o.x, o.y, R, 0, 7);
        ctxB.fill();
      });
      ctxB.globalCompositeOperation = "source-over";
    },
  },
];

/* ===================== STATE ===================== */

let cursor: Cursor = cursors[0];
let trail: Trail = trails[1];

function webgl(): WebglTrail | undefined {
  return window.__webglTrail;
}

function setCursor(slug: string, persist = true): void {
  const next = cursors.find((c) => c.slug === slug) ?? cursors[0];
  clearHost();
  cursor = next;
  cursor.mount?.();
  if (persist) safeSet(CURSOR_KEY, cursor.slug);
  syncPanel();
}

function setTrail(slug: string, persist = true): void {
  const next = trails.find((t) => t.slug === slug) ?? trails[1];
  clearAll();
  trail = next;
  webgl()?.setEnabled(trail.slug === "webgl");
  if (trail.slug !== "webgl") trail.mount?.();
  if (persist) safeSet(TRAIL_KEY, trail.slug);
  syncPanel();
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

/* ===================== PICKER UI ===================== */

let panel: HTMLElement | null = null;
let toggleBtn: HTMLButtonElement;

function buildToggle(): void {
  toggleBtn = document.createElement("button");
  toggleBtn.id = "cursor-toggle";
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-haspopup", "true");
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.setAttribute("aria-label", "Cursor & trail");
  toggleBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M6 2.5 19 12l-5.5 1.2L11 20 6 2.5Z"/></svg>';
  toggleBtn.addEventListener("click", () => togglePanel());
  document.body.appendChild(toggleBtn);
}

function row(kind: "cursor" | "trail", item: Cursor | Trail): string {
  return (
    `<button class="cp-row" data-kind="${kind}" data-slug="${item.slug}" type="button">` +
    `<span class="cp-dot"></span><span class="cp-name">${item.name}</span>` +
    `<span class="cp-desc">${item.desc}</span></button>`
  );
}

function buildPanel(): void {
  panel = document.createElement("div");
  panel.id = "cursor-panel";
  panel.hidden = true;
  panel.innerHTML =
    '<h3>Cursor</h3><div class="cp-list">' +
    cursors.map((c) => row("cursor", c)).join("") +
    '</div><h3>Trail</h3><div class="cp-list">' +
    trails.map((t) => row("trail", t)).join("") +
    '</div><button class="cp-reset" type="button">Reset to default</button>';

  panel.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn) return;
    if (btn.classList.contains("cp-reset")) {
      setCursor("blend");
      setTrail("webgl");
      return;
    }
    const slug = btn.dataset.slug;
    if (!slug) return;
    if (btn.dataset.kind === "cursor") setCursor(slug);
    else setTrail(slug);
  });

  document.body.appendChild(panel);
}

function syncPanel(): void {
  if (!panel) return;
  panel.querySelectorAll<HTMLElement>(".cp-row").forEach((r) => {
    const on =
      (r.dataset.kind === "cursor" && r.dataset.slug === cursor.slug) ||
      (r.dataset.kind === "trail" && r.dataset.slug === trail.slug);
    r.classList.toggle("on", on);
  });
}

function togglePanel(force?: boolean): void {
  if (!panel) buildPanel();
  const open = force ?? panel!.hidden;
  panel!.hidden = !open;
  toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  toggleBtn.classList.toggle("open", open);
  if (open) syncPanel();
}

document.addEventListener("click", (e) => {
  if (!panel || panel.hidden) return;
  const t = e.target as Node;
  if (!panel.contains(t) && !toggleBtn.contains(t)) togglePanel(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panel && !panel.hidden) togglePanel(false);
});

/* ===================== LOOP ===================== */

let running = false;
let pt = performance.now();
let modalWasOpen = false;

/** While a link popout / dialog is open the cursor layer is hidden by CSS —
 *  stop drawing to it, and pause the WebGL trail, so the blurred backdrop
 *  isn't compositing over a full-screen canvas that repaints every frame. */
function modalOpen(): boolean {
  const c = document.body.classList;
  return c.contains("dp-open") || c.contains("panel-open");
}

function loop(t: number): void {
  const dt = t - pt;
  pt = t;

  const m = modalOpen();
  if (m !== modalWasOpen) {
    modalWasOpen = m;
    if (m) {
      webgl()?.setEnabled(false);
      clearAll();
    } else {
      webgl()?.setEnabled(trail.slug === "webgl");
    }
  }

  if (!m) {
    if (party && sprite) {
      // ~1.4s per full rainbow, kept saturated (mid lightness) so it isn't
      // washed toward white.
      VIO = hsl((t / 4) % 360, 95, 60);
      paintSprite();
    }
    vx = mx - lastX;
    vy = my - lastY;
    speed = speed * 0.8 + Math.hypot(vx, vy) * 0.2;
    if (trail.slug !== "webgl" && trail.slug !== "none") trail.frame?.(dt, t);
    cursor.onFrame?.(t);
  }

  lastX = mx;
  lastY = my;
  requestAnimationFrame(loop);
}

/* ===================== INIT ===================== */

export function initCursor(): void {
  if (matchMedia("(pointer: coarse)").matches) return;

  document.documentElement.classList.add("has-custom-cursor");

  host = document.createElement("div");
  host.id = "cursor-host";
  fx = document.createElement("canvas");
  fx.id = "cursor-fx";
  fxb = document.createElement("canvas");
  fxb.id = "cursor-fxb";
  document.body.append(fxb, fx, host);
  ctx = fx.getContext("2d")!;
  ctxB = fxb.getContext("2d")!;

  sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  readAccent();
  paintSprite();
  addEventListener("pm:accent", readAccent);

  resize();
  addEventListener("resize", resize);

  addEventListener(
    "pointermove",
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      const target = e.target as Element | null;
      hotEl = target?.closest?.("a,button,.link,.selectable,summary") ?? null;
      cursor.onMove?.();
    },
    { passive: true },
  );
  addEventListener("pointerdown", (e) => {
    if (REDUCED || e.pointerType === "touch") return;
    const ripple = document.createElement("div");
    ripple.className = "click-ripple";
    ripple.style.left = mx + "px";
    ripple.style.top = my + "px";
    document.body.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });

  buildToggle();

  const savedC = safeGet(CURSOR_KEY) ?? "blend";
  const savedT = safeGet(TRAIL_KEY) ?? "webgl";
  setCursor(savedC, false);
  setTrail(savedT, false);

  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}
