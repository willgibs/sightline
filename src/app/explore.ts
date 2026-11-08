import type { Tuning } from '../config/tuning';
import { defaultCampSpec, type CampSpec, type Point2, type Survey } from '../sim/generation';
import { Rng } from '../sim/kernel/core/rng';
import { randomSeed } from '../sim/kernel/core/seed';
import { palette } from '../render/palette';
import type { ExploreReply, ExploreRequest } from './exploreWorker';

/**
 * The seed explorer (`?explore`, lab D's D2): a grid of generated camps with their
 * validation results, so the generator's range can be seen at a glance and any camp
 * opened to play. `?series=<name>` picks the series (the same seeds `npm run seeds --
 * --from <name>` reports on), `?count=<n>` how many. Each card shows the valley and the
 * camp from above; clicking it plays the seed.
 *
 * Generation runs in workers (exploreWorker.ts), a few at a time, so cards fill in as
 * their camps are built. The later milestones add their layers to the camp view: the
 * viewsheds, coverage and idleness, sightlines, perch scores and approach paths.
 */

const VIEW = 220;

export class Explorer {
  private readonly cards = new Map<string, HTMLElement>();
  private readonly surveys = new Map<string, Survey>();
  private readonly summary: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly started = performance.now();
  private readonly ms: number[] = [];
  private workers: Worker[] = [];
  private readonly seeds: string[];
  private readonly series: string;
  /** Lab D's generated camps (`&camp`), or Phase 0's valley; the default becomes the compound at D9. */
  private readonly camp: CampSpec | null;

