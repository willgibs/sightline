// Bucket-queue (Dial) Dijkstra over a grid with integer edge costs: 10 orthogonal, 14 diagonal.
// Blocks-sound cells are impassable (sound goes around). Measures full and bounded floods.
function makeGrid(nx, nz, wallFrac, seed) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new Uint8Array(nx * nz);
  // rectangular 'buildings' with a door gap, to look like a camp
  const nb = Math.floor(nx * nz * wallFrac / 4000);
  for (let b = 0; b < nb; b++) {
    const w = 8 + Math.floor(rnd() * 20), h = 8 + Math.floor(rnd() * 20);
    const x0 = Math.floor(rnd() * (nx - w)), z0 = Math.floor(rnd() * (nz - h));
    for (let x = x0; x < x0 + w; x++) { g[z0 * nx + x] = 1; g[(z0 + h - 1) * nx + x] = 1; }
    for (let z = z0; z < z0 + h; z++) { g[z * nx + x0] = 1; g[z * nx + x0 + w - 1] = 1; }
    const dx = x0 + Math.floor(w / 2); g[z0 * nx + dx] = 0; g[z0 * nx + dx + 1] = 0; // door
  }
  return g;
}
function flood(g, nx, nz, src, maxCost, dist, buckets) {
  dist.fill(0x7fffffff);
  const NB = 15; // costs up to 14 per step: circular bucket array of 15 lists
  for (let i = 0; i < NB; i++) buckets[i].length = 0;
  dist[src] = 0; buckets[0].push(src);
  let cur = 0, pending = 1, visited = 0;
  const off = [[1,0,10],[-1,0,10],[0,1,10],[0,-1,10],[1,1,14],[1,-1,14],[-1,1,14],[-1,-1,14]];
  while (pending > 0) {
    const b = buckets[cur % NB];
    while (b.length) {
      const c = b.pop(); pending--;
      if (dist[c] !== cur) continue;
      visited++;
      const x = c % nx, z = (c / nx) | 0;
      for (let k = 0; k < 8; k++) {
        const x2 = x + off[k][0], z2 = z + off[k][1];
        if (x2 < 0 || z2 < 0 || x2 >= nx || z2 >= nz) continue;
        const n = z2 * nx + x2;
        if (g[n]) continue;
        if (k >= 4 && (g[z * nx + x2] || g[z2 * nx + x])) continue; // no corner cutting
        const nd = cur + off[k][2];
        if (nd > maxCost || nd >= dist[n]) continue;
        dist[n] = nd; buckets[nd % NB].push(n); pending++;
      }
    }
    cur++;
  }
  return visited;
}
for (const [nx, nz, label] of [[300, 300, 'site 150 m @0.5 m'], [512, 512, 'map 1.28 km @2.5 m']]) {
  const g = makeGrid(nx, nz, 0.15, 7);
  const dist = new Int32Array(nx * nz);
  const buckets = Array.from({ length: 15 }, () => []);
  let src = (nz >> 1) * nx + (nx >> 1); while (g[src]) src++;
  for (const [maxCost, what] of [[0x7ffffff0, 'full'], [420, 'r=21 m footstep'], [1400, 'r=70 m']]) {
    if (nx === 512 && what !== 'full') continue;
    for (let w = 0; w < 5; w++) flood(g, nx, nz, src, maxCost, dist, buckets);
    const N = 30; const t0 = performance.now(); let v = 0;
    for (let i = 0; i < N; i++) v = flood(g, nx, nz, src, maxCost, dist, buckets);
    const ms = (performance.now() - t0) / N;
    console.log(`${label} ${what}: visited ${v} cells, ${ms.toFixed(3)} ms per flood`);
  }
}