  constructor(
    root: HTMLElement,
    private readonly tuning: Tuning,
    params: URLSearchParams,
  ) {
    this.series = params.get('series') || 'explore';
    this.camp = params.has('camp') ? { ...defaultCampSpec(), difficulty: clampUnit(Number(params.get('difficulty') ?? defaultCampSpec().difficulty)) } : null;
    const count = Math.max(1, Math.min(400, Number(params.get('count')) || 24));
    const list = new Rng(this.series, 'list');
    this.seeds = Array.from({ length: count }, () => randomSeed(() => list.next()));
    document.body.classList.add('exploring');
    root.innerHTML = '';
    const head = el('header', 'explore-head');
    head.innerHTML = `<div class="wordmark">SIGHTLINE</div><div class="explore-title">Seed explorer</div>`;
    const form = el('form', 'explore-form') as HTMLFormElement;
    form.innerHTML = `<label>Series <input name="series" value="${escapeHtml(this.series)}" spellcheck="false"></label><label>Camps <input name="count" type="number" min="1" max="400" value="${count}"></label><button type="submit">Explore</button>`;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const url = new URL(window.location.href);
      url.searchParams.set('explore', '');
      url.searchParams.set('series', String(data.get('series') || 'explore'));
      url.searchParams.set('count', String(data.get('count') || 24));
      if (this.camp) url.searchParams.set('camp', '');
      window.location.href = url.toString();
    });
    head.append(form);
    this.summary = el('div', 'explore-summary');
    head.append(this.summary);
    this.grid = el('main', 'explore-grid');
    root.append(head, this.grid);
    for (const seed of this.seeds) {
      const card = el('a', 'explore-card is-pending');
      card.setAttribute('href', `?seed=${encodeURIComponent(seed)}${this.camp ? `&camp&difficulty=${this.camp.difficulty}` : ''}`);
      card.innerHTML = `<div class="explore-views"><canvas width="${VIEW}" height="${VIEW}"></canvas><canvas width="${VIEW}" height="${VIEW}"></canvas></div><div class="explore-caption"><span class="explore-seed">${seed}</span><span class="explore-status">generating…</span></div><div class="explore-notes"></div>`;
      this.grid.append(card);
      this.cards.set(seed, card);
    }
    this.updateSummary();
  }

  start(): void {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    for (let w = 0; w < n; w++) {
      const worker = new Worker(new URL('./exploreWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<ExploreReply>) => this.receive(e.data);
      const request: ExploreRequest = { tuning: this.tuning, seeds: this.seeds.filter((_, k) => k % n === w), batch: 1, camp: this.camp };
      worker.postMessage(request);
      this.workers.push(worker);
    }
  }

  private receive(reply: ExploreReply): void {
    const card = this.cards.get(reply.seed);
    if (!card) return;
    card.classList.remove('is-pending');
    const status = card.querySelector('.explore-status')!;
    if ('error' in reply) {
      card.classList.add('is-error');
      status.textContent = 'failed to generate';
      card.querySelector('.explore-notes')!.textContent = reply.error;
      this.updateSummary();
      return;
    }
    const s = reply.survey;
    this.surveys.set(reply.seed, s);
    this.ms.push(reply.ms);
    const first = s.attempt === 0 && s.repairs === 0;
    card.classList.add(s.ok ? (first ? 'is-first' : 'is-repaired') : 'is-invalid');
    status.textContent = !s.ok ? 'fails validation' : first ? 'valid at the first attempt' : s.repairs > 0 ? `valid after ${s.repairs} repair${s.repairs === 1 ? '' : 's'}` : `valid after ${s.attempt} re-roll${s.attempt === 1 ? '' : 's'}`;
    const notes = card.querySelector('.explore-notes')!;
    const stats = Object.entries(s.stats)
      .map(([k, v]) => `<span><b>${v}</b> ${escapeHtml(k)}</span>`)
      .join('');
    notes.innerHTML = `<div class="explore-stats">${stats}<span><b>${s.guards.length}</b> guards</span><span><b>${Math.round(reply.ms)}</b> ms</span></div>${s.problems.map((p) => `<div class="explore-problem">${escapeHtml(p)}</div>`).join('')}`;
    const [valley, camp] = card.querySelectorAll('canvas');
    drawValley(valley!.getContext('2d')!, s);
    drawCamp(camp!.getContext('2d')!, s);
    this.updateSummary();
  }

  private updateSummary(): void {
    const done = [...this.surveys.values()];
    const first = done.filter((s) => s.ok && s.attempt === 0 && s.repairs === 0).length;
    const valid = done.filter((s) => s.ok).length;
    const pending = this.seeds.length - this.cards.size + [...this.cards.values()].filter((c) => c.classList.contains('is-pending')).length;
    const mean = this.ms.length ? this.ms.reduce((a, b) => a + b, 0) / this.ms.length : 0;
    this.summary.textContent =
      `Series “${this.series}”: ${done.length} of ${this.seeds.length} generated` +
      (done.length ? ` · ${first} valid at the first attempt · ${valid - first} after re-rolls or repairs · ${done.length - valid} invalid · ${Math.round(mean)} ms each` : '') +
      (pending > 0 ? '' : ` · all in ${((performance.now() - this.started) / 1000).toFixed(1)} s`);
  }
}

/** The whole valley from above: shaded relief with contours, the road and creek, the camp and its perches. */
function drawValley(ctx: CanvasRenderingContext2D, s: Survey): void {
  const { n, size, heights } = s.terrain;
  const img = ctx.createImageData(VIEW, VIEW);
  const cell = size / n;
  for (let py = 0; py < VIEW; py++) {
    for (let px = 0; px < VIEW; px++) {
      const i = Math.min(n - 2, Math.floor((px / VIEW) * n));
      const j = Math.min(n - 2, Math.floor((py / VIEW) * n));
      const h = heights[j * n + i]!;
      const dx = (heights[j * n + i + 1]! - h) / cell;
      const dz = (heights[(j + 1) * n + i]! - h) / cell;
      // Light from the north-west, and a tint that darkens with height.
      const shade = Math.max(0, Math.min(1, 0.72 - (dx * 0.55 + dz * 0.55)));
      const lift = Math.max(0, Math.min(1, h / 90));
      const contour = Math.floor(h / 10) !== Math.floor(heights[j * n + Math.min(n - 1, i + 1)]! / 10) || Math.floor(h / 10) !== Math.floor(heights[Math.min(n - 1, j + 1) * n + i]! / 10);
      const base = 214 - lift * 70;
      const v = contour ? base * 0.72 : base * (0.75 + 0.35 * shade);
      const k = (py * VIEW + px) * 4;
      img.data[k] = v * 0.98;
      img.data[k + 1] = v;
      img.data[k + 2] = v * 0.94;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const toPx = (x: number) => ((x + size / 2) / size) * VIEW;
  const line = (pts: Array<{ x: number; z: number }>, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, k) => (k === 0 ? ctx.moveTo(toPx(p.x), toPx(p.z)) : ctx.lineTo(toPx(p.x), toPx(p.z))));
    ctx.stroke();
  };
  line(s.creek, palette.surface.water, 2);
  line(s.road, '#a8916a', 1.5);
  for (const rd of s.ridges ?? []) {
    line(rd.crest, 'rgba(29,34,39,0.7)', 1.2);
    for (const g of rd.gullies) {
      ctx.strokeStyle = '#2b8a3e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toPx(g.x), toPx(g.z), 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const f of s.fords ?? []) {
    ctx.fillStyle = '#1864ab';
    ctx.fillRect(toPx(f.x) - 2.5, toPx(f.z) - 2.5, 5, 5);
  }
  ctx.strokeStyle = 'rgba(29,34,39,0.35)';
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(toPx(-s.playHalf), toPx(-s.playHalf), toPx(s.playHalf) - toPx(-s.playHalf), toPx(s.playHalf) - toPx(-s.playHalf));
  ctx.setLineDash([]);
  for (const p of s.analysis?.perches ?? []) {
    // Analysed perches: darker the more of the camp they see, ringed if they see the target.
    ctx.fillStyle = `rgba(29, 34, 39, ${(0.2 + 0.8 * Math.min(1, p.coverage / 0.6)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(toPx(p.x), toPx(p.z), 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (p.target > 0.1) {
      ctx.strokeStyle = '#c92a2a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  for (const p of s.analysis ? [] : s.perches) {
    ctx.fillStyle = palette.debug.ridges[p.ridge % palette.debug.ridges.length]!;
    const x = toPx(p.x);
    const y = toPx(p.z);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 3.5, y + 3);
    ctx.lineTo(x - 3.5, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = palette.edge;
  ctx.fillRect(toPx(s.site.x) - 3, toPx(s.site.z) - 3, 6, 6);
}

/** The camp from above: its structures by kind, its guards by role, and their routes. */
function drawCamp(ctx: CanvasRenderingContext2D, s: Survey): void {
  ctx.fillStyle = '#eef0f1';
  ctx.fillRect(0, 0, VIEW, VIEW);
  let half = 30;
  for (const st of s.structures) {
    for (const sh of st.shapes) {
      const pts = 'corners' in sh ? sh.corners : [{ x: sh.x + sh.r, z: sh.z + sh.r }];
      for (const p of pts) half = Math.max(half, Math.abs(p.x - s.site.x) + 6, Math.abs(p.z - s.site.z) + 6);
    }
  }
  const an = s.analysis;
  for (const path of [an?.infiltration, an?.exfil]) for (const p of path ?? []) half = Math.max(half, Math.abs(p.x - s.site.x) + 3, Math.abs(p.z - s.site.z) + 3);
  const scale = VIEW / (2 * half);
  const toPx = (x: number, z: number): [number, number] => [(x - s.site.x + half) * scale, (z - s.site.z + half) * scale];
  if (an) {
    // Coverage: how much of the cycle some guard watches each patch of ground.
    const h = an.heat;
    const f = an.frame;
    for (let j = 0; j < h.nb; j++) {
      for (let i = 0; i < h.na; i++) {
        const c = h.coverage[j * h.na + i]!;
        if (c <= 0.02) continue;
        const a = h.a0 + (i + 0.5) * h.cell;
        const b = h.b0 + (j + 0.5) * h.cell;
        const [x, y] = toPx(f.ox + f.ux * a + f.vx * b, f.oz + f.uz * a + f.vz * b);
        ctx.fillStyle = `rgba(224, 49, 49, ${(0.08 + 0.5 * c).toFixed(3)})`;
        const size = h.cell * scale + 0.6;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }
  const fill: Partial<Record<string, string>> = {
    building: '#cfd2d4',
    tower: '#b5b9bd',
    container: '#c3c9ce',
    vehicle: '#a9afb5',
    sandbags: '#d8cfbd',
    crate: '#d8cfbd',
    generator: '#e8590c',
    mast: '#1864ab',
    pole: '#868e96',
    light: '#f08c00',
    alarm: '#e03131',
    shed: '#e9ecef',
    ladder: '#868e96',
  };
  for (const st of s.structures) {
    for (const sh of st.shapes) {
      if ('corners' in sh) {
        ctx.beginPath();
        sh.corners.forEach((p, k) => {
          const [x, y] = toPx(p.x, p.z);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        if (st.kind === 'fence' || st.kind === 'post') {
          ctx.strokeStyle = palette.fence;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = fill[st.kind] ?? '#c9cdd1';
          ctx.fill();
          ctx.strokeStyle = 'rgba(29,34,39,0.55)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      } else {
        const [x, y] = toPx(sh.x, sh.z);
        ctx.fillStyle = fill[st.kind] ?? '#868e96';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, sh.r * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const path = (pts: Point2[], color: string, width: number, dash: number[] = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, k) => {
      const [x, y] = toPx(p.x, p.z);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  for (const ve of s.vehicles ?? []) {
    ctx.beginPath();
    ve.corners.forEach((p, k) => {
      const [x, y] = toPx(p.x, p.z);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = ve.escape ? '#c92a2a' : '#868e96';
    ctx.fill();
  }
  for (const d of s.doors ?? []) {
    const [x0, y0] = toPx(d.x - (d.ux * d.width) / 2, d.z - (d.uz * d.width) / 2);
    const [x1, y1] = toPx(d.x + (d.ux * d.width) / 2, d.z + (d.uz * d.width) / 2);
    ctx.strokeStyle = '#2b8a3e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  if (s.skeleton) {
    path(s.skeleton.corridor, 'rgba(43,138,62,0.85)', 1.5, [4, 3]);
    path(s.skeleton.escape, 'rgba(201,42,42,0.75)', 1.5, [2, 2]);
    const [sx, sy] = toPx(s.skeleton.sabotage.x, s.skeleton.sabotage.z);
    ctx.strokeStyle = '#e8590c';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 4, sy - 4, 8, 8);
  }
  if (an) {
    // The sightline graph: who would see whom drop, coloured by cluster; unsolved in red.
    const clusterOf = new Map<number, { members: number[]; certified: string }>();
    for (const c of an.clusters) if (c.members.length > 1) for (const m of c.members) clusterOf.set(m, c);
    for (const e of an.edges) {
      const ca = clusterOf.get(e.a);
      const same = ca !== undefined && ca === clusterOf.get(e.b);
      const ga = s.guards[e.a]!;
      const gb = s.guards[e.b]!;
      const [x0, y0] = toPx(ga.x, ga.z);
      const [x1, y1] = toPx(gb.x, gb.z);
      ctx.strokeStyle = !same ? 'rgba(134,142,150,0.35)' : ca!.certified === 'unsolved' ? 'rgba(224,49,49,0.9)' : 'rgba(112,72,232,0.75)';
      ctx.lineWidth = same ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // The ways the analysis found: in to the target, to the generator, and back out.
    if (an.sabotage) path(an.sabotage, 'rgba(232,89,12,0.85)', 1.4);
    if (an.exfil) path(an.exfil, 'rgba(24,100,171,0.85)', 1.4);
    if (an.infiltration) path(an.infiltration, 'rgba(43,138,62,0.95)', 1.8);
  }
  for (const g of s.guards) {
    const color = palette.debug.roles[g.role];
    if (g.route) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      g.route.forEach((p, k) => {
        const [x, y] = toPx(p.x, p.z);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const [x, y] = toPx(g.x, g.z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, g.elevated ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (g.elevated) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(29,34,39,0.6)';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillText(`${Math.round(2 * half)} m`, 6, VIEW - 6);
}

function clampUnit(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
