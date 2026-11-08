# Rendering and performance for a browser first-person stealth-sniper game

Scope: practical guidance for Sightline's renderer (three.js 0.186.1 on WebGL 2, flat-shaded grey geometry with edge lines, exp² fog, a 1,280 m heightfield at 2.5 m spacing plus a 6.4 km backdrop, 66–134 draw calls, 60 fps on a mid-range laptop at 1080p with up to 16 guards). "Fit" lines are my inferences and sit under Inferences. Facts about Sightline itself come from the repository at commit 571304e (paths given in backticks). Facts about three.js marked "local source" were read from the installed `node_modules/three` (0.186.1); the links point to the matching files on GitHub. The shared web-search budget ran out partway through this research. Gaps that more searching could close say so.

## 1. Shadows that match the simulation's shade test, and how stealth games keep drawn light consistent with AI light

### Takeaway
No standard shadow technique reproduces a point raycast exactly. Shadow maps quantize depth per texel and need bias. CSM adds camera-dependent cascades. Baked shade is exact only at its sample points. Stealth games that stayed honest either share one definition of "lit" between the renderer and the AI (Thief's intent, The Dark Mod's shared flag), or make light binary and draw it plainly (Mark of the Ninja). For Sightline, the strongest pattern is a single source of truth, the same pattern as rule 7's single set of triangles:
- Draw each body's lit or shade state from the simulation's own verdict.
- Draw world shade from a static, sun-fixed shadow map rendered once. It never shimmers and costs almost nothing per frame.
- Measure how far that map agrees with `lightAt` in a test.

If ground shade must also agree exactly, the simulation and the renderer should read the same simulation-built light-space grid. One trap matters more than texel size: the simulation tests light at chest height, but drawn ground shade shows it at the feet.

### Cited Findings
- **Shadow acne.** Acne occurs "when the shadow map quantizes the depth over an entire texel", so a surface "is as likely to be self-shadowed as it is to be unshadowed". The fixes are near and far planes "calculated as tightly as possible", plus a slope-scaled depth bias. Too much offset causes "Peter Panning": shadows detach and objects appear to float. — [Microsoft, Common Techniques to Improve Shadow Depth Maps (2018, updated 2025)](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/common-techniques-to-improve-shadow-depth-maps)
- **Shimmering edges.** Shadow-map edges shimmer "as the camera moves", because the light projection is recalculated every time the camera moves. The fix for directional lights is to "round the minimum/maximum value in X and Y … to pixel size increments", using a world-units-per-texel step and a shadow map 1 px larger than needed. Keeping the light's projection the same size every frame makes snapping work. Clipping the frustum to the scene AABB is "not advised in all cases", because it changes the projection size from frame to frame. — [Microsoft (same)](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/common-techniques-to-improve-shadow-depth-maps)
- **Perspective aliasing.** Cascaded shadow maps (CSM) are "the most popular technique for dealing with perspective aliasing". Too high a resolution can stop thin objects casting shadows and can cause "severe performance issues because of texture access patterns". Narrow objects such as walls "should have backs even if they are never visible". Back faces are "impractical" for sprite foliage. — [Microsoft (same)](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/common-techniques-to-improve-shadow-depth-maps)
- **three.js `LightShadow` defaults** are `mapSize` 512×512 (powers of two), `bias` 0, `normalBias` 0 and `radius` 1. The docs say:
  - On `bias`: "Very tiny adjustments here (in the order of 0.0001) may help reduce artifacts".
  - On `normalBias`: it reduces acne "especially in large scenes where light shines onto geometry at a shallow angle. The cost is that shadows may appear distorted."
  - On static shadows: `autoUpdate = false` plus `needsUpdate = true` renders a shadow once, "If you do not require dynamic lighting / shadows". — [three.js docs, LightShadow](https://threejs.org/docs/pages/LightShadow.html)
- **Renderer-wide switch.** `WebGLShadowMap` also has renderer-wide `autoUpdate` and `needsUpdate` flags. It skips the whole shadow pass when `autoUpdate === false && needsUpdate === false` (local source, r186). — [three.js WebGLShadowMap.js](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLShadowMap.js)
- **three.js CSM addon (`three/addons/csm/CSM.js`).**
  - It is WebGLRenderer-only.
  - Defaults: `cascades` 3, `maxFar` 100000, `mode` 'practical' (also uniform, logarithmic, custom), `shadowMapSize` 2048, `lightMargin` 200, `shadowBias` 0.000001, `fade` false.
  - `setupMaterial()` must be called on every receiving material, `update()` every frame, and `updateFrustums()` when the camera changes. — [three.js docs, CSM](https://threejs.org/docs/pages/CSM.html)
- **CSM internals.** In r186, `CSM.update()` snaps each cascade's centre to texel increments (`Math.floor(_center.x / texelWidth) * texelWidth`). `setupMaterial` works by patching `material.onBeforeCompile` (local source, lines 378–396 and 443). — [three.js CSM.js](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/csm/CSM.js)
- **CSMShadowNode** is the WebGPURenderer-only equivalent: 3 cascades and `maxFar` 200 by default, and it must be rebuilt when camera or CSM settings change. — [three.js docs, CSMShadowNode](https://threejs.org/docs/pages/CSMShadowNode.html) (via search excerpt)
- **Thief: The Dark Project (1998).** Sean Barrett recalls two approaches. At one point objects were "raycasted to all (or the top N) light sources". The team also "considered using" the lightmap value at the floor for the player's visibility, "to avoid players being tricked/confused by places that appeared to casual inspection to being in shadow". He does not say which shipped. — [Barrett, The 3D Software Rendering Technology of 1998's Thief](https://nothings.org/gamedev/thief_rendering.html)
- **The Dark Mod (2015).** "The lightgem calculation is done by the renderer / GPU", while AI visibility of other things "is calculated in a different way". After a forum vote, the team made a light's exclusion from the gem and from AI sight a single flag (`ai_see`, read through `IsSeenByAI()`), so the renderer and the AI cannot disagree about that light. — [The Dark Mod bug 4128](https://bugs.thedarkmod.com/view.php?id=4128)
- **The Dark Mod, unverified reports.** Developers reportedly said the rendered light gem "would cut FPS in half (or less)", and that AI used a simplified light estimate for non-player objects, with light volumes treated as cubes or pyramids with exponential falloff. These come from a search-result excerpt and were not verified by fetching. — [The Dark Mod news posts](https://www.thedarkmod.com/posts/author/nbohr1more); [inkl coverage](https://inkl.com/news/after-16-years-the-dark-mod-finally-has-guards-as-perceptive-as-in-thief-the-days-of-seeing-knocked-out-ai-in-the-middle-of-a-bright-spotlight-get-ignored-are-over)
- **Splinter Cell (2002)** showed a HUD light meter reflecting how visible Sam Fisher was to enemies. Players could shoot out lights to reduce exposure. — [Wikipedia, Splinter Cell](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell_(video_game))
- **Clint Hocking, 2026 (opinion).** The Chaos Theory director argues that modern lighting direction and ambient occlusion reduce contrast and make it hard to tell safe from exposed. He contrasts this with older baked lighting, which was clean and easy to read. This is from secondary coverage; the PC Gamer article could not be read in full. — [gamedev.net](https://gamedev.net/news/3499-splinter-cell-designer-says-modern-lighting-has-made-stealth-games-harder-to/); [FRVR](https://frvr.com/blog/news/splinter-cell-designer-says-one-of-the-difficulties-with-modern-stealth-games-is-realistic-lighting/); [PC Gamer headline](https://pcgamer.com/games/sim/the-director-of-the-best-splinter-cell-game-reckons-that-modern-lighting-engines-are-making-stealth-games-so-much-harder-to-read/)
- **Mark of the Ninja (2012).** "light and darkness are totally binary". A hidden player is drawn "in black with red highlights", a visible one "fully colored". Guards' vision limits and sound ranges are drawn on screen. "Transparent Stealth System" is rule 1 of Nels Anderson's five. — [Game Developer, Mark of the Ninja's five stealth design rules (Dec 3, 2012)](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules)
- **Hunt: Showdown (2018).** Lighting could look good facing one way and poor facing the other because of the sun's position. The artists had to cover "walking towards the sun, walking away from the sun, in the dense forest, in an open field". — [Crytek, Creating a new time of day for Hunt (Nov 20, 2018)](https://www.huntshowdown.com/news/creating-a-new-time-of-day-for-hunt-showdown)

### Inferences
- **What the simulation tests.** `lightAt` (`src/sim/env.ts`) is binary: lit (1.0) or shade (0.6). It casts one ray toward the sun from one point, against terrain (3,000 m reach) and against every solid that blocks sight. The default sun stands 35° up in the south-west. The player is tested at `y + eyeHeight × 0.75`, about 1.24 m when standing (`src/app/game.ts:910`).
- **The feet-versus-chest trap.** It is a bigger mismatch than any texel or bias error.
  - A point at height h stays lit while the ground beneath it is already in shade, across a band h / tan(sun elevation) wide.
  - Behind a wall of height H, the ground shadow reaches H/tan35° but chest-height shade only reaches (H − h)/tan35°.
  - Band widths: standing (h ≈ 1.24 m) 1.8 m; crouched (≈ 0.79 m) 1.1 m; prone (≈ 0.24 m) 0.34 m.
  - A player who sees his feet in drawn shade is "lit" to guards for the outer 1.8 m of the shadow.
  - Choose deliberately, as a lab A decision for the owner:
    - test at the feet, or test several body points;
    - or tell the player through a light indicator driven by `lightAt` itself, like the Thief or Splinter Cell gem, which is exact by construction;
    - or accept the band and show it in the debug view.
- **Fit, per-body verdict from the simulation.** Put each body's `lightAt` result in the snapshot and shade the whole body by it. Drawn equals simulated by construction. Cost is zero (one uniform per body). It fits rule 14. It looks wrong only for a body straddling a shadow edge, which is drawn all-lit or all-shaded. That is a taste call; it is honest about the decision the AI makes.
- **Fit, static world shadow map rendered once.**
  - The sun is fixed for the core mission and the world is static. One directional shadow map fitted to the 1,280 m square, rendered once (`shadowMap.autoUpdate = false`, `needsUpdate = true` at load), costs no per-frame shadow pass and cannot shimmer. That honours "the renderer never adds motion".
  - **Resolution.** Seen from a south-west sun, the square spans about 1,810 m across (its diagonal). 4096² gives about 0.44 m per texel across the sun and about 0.5 m along it on the ground; 2048² gives about 0.9–1.0 m. MDN treats 4096 as the universally safe `MAX_TEXTURE_SIZE` (Section 8).
  - **Memory.** About 67 MB of depth at 4096², about 17 MB at 2048².
  - **Boundary error.** About one texel plus bias, roughly 0.3–0.6 m against the simulation's exact ray. At 300 m that is 1–2 px unzoomed and 7–14 px zoomed.
  - **The catch.** Sightline's terrain and solids use custom `ShaderMaterial`s (`src/render/terrainMaterial.ts`, `src/render/materials.ts`), so the shadow lookup must be written into those shaders by hand.
  - **Guards.** Moving guards would need either their own small dynamic map or the per-body verdict above.
- **Fit, CSM (three-csm or the addon). Poor.**
  - It exists to spread resolution near a moving camera. Each cascade re-renders casters every frame: 3 cascades means about 3 extra scene passes, roughly doubling to quadrupling Sightline's 66–134 draw calls.
  - Cascade bounds move with the camera. Snapping stops shimmer, but resolution still changes where cascades meet.
  - The addon patches built-in materials through `onBeforeCompile`, which Sightline's custom shaders don't use.
  - It is worth it only if Phase 3's moving sun arrives and a static map can no longer be rebuilt cheaply.
- **Fit, shade baked per vertex or texel from the simulation's own raycasts.**
  - It is exact at the samples. Per vertex on the 513² grid that is about 263k rays at generation time.
  - Between samples it is either interpolated, which smears edges over 2.5 m, or flat per facet. Facet shading suits the flat-shaded look, but its error can reach a cell diagonal, about 3.5 m.
  - It answers only for ground-level points, so the feet-versus-chest trap remains.
  - It needs a re-bake whenever the sun moves (Phase 3).
- **Fit, a shared light-space grid. The only route to exact ground agreement.**
  - At generation the simulation builds a deterministic light-space depth grid with its own raycasts: iteration-budgeted, its own RNG fork, stored as plain data (rules 3, 9 and 18). It then answers shade by comparing a point's light-space depth with that grid, using nearest-texel lookup and a fixed bias.
  - The renderer uploads the same grid as its shadow texture and runs the same comparison. Equality holds except where float rounding between JS and GLSL flips an exact boundary texel.
  - This is a behaviour change: bump `SIM_VERSION` and move the selftest fingerprints (rule 11). It is a lab A decision.
- **Fit, ray-marching the heightfield toward the sun in the fragment shader.** This is exact for the terrain if it walks the same diagonal split (rule 7). Naively it can take hundreds of steps per pixel at 2.5 m cells over 3,000 m. It needs a max-height pyramid to be affordable, and it still misses colliders. It is not worth it next to the options above.
- **Done-when test (rule 8).** Sample random walkable points at feet and chest heights. Compare `lightAt` with the renderer's shade lookup through a GPU readback in `test:browser`. Require, say, at least 99.5% agreement, with every disagreement within one texel of a shadow edge. Add a debug overlay that draws the simulation's shade samples as dots over the drawn shade.

### Gaps
- No primary source on how Splinter Cell, Chaos Theory or Blacklist actually computed the light meter (rendered readback or raycasts to lights), or how they kept it consistent with drawn shadows. The search budget ran out before a GDC or postmortem search.
- No published measurements of how often shadow-map shade agrees with a ray test, as a function of resolution and bias. This would need a project test.
- It is unclear whether guards' bodies count as sun blockers in `solids.raycast(..., Blocks.Sight)`. If they do, drawn shade from bodies needs a dynamic shadow pass. Check with lab A.
- No measured cost of 4096² PCF lookups on a mid-range laptop iGPU.

## 2. Terrain level of detail (geomipmapping, CDLOD, geometry clipmaps)

### Takeaway
The classic schemes all trade drawn terrain away from true terrain to save triangles, and some animate the surface as the camera moves. CDLOD and clipmaps geomorph; geomipmapping pops. Sightline's playable heightfield is only about 524k triangles at full resolution. Zoom takes the needed screen-space density back to full resolution across the whole 1,280 m area. Rule 7 forbids rendering different triangles from those physics and raycasts use. So: keep the playable terrain at full resolution with no LOD, and apply LOD, if at all, only to the 6.4 km backdrop. Select LOD by projected size, including the field of view, never by distance alone.

### Cited Findings
- **CDLOD (Strugar; paper 2010, DOI in a 2009 volume).** It is "structured around a quadtree of regular grids". It "draws the terrain directly from the source heightmap data". LOD comes from 3D distance between observer and terrain, uniform across the mesh. A transition technique means it needs no stitching between meshes. It targets Shader Model 3.0 and up. — [fstrugar/CDLOD README](https://github.com/fstrugar/CDLOD)
- **GPU geometry clipmaps, design** (Asirvatham and Hoppe, GPU Gems 2):
  - n = 255 vertices per level, n odd (2^k − 1); L = 11 levels in the main test.
  - Transition width w = n/10, with a linear blend parameter. The vertex shader morphs elevation between the fine and coarse levels, and normals blend with the same alpha.
  - Each ring is 12 blocks of m×m vertices, with m = (n+1)/4 = 64; about 4 of 12 blocks are drawn per level after CPU frustum culling.
  - The goal is triangles "uniformly sized in screen space": about 5 px wide at n = 255 in a 1024×768 window. — [GPU Gems 2, ch. 2](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
- **GPU geometry clipmaps, numbers** (same chapter):
  - Draw calls average 6L + 5, so 71 for L = 11, reducible to 3L + 2 = 35 with instancing.
  - About 60 million triangles/s at 130 fps on a GeForce 6800 GT. Culling cut load 2–3× for a 90° field of view.
  - Vertex texture fetch was a bottleneck: removing it raised 130 fps to 185.
  - Levels are deactivated when their extent is under 2.5 × viewer height.
  - A 216,000 × 93,600 heightmap at 30 m spacing compresses to 355 MB. — [GPU Gems 2, ch. 2](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
- **Original geometry clipmaps (Losasso and Hoppe, SIGGRAPH 2004):** nested regular grids, interactive flight at about 60 fps (search excerpt). — [Hoppe, Geometry clipmaps](https://hhoppe.com/proj/geomclipmap/)
- **Arma 3's terrain grid.** A higher grid number "means less vertices are used for terrain rendering, making distant hills less smooth". Supported values run from 50 to 3.125. — [Bohemia wiki, setTerrainGrid](https://community.bistudio.com/wiki/setTerrainGrid) (via search excerpt)
- **three.js `LOD.update()` divides camera distance by `camera.zoom` only.** A change of `fov` doesn't change which level is chosen. `PerspectiveCamera` applies `zoom` by dividing the projection's `top` (`near * tan(fov/2) / zoom`). Both are local source. — [three.js LOD.js](https://github.com/mrdoob/three.js/blob/r186/src/objects/LOD.js); [PerspectiveCamera.js](https://github.com/mrdoob/three.js/blob/r186/src/cameras/PerspectiveCamera.js)

### Inferences
- **Sightline's triangle numbers.**
  - 513 × 513 vertices is 512² × 2 = 524,288 triangles at full resolution, 32,768 per tile in the 4 × 4 split.
  - The current 0.4–0.5 M triangles at 120 fps on an M3 Max says triangles are not the limit. My opinion: fill rate, overdraw and shadow passes will bind a mid-range laptop before 0.5 M terrain triangles do.
- **Screen density.** With a vertical field of view of 58° at 1080p (about 974 px/rad at screen centre), a 2.5 m cell subtends about 4.9 px at 500 m and 2.4 px at 1 km. At the 9° zoom (about 6,860 px/rad, about 7× magnification) it is about 17 px at 1 km and about 9.5 px at the far corner (about 1.8 km). Against the clipmap target of about 5 px triangles, zoomed views want full resolution everywhere inside the playable area.
- **Fit, CDLOD and clipmaps inside the playable area. Not allowed.**
  - Geomorphing moves drawn vertices as the camera moves. That is motion the renderer adds, it puts drawn feet above or below the simulated ground, and it shifts contour lines.
  - It breaks rule 7 (one set of terrain triangles for physics, raycasts and rendering).
- **Fit, geomipmapping per tile.** It pops instead of morphing; it is acceptable only beyond the playable edge.
- **Fit, the backdrop.** It is the one legitimate LOD target: nothing simulated stands there.
  - Under Sightline's fog it is more than 99.7% fogged beyond 2 km (Section 4), so most of it reads only as a ridgeline silhouette.
  - A coarse fixed mesh, with skirts where it meets the playable tiles, is enough. Spend its triangles on the skyline profile, not on the interior.
- **Fit, LOD selection.** Sightline zooms by changing `cam.fov` (`src/render/renderer.ts:176-177`), so a stock `THREE.LOD` would show coarse levels exactly when the player looks through the zoom.
  - Either zoom through `camera.zoom`, or select LOD by projected size: distance × tan(fov/2) ÷ (screen height / 2).
  - Add hysteresis, which `THREE.LOD` supports, so swaps don't flicker.
- **Depth precision at range.** The camera uses near 0.08 m and far 7,000 m (`src/render/renderer.ts:66`). Assuming the usual 24-bit depth, the depth step is about z² / (near × 2²⁴): about 7 cm at 300 m, 0.75 m at 1 km and 30 m at 6.4 km.
  - Edge lines, contour lines and coplanar meshes at range will z-fight. That is renderer-made flicker, which reads as motion.
  - Fixes: raise the near plane (the step scales with 1/near); draw the backdrop in its own pass with its own depth range; or use three.js's `reversedDepthBuffer` (r186 constructor option, needs `EXT_clip_control`).
  - Per NVIDIA, reversed-Z helps only with a floating-point depth buffer: "Reversed-Z with an integer depth buffer is as good as any of the other integer options". `EXT_clip_control` is on about 92% of WebGL 2 reports, but Firefox only about 51%. — [NVIDIA, Depth Precision Visualized](https://developer.nvidia.com/content/depth-precision-visualized); [web3dsurvey, EXT_clip_control](https://web3dsurvey.com/webgl2/extensions/EXT_clip_control); [three.js WebGLRenderer.js](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js)

### Gaps
- Could not extract CDLOD's numeric parameters (morph ratios, node sizes, benchmark figures) from the paper PDF; its fonts don't decode to text.
- No published terrain-LOD numbers from shipped browser games were found.
- Whether three.js's reversed depth path allocates a float depth attachment, which is what makes reversed-Z pay off, was not confirmed from source.

## 3. Vegetation at range: impostors, instancing, culling and draw-call budgets

### Takeaway
Browser demos run hundreds of thousands to a million trees with instancing, per-instance BVH culling and octahedral impostors. Sightline's flat-shaded low-poly vegetation sits far below that complexity, so impostors buy little. They also fight two rules: drawn equals simulated (impostors' silhouettes and view-dependent frame swaps don't match sight-blocking colliders), and no renderer-added motion. The gains that matter are:
- culling granularity: InstancedMesh culls as one whole sphere;
- front-to-back order against overdraw;
- never letting vegetation LOD remove an occluder the simulation still counts. PUBG's early builds showed the unfairness that causes.

### Cited Findings
- **agargaro, three.js forest demo (Aug 2025):**
  - 200k trees with InstancedMesh2 and a BVH for frustum culling, on a 3072 × 3072 terrain using BatchedMesh with meshoptimizer LODs.
  - Tree LOD bands: full model to about 15 units, simplified 15–100, octahedral impostor beyond 100.
  - Impostor: hemi-octahedron, 16 sprites per side in a 2048 atlas, alphaClamp 0.45.
  - Usnul reported that fitting sprites to a convex hull cut about 30% of pixels (overdraw). Popping is avoided when the swap happens once the impostor covers no more screen than its bake resolution. Crossfading costs two draws. — [three.js forum, A forest of octahedral impostors](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
- **Cinevva, browser open-world series (May 2026):**
  - A distant tree of about 2,000 triangles becomes one quad, with about 1 MB of texture.
  - A 12 × 12 hemi-octahedral atlas is about 9 MB, against 1.6 MB for an azimuth/elevation atlas, and takes about 5× longer to bake (288 render passes).
  - Use an odd grid N so a row sits at 0° elevation. Bilinear blending across cells costs 8 taps and removes popping where tiles swap.
  - Set an explicit bounding sphere, or three.js culls the whole forest when the camera looks away from the origin. The GPU-driven forest targets one million trees. — [Cinevva, Open world in the browser, part 19: imposters](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)
- **three.js `InstancedMesh`** is for "a large number of objects with the same geometry and material(s) but with different world transformations" to "reduce the number of draw calls". Its frustum culling uses "The bounding sphere of the instanced mesh", which you may need to recompute after `setMatrixAt`. — [three.js docs, InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- **Per-instance culling** is not built in for InstancedMesh (forum excerpt). The third-party InstancedMesh2 adds per-instance culling, a BVH, visibility and LOD. — [three.js forum, per-instance frustum culling](https://discourse.threejs.org/t/ideas-on-performing-fast-per-instance-frustum-culling-on-instancedmesh/85156); [@three.ez/instanced-mesh](https://www.npmjs.com/package/@three.ez/instanced-mesh) (via search excerpt)
- **three.js `BatchedMesh`** is for "objects with the same material but with different geometries or world transformations".
  - `perObjectFrustumCulled` (default true) frustum-culls the individual objects.
  - `sortObjects` (default true) draws opaque objects front to back and transparent ones back to front.
  - Limits: every geometry must match the first one's attribute layout, negatively scaled matrices are not supported, and bounding volumes must be computed explicitly. — [three.js docs, BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html)
- **Batching.** "If you have 1000 sprites to paint, try to do it as a single drawArrays() or drawElements() call." Drawing from static VAOs is faster than mutating one per draw. Texture atlases avoid splitting batches. — [MDN, WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **Per-object CPU cost.** A 2026 forum measurement drew 4,000 meshes (about 8 M triangles) with WebGLRenderer in 4.5 ms of CPU per frame (RTX 4090 laptop, Chrome 148, r183). — [three.js forum, May 2026](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)
- **PUBG fairness (Nov 2017).** In early builds shadows didn't render at some distances and some foliage disappeared on low settings, so players kept settings low to spot others. A shadow-caching change rendered shadows to 450 m even on Low. Brendan Greene: "there's no difference in Low or High shadows anymore". He wants parity "between Low and High settings". — [Player.One interview, Nov 7, 2017](https://www.player.one/playerunknown-interview-parity-low-high-graphics-battlegrounds-121445)

### Inferences
- **Fit, octahedral impostors. Low value, real risk.**
  - Sightline's trees are a canopy and a trunk drawn as two InstancedMeshes (`src/render/worldMeshes.ts:196-197`), likely tens to hundreds of triangles each. An impostor saves little geometry.
  - The impostor's alpha silhouette won't match the sight-blocking collider the guards and the player's shots use.
  - Frame swaps as the camera moves are renderer-made change in exactly the far field where guards must read by motion.
  - Keep real low-poly meshes out to the edge of the shooting range (500 m). If needed at all, use impostors only beyond it.
- **Fit, culling granularity.** One InstancedMesh per vegetation type across 1,280 m culls as one sphere: it draws everything or nothing.
  - Split instances per terrain tile (4 × 4 → 16 per type). Whole tiles behind the camera then cull, and the narrow zoom or a scope view culls most of them.
  - Alternatively, BatchedMesh with `perObjectFrustumCulled` and front-to-back `sortObjects` cuts overdraw. Overdraw is likely the bigger cost for canopy-heavy views on an iGPU; that is my opinion, not measured.
- **Fit, draw-call budget.** At about 1 µs of CPU per mesh on a fast laptop (4.5 ms ÷ 4,000), and perhaps 2–4× that on a mid-range one (my assumption), 134 draws cost well under 1 ms. Draw calls are not Sightline's constraint. Shadow passes and a picture-in-picture scope multiply them (Sections 1 and 6).
- **Fit, LOD must never thin occluders.** Any distance-based thinning of vegetation (bushes, canopies) must keep everything the simulation counts as `Blocks.Sight` inside the engagement range. Otherwise the honest view shows clear sightlines that the simulation blocks, or the reverse. Settings may change resolution and antialiasing, never what occludes. That is PUBG's lesson.
- **Fit, shadows from foliage.** Static vegetation goes into the once-rendered shadow map (Section 1) at no per-frame cost. Canopy cards without back faces will drop shadows (Microsoft), and the closed low-poly volumes Sightline uses avoid that.

### Gaps
- No authoritative draw-call or triangle budget for mid-range laptop iGPUs in WebGL 2 was found. Measure on target hardware.
- No numbers from shipped commercial browser shooters (for example Krunker or Venge) were found before the search budget ran out.

## 4. Fog and atmospheric perspective for readability

### Takeaway
Fog is the main readability lever at 100–500 m. Real haze cuts contrast as e^(−βd) (Koschmieder). Sightline's exp² curve deliberately keeps 300 m guards crisp (about 12% fog) while still hiding the map edge (about 98% by 1.65 km). Physical exp fog with the same far limit would wash 300 m out by about 51%. Two cheap upgrades:
- compute fog on radial distance, not view depth, so panning doesn't change a fixed guard's contrast;
- move from one colour to a Firewatch-style gradient: layered distance colour from a 1D ramp, a height term and sun tint, computed in-material so MSAA and transparents still work.

### Cited Findings
- **Koschmieder's law.** Apparent contrast falls as C = C₀·e^(−βd). With a 2% contrast threshold, meteorological visibility is V = ln(1/0.02)/β = 3.912/β. The model assumes homogeneous illumination and a constant extinction coefficient. — [Wikipedia, Visibility](https://en.wikipedia.org/wiki/Visibility) (via search excerpt)
- **three.js exp² fog.** `FogExp2` computes `fogFactor = 1 − exp(−density² · vFogDepth²)` and mixes towards `fogColor`. `vFogDepth = −mvPosition.z` is view-space depth, not radial distance (local source). — [three.js fog_fragment.glsl.js](https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js); [fog_vertex.glsl.js](https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/fog_vertex.glsl.js)
- **TF2 (2007).** "Abstraction at distance is an important property of many NPR systems". TF2 relied on "depth fogging", normal-map minification and broadened specular at distance. It deliberately avoided image-space outlining, so it had no varying line weights to handle. — [Mitchell, Francke and Eng, Illustrative Rendering in Team Fortress 2](https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf)
- **Firewatch (GDC 2015, Jane Ng).** The talk described bold colours in very distinct layers, each adding depth and distance (secondary summary). Campo Santo's sky shader used a three-colour gradient (top, half, bottom) with separate sun disc, sun halo and horizon halo controls; it was called a big simplification of the physics. — [Thumbsticks, GDC 2015: The Art of Firewatch](https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch); [GDC Vault, The Art of Firewatch](https://gdcvault.com/play/1022296/The-Art-of); [Campo Santo blog, sky shader](https://blog.camposanto.com/post/112703721804/this-blog-post-is-an-in-detail-explanation-of-a) (via search excerpts)
- **Firewatch-style fog, community reconstruction (2018).** It is a post-process that, "for each sample", fetches "the fog color from a gradient texture"; the gradients were copied from the GDC talk. It "needs the depth buffer", so the author advises against MSAA, and transparent objects are not fogged. — [grrava, Stylistic fog from Firewatch with Unity's PostFX v2](https://grrava.blogspot.com/2018/08/stylistic-fog-from-firewatch-with.html)
- **Separate gradients.** A Unity fog-gradient asset uses separate distance and height gradients blended in a lookup texture. — [Corgi Fog Gradient for URP](https://discussions.unity.com/t/released-corgi-fog-gradient-distance-gradient-fog-for-urp/874399) (via search excerpt)
- **Sun-tinted fog.** Fog colour can show where the sun is, shifting from bluish to yellowish as the view direction lines up with the sun, and can vary with altitude. Height fog has an analytic form, an exponential height term combined with distance divided by the ray's vertical component. — [Inigo Quilez, Better fog](https://iquilezles.org/articles/fog/) (via search excerpt; fetching the page returned 404)

### Inferences
- **Sightline's fog curve.** With `fogDensity` 0.0012 (`src/config/tuning.ts:175`):

  | Distance | Fog |
  | --- | --- |
  | 100 m | 1.4% |
  | 300 m | 12.2% |
  | 500 m | 30.2% |
  | 1 km | 76.3% |
  | 1.28 km | 90.5% |
  | 1.65 km | 98% (the Koschmieder-equivalent 2% contrast point, V ≈ 1.65 km) |
  | 2 km | 99.7% |

  Physical exp fog with the same V (β = 3.912/1,648 m ≈ 0.00237/m) would be 51% at 300 m and 69% at 500 m. My opinion: keep the exp² shape or something steeper. It is a readability stylization that favours the engagement band.
- **Fit, radial versus depth fog.**
  - At the horizontal edge of the 58° vertical field of view (about 89° horizontal at 16:9), view depth is about 0.71 × distance. A guard at 500 m is fogged 30% at screen centre but about 17% at the screen edge, so turning the head changes his contrast. That is a renderer-made change on something that can be seen.
  - Zoomed (about 16° horizontal) the difference is under 1%.
  - Fix: replace the fog chunk so fog uses `length(mvPosition.xyz)`. It is a small edit inside Sightline's own `ShaderMaterial`s.
- **Fit, gradient fog in-material, not post-process.**
  - Do it in-material: a 1D colour ramp indexed by radial distance, plus a height term (thicker in valleys) and a sun-direction tint. That keeps `antialias: true` MSAA (`src/render/renderer.ts:63`) and fogs edge lines and transparents consistently, unlike the post-process version.
  - Make it a pure function of camera position and world point, with no time variation, so it adds no motion.
  - Fog parameters already live in tuning (rule 4). If lab A models haze in guards' vision, drive both from the same tuning curve, so drawn haze equals simulated haze.
- **Fit, the backdrop.** At more than 99.7% fog beyond 2 km, the 6.4 km backdrop is invisible apart from fog colour, unless it gets its own gentler fog curve. Decide whether distant ridgelines should read at all (Firewatch keeps layered silhouettes) and give the backdrop a separate density if so.

### Gaps
- Jane Ng's actual fog parameters, and whether Firewatch's in-engine fog was distance-gradient or height-based, were not confirmed from a primary source. The talk video was not reviewed.
- The full analytic height-fog formula from Inigo Quilez's article was not retrieved (404 on fetch).

## 5. Keeping guards readable at 300 m: silhouettes, rim light, contrast, and what Hunt, Battlefield and PUBG did

### Takeaway
At 300 m, unzoomed at 1080p, a standing guard is about 6 px tall and 2 px wide: right at the Johnson-criteria detection threshold, so motion and contrast carry the read. Zoomed, he reaches about 42 × 14 px, around the identification threshold. Shipped games keep enemies readable through:
- consistent value contrast;
- character lighting that holds in dark and bright areas (BFV's 2019 soldier-visibility system);
- rim terms (TF2);
- parity across settings (PUBG).

Each was controversial when it looked like glow. For Sightline: tune guard values against the terrain and forest palette, add a uniform up-facing rim term identical for every body, and stop edge lines swamping 6-px figures. Above all, add no renderer-made temporal noise in the far field: shimmer, popping, z-fighting, dithered LOD crossfades. It competes with the motion cue the design depends on.

### Cited Findings
- **TF2 silhouettes.** Players "must be able to visually identify other players very quickly at a variety of distances and viewpoints". The nine class silhouettes "were carefully designed to be very distinct". Silhouettes "are emphasized with rim highlights rather than dark outlines". — [Illustrative Rendering in Team Fortress 2 (2007)](https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf)
- **TF2 rim lighting.** It uses broad Phong-lobe rim highlights masked by a Fresnel term f_r, "typically just (1 − (n·v))⁴". A dedicated rim term evaluates the ambient cube along the view ray and multiplies by max(0, n·up), so it "appear[s] to add in indirect light from the environment, but only for upward facing normals". This exploits "the human instinct to assume that lighting tends to come from above". The paper's stated aim is that players "are consistently able to visually 'read' the scene and identify other players in a variety of lighting conditions". — [same paper](https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf)
- **Battlefield V (2019).** DICE's "new soldier visibility system" aimed for "more consistent visibility across all environmental situations", including very dark and very bright ones. It balances a "realistic soldier outline" with the art direction, and preserves uniform colours so dark or bright uniforms no longer give an unintended advantage. Camouflage that matches the map still matters. — [DICE Community Broadcast, Visibility Improvements (2019)](https://devtrackers.gg/battlefieldv/p/1567d988-community-broadcast-visibility-improvements)
- **Battlefield V update notes.** They describe a shader that makes third-person soldiers "a bit more visible when in dark areas", applied only to Multiplayer and Firestorm (search excerpt). — [EA, Trial by Fire Update 4 notes](https://ea.com/games/battlefield/news/trial-by-fire-update-4-notes-summary); [patch-note mirror](https://devtrackers.gg/battlefieldv/p/d063741f-battlefield-v-chapter-3-trial-by-fire-update-4-notes)
- **Battlefield V (Dec 2018).** Producer David Sirland called visibility "a key problem area and priority", while declining to bring back 3D spotting markers ("Doritos"). — [MP1st, Dec 20, 2018](https://mp1st.com/news/battlefield-5-enemy-visibility-being-addressed-cites-it-as-a-key-problem)
- **Battlefield 6 (Dec 2025).** A visibility update was contested by players on EA's forum. This is an anecdotal signal that readability aids can read as unnatural (search excerpt). — [EA Forums thread](https://forums.ea.com/discussions/battlefield-6-general-discussion-en/soldier-visibility-update-december-2025-we-players-dont-want/12987416)
- **Hunt: Showdown (2018).** "We wanted high contrast, easy readability, and for it to be bright, but with that bleak Hunt appeal"; "It shouldn't be too dull or dark." — [Crytek, Nov 20, 2018](https://www.huntshowdown.com/news/creating-a-new-time-of-day-for-hunt-showdown)
- **PUBG (2017).** Settings parity: shadows render to 450 m on Low, and Greene wants parity "between Low and High settings". — [Player.One, Nov 7, 2017](https://www.player.one/playerunknown-interview-parity-low-high-graphics-battlegrounds-121445)
- **Johnson's criteria (50% probability).** Required resolution across a target's critical dimension: detection 1.0 ± 0.25 line pairs, orientation 1.4 ± 0.35, recognition 4 ± 0.8, identification 6.4 ± 1.5. One line pair is about 2 pixels. — [Wikipedia, Johnson's criteria](https://en.wikipedia.org/wiki/Johnson%27s_criteria) (via search excerpt). Caveat: practitioners argue more than 2 px per line pair is needed in practice. — [Kintronics](https://kintronics.com/detection-recognition-identification-new-criteria/) (via search excerpt)
- **Clint Hocking (opinion).** Lighting direction and ambient occlusion lower the contrast that tells players where they are safe and where the enemies are. — [gamedev.net](https://gamedev.net/news/3499-splinter-cell-designer-says-modern-lighting-has-made-stealth-games-harder-to/)

### Inferences
- **Pixel budget.** Guard body is 1.85 m × 0.6 m (`src/config/tuning.ts:113-114`). Vertical field of view 58° at 1080p gives about 17 px/° at screen centre; zoom 9° gives about 7×.

  | Range | Unzoomed (h × w) | Zoomed (h × w) |
  | --- | --- | --- |
  | 100 m | about 18 px tall | – |
  | 300 m | 6.0 × 1.9 px | 42 × 14 px |
  | 500 m | 3.6 × 1.2 px | 25 × 8 px |

  - Against Johnson (2 px per line pair, critical dimension = width): unzoomed at 300 m a guard is at the detection threshold, about 1 line pair, so "silhouette and motion alone" is literally what the player gets.
  - Zoomed, he is around identification (about 6.4 line pairs ≈ 13 px).
  - Taste call: decide what the player must be able to tell at each range (a body, which way it faces, what it is doing) and check it against this table.
- **Fit, contrast first.** Choose guard albedo for a clear value step against the terrain and forest values, not hue alone; hue differences mostly vanish at 2 px.
  - Do it uniformly, as BFV did with uniforms, and keep it constant with distance. A distance-scaled boost is what reads as "glow".
  - The skyline matters: a guard against sky or fog is far more readable than against forest. That emerges from the scene and needs no aid.
- **Fit, rim light.** A TF2-style term costs a few ALU ops in the flat material and adds no motion:
  - Fresnel (1 − n·v)⁴ times max(0, n·up), tinted by the sky colour.
  - Apply it to every body identically (guards and, in third-person views, the player) so it isn't a guard-only highlight.
  - Flat shading has per-face normals, so the rim reads as lit top facets rather than a smooth halo. That suits the low-poly look.
- **Fit, edge lines at range.**
  - On a 6 × 2 px figure, 1 px edge lines are most of the figure's pixels and crawl with sub-pixel motion. Plain WebGL lines are effectively 1 px wide on most platforms; that is general knowledge, not sourced here. TF2 avoided outlines to sidestep line-weight problems.
  - Options: fade line alpha with projected size; keep only silhouette lines on bodies at range; or accept that lines dominate distant figures and tune them as the readability device. That is an owner taste call in the wireframe look.
- **Fit, temporal noise. The main risk to motion-based reads.** Every renderer-made change in the far field looks like movement at 2 px:
  - shadow shimmer: avoided by a static map, or texel snapping (Section 1);
  - z-fighting: depth precision (Section 2);
  - LOD pops and impostor swaps (Section 3);
  - depth-based fog changing with heading (Section 4);
  - edge aliasing crawl.
  - Keep MSAA. Avoid TAA-style jittered antialiasing, whose ghosting and jitter blur exactly this; that is my opinion, not sourced.
- **Fit, parity.** Quality settings (pixel ratio, MSAA) must not change what is drawn as occluder, shade or fog, following PUBG. Sightline's pixel-ratio cap (`src/app/game.ts:664`, at most 1.5) is a safe setting to vary.

### Gaps
- No primary-source technical detail on how Hunt: Showdown, PUBG or Battlefield shade distant characters: rim terms, distance-based exposure, the BFV shader's maths. Patch notes give intent, not maths. The search budget ran out before searching GDC talks such as Battlefield's character-visibility presentations.
- No playtest data linking pixel size to detection time for a game like this. Lab A's exit test (testers predict detection 80% of the time) is the place to measure it.

## 6. Scope rendering: field-of-view zoom versus picture-in-picture, and rendering sway

### Takeaway
Changing the field of view, as Sightline does now, costs nothing extra and keeps "a shot leaves from where the camera looks" trivially true. Picture-in-picture scopes re-render the scene through a second camera. Players of Escape from Tarkov and Insurgency: Sandstorm report large frame-rate costs (anecdotal). In three.js the narrow scope frustum saves little while vegetation sits in a few whole-sphere-culled InstancedMeshes. Recommendation: keep field-of-view zoom plus a 2D scope mask and reticle through Phases 1–2. Consider picture-in-picture only if the design wants peripheral vision while scoped. Any sway must be a pure simulation function, like `bob.ts`, applied to the camera, so the reticle and the shot never part.

### Cited Findings
- **Tarkov (2022), anecdotal.** A player in a February 2022 thread with Battlestate's COO said picture-in-picture scopes cost "30–40 FPS even on a high-end GPU". Another explained that the scope re-renders everything seen through it. This is player testimony, not a measurement. — [r/EscapefromTarkov thread (Feb 2022, via mirror)](https://www.reddit.com/r/EscapefromTarkov/comments/smm48z/hey_active_players/) (via search excerpt)
- **Insurgency: Sandstorm (2019), anecdotal.** Players reported a large frame-rate drop when aiming with picture-in-picture scopes, and poor scope image quality. They suggested rendering the periphery at lower quality. — [Steam discussion](https://steamcommunity.com/app/581320/discussions/0/1642038659009718862) (via search excerpt)
- **Roblox "dual render" experiment.** Rendering the scene once and updating the scope camera separately kept frame rates high; its author called it unsuitable for production. — [Roblox DevForum](https://devforum.roblox.com/t/dual-render-scope-system/226389) (via search excerpt)
- **Unreal plugin, vendor claim.** A plugin vendor says default picture-in-picture scope setups are often slow and claims much higher frame rates from an optimized scene capture. — [Unreal Marketplace, Advanced Scope and Thermals](https://www.unrealengine.com/marketplace/en-US/product/advanced-scope-and-thermals) (via search excerpt)
- **three.js LOD and zoom.** `LOD` divides distance by `camera.zoom`; `PerspectiveCamera.zoom` narrows the projection without touching `fov` (local source). — [LOD.js](https://github.com/mrdoob/three.js/blob/r186/src/objects/LOD.js); [PerspectiveCamera.js](https://github.com/mrdoob/three.js/blob/r186/src/cameras/PerspectiveCamera.js)
- **Instanced culling granularity.** InstancedMesh culls on one bounding sphere for all instances; BatchedMesh can cull per object. — [InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html); [BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html)

### Inferences
- **Fit, field-of-view zoom (current: 58° → 9° in 0.16 s, `src/config/tuning.ts:168-170`).**
  - No extra pass. The view is the aim, so rule 14 holds by construction.
  - Add a 2D mask (circular aperture, eye-relief vignette) and a reticle drawn in angular units from the current field of view, so mil-style ranging agrees with the simulation's geometry.
  - A mask that changes what can be seen must be a pure function of simulation state and time (for example the zoom fraction), not a free-running renderer animation.
- **Fit, picture-in-picture.**
  - Cost: a second scene render into a render target, about 66–134 more draw calls, the same instanced vegetation draws (whole-sphere culling) and terrain tiles in view.
  - With a static shadow map there is no extra shadow pass. A 512²–1024² scope target is cheap in fill.
  - Expect roughly a 1.6–2× CPU submit cost while scoped; this is my estimate, not measured. Per-tile instancing or BatchedMesh (Section 3) shrinks it.
  - Fit risks: a second view can disagree with the main view (LOD, fog depth). Its optical axis must be the simulation's aim line, so both must come from the snapshot.
- **Fit, sway.** If the rifle sways, model it as a pure function of simulation state and time in `src/sim`, like `src/sim/motor/bob.ts`. The renderer applies it to the camera, or to the reticle within the mask, and the shot uses the same function. The renderer may not add its own breathing or idle sway (rule 14 and the brief's no-own-motion rule).
- **Fit, LOD and fog under zoom.** Sightline's zoom changes `fov`, so stock `THREE.LOD` won't refine when zoomed: select by projected size (Section 2). Radial fog (Section 4) makes zoomed and unzoomed fog identical for the same guard.

### Gaps
- No independent measurement of picture-in-picture versus field-of-view zoom costs in a shipped game. No primary developer write-up from sniper-focused games (Sniper Elite, Sniper Ghost Warrior, Hunt) on their scope rendering was found before the search budget ran out.
- No source was found on how shipped games render scope sway relative to the simulated aim, for example whether sway moves the reticle within the mask or the whole view.

## 7. WebGPU and three.js's WebGPURenderer as of November 2026

### Takeaway
WebGPU now ships by default in Chrome and Edge on Windows, macOS, ChromeOS and Android, and on Linux only for Intel Gen12+ and for NVIDIA on Wayland. Firefox has it on Windows and Apple Silicon Macs; Linux, Intel Macs and Android are still unshipped. Safari 26 has it on Apple's 26-series operating systems. three.js's own manual still calls WebGPURenderer "experimental" and WebGLRenderer "the recommended choice for pure WebGL 2 applications". A high-priority issue shows WebGPURenderer costing more CPU per object than WebGLRenderer, even on its WebGL 2 backend. For Sightline the move is not worth it before the art pass:
- it would mean rewriting the custom `ShaderMaterial`s in TSL;
- 66–134 draw calls gain nothing from WebGPU's lower draw overhead;
- the WebGL path must stay anyway for browsers without WebGPU.

### Cited Findings
- **Chromium (implementation-status page, last edited Oct 2, 2026):**
  - Mac, Windows and ChromeOS: shipped in 113.
  - Android 12+ on ARM, Qualcomm or Intel: 121. Imagination GPUs on Android 16+: 139.
  - Linux: Intel Gen12+ shipped in 144; NVIDIA (driver 535.183.01+) on Wayland in 147; other Linux configurations behind flags.
  - Windows ARM64: behind a flag. — [gpuweb wiki, Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- **Firefox (same page):**
  - Windows: shipped in 141.
  - Apple Silicon Macs: 145 on macOS 26+, 147 on all macOS versions. Other Macs: Nightly only.
  - Linux: Nightly only, and Mozilla "expects to ship on Linux in 2026".
  - Android: behind a flag. — [gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- **Safari 26** has WebGPU enabled by default in macOS Tahoe 26, iOS 26, iPadOS 26 and visionOS 26. — [gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- **Google's summary (web.dev, Nov 25, 2025)** gave the same picture as of late 2025: Chrome and Edge 113+, Android in 121, Firefox 141 on Windows and 145 on ARM64 macOS Tahoe, Safari 26. Linux was in progress then. — [web.dev, WebGPU is now supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers)
- **Firefox on Linux and Android** was still limited to pre-release builds as of August 2026 (search excerpt). — [Wikipedia, WebGPU](https://en.wikipedia.org/wiki/WebGPU)
- **three.js manual on WebGPURenderer:**
  - "The renderer itself is still in an experimental state although its maturity level has been greatly improved in the last years."
  - WebGLRenderer "is still maintained and the recommended choice for pure WebGL 2 applications", but "there are no plans to add larger new features" to it.
  - "Custom materials based on ShaderMaterial, RawShaderMaterial and modifications of built-in materials via onBeforeCompile() are not supported in WebGPURenderer", and must be ported to node materials and TSL.
  - "EffectComposer with its effect passes are not supported".
  - It falls back automatically to a WebGL 2 backend (`forceWebGL` forces it). It initializes asynchronously (`await renderer.init()` or `setAnimationLoop`).
  - "you will encounter missing features or a better performance with WebGLRenderer". — [three.js manual, WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- **three.js issue #30560** ("Current UBO system has severe performance issues with many render items"; opened Feb 19, 2025; still open; High priority):
  - Original report (r173, M1 Pro): 20,000 non-instanced meshes ran at about 60 fps in WebGLRenderer against about 15 fps in WebGPURenderer.
  - Jan 2026, WebGPURenderer on its WebGL 2 backend against WebGLRenderer, macOS: Chrome 12 against 60 fps; Firefox 28 against 60. Pixel 8a: 19 against 57.
  - Sep 2026 (r186, M4 Max, Chrome/Metal): WebGL 2 fallback CPU submit 2.88 ms against 2.20 ms (+31%), with about 2,350 against 1,300 GL calls.
  - Cause per maintainers: "every object has its own UBO", all bound and updated each frame. No merged fix is recorded. — [GitHub #30560](https://github.com/mrdoob/three.js/issues/30560)
- **Forum benchmark (May 29, 2026; r183; 4,000 meshes, about 8 M triangles; RTX 4090 laptop; Chrome 148):**

  | Renderer | CPU per frame | First frame |
  | --- | --- | --- |
  | WebGLRenderer | 4.5 ms | 32 ms |
  | WebGPURenderer (WebGPU backend) | 9.7 ms | 167 ms |
  | WebGPURenderer (`forceWebGL`) | 10.3 ms | 344 ms |

  A responder (opinion) advised using WebGPURenderer only when "you have to do something" WebGL can't. — [three.js forum](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)
- **New three.js features land on the WebGPU side.**
  - r186 (about Sep 8, 2026): a native Gaussian-splat renderer, `Object3D.dispose()` and `intersectsFrustum()`, and new WebGPU examples including a TSL volumetric-fog post-process.
  - r185: WebXR on WebGPURenderer. These are secondary sources; the official release notes were not read. — [Radiance Fields, r186](https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186); [CGWORLD, r186](https://cgworld.jp/flashnews/01-202610-Threejs-r186.html); [Sensei Notes, r185](https://buttondown.com/wawasensei/archive/sensei-notes-11-threejs-r185-game-ready-ai-models/)
- **CSMShadowNode** works only with WebGPURenderer. — [three.js docs, CSMShadowNode](https://threejs.org/docs/pages/CSMShadowNode.html) (via search excerpt)
- **Babylon.js "snapshot rendering" (WebGPU only)** records one frame's draw calls and replays them. The gain is "on the JavaScript side only", GPU time is roughly unchanged, and the scene "should be mostly static". — [Babylon.js docs, Snapshot rendering](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering)
- **Vendor and SEO blogs, opinion.** Several 2026 blogs call WebGPURenderer the recommended default for new projects; one notes community libraries built on WebGLRenderer internals break. These conflict with the official manual above. — [Utsubo, migration checklist](https://www.utsubo.com/blog/webgpu-threejs-migration-guide); [vr.org](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default)

### Inferences
- **Fit, porting cost.** Sightline renders terrain and solids with custom `ShaderMaterial`s (`src/render/terrainMaterial.ts:83`, `src/render/materials.ts:89`). Moving means rewriting both in TSL, plus any later post-processing.
- **Fit, benefit.** At 66–134 draw calls the CPU submit is already under a millisecond (Section 3). WebGPU's wins (render bundles or snapshot-style replay, compute) target draw-call-bound or compute-heavy scenes. Today three.js's WebGPU path costs more CPU per object.
- **Fit, coverage.** Firefox on Linux, Intel Macs and Android, plus most non-Intel and non-NVIDIA-on-Wayland Linux in Chrome, fall back to WebGL 2. Sightline must ship and test the WebGL path regardless, and CI's Firefox and WebKit runs would exercise different backends.
- **Fit, determinism is not at stake.** Rule 1 keeps all simulation in `src/sim`, so a renderer swap cannot move simulation fingerprints. It can move honest-view agreement, though: the Section 1 test should then run on both backends.
- **When to revisit.** At the art pass (after Concept proven), and only if a needed feature is WebGPU-only:
  - GPU-driven culling or vegetation compute;
  - CSMShadowNode, if a moving sun arrives;
  - TSL post-processing, such as the volumetric fog example.
  - Meanwhile, keep shaders small and data-driven, so a TSL port is mechanical.

### Gaps
- Whether WebGPU timestamp-query precision (for GPU profiling) is coarsened by default in Chrome was not confirmed.
- Whether Safari 26 on macOS versions older than Tahoe enables WebGPU by default was not confirmed.
- The three.js r186 release notes were not read directly. Whether #30560 improved after September 2026 is unknown.

## 8. Browser performance: frame budget, garbage collection, workers and OffscreenCanvas, WebGL state, profiling

### Takeaway
At 60 Hz the frame is 16.66 ms, but web.dev budgets about 10 ms for your own work. V8's collector makes short-lived garbage cheap but not free. WebGL's real stalls are synchronous calls (`getError`, `get*Parameter`, `readPixels` without a pixel-pack buffer) and first-use shader compiles. three.js r186 checks shader errors by default, which forces exactly such a synchronous query. Sightline's simulation is already DOM-free and deterministic, so it can move to a worker if 16 guards' AI outgrows the main thread. OffscreenCanvas is Baseline, with Safari caveats for WebGL in workers. GPU timing queries exist only in Chromium-based browsers.

### Cited Findings
- **Frame budget.** "the browser has 16.66 milliseconds to produce each frame", but "the browser has its own overhead for each frame, so all of your work needs to be completed inside 10 milliseconds". — [web.dev, Rendering performance](https://web.dev/articles/rendering-performance)
- **V8's Orinoco collector.**
  - The parallel scavenger cut main-thread young-generation GC time by about 20–50%.
  - Concurrent marking and sweeping cut pause times "in heavy WebGL games by up to 50%".
  - "short-lived objects are actually very cheap from the garbage collector's perspective": the cost is "proportional to the number of surviving objects".
  - Chrome runs GC idle tasks in leftover frame time. — [V8 blog, Trash talk](https://v8.dev/blog/trash-talk)
- **MDN on blocking calls.** `getError()` "causes a flush + round-trip" and can take about 1 ms. `get*Parameter`, `checkFramebufferStatus` and `getShader*`/`getProgram*` status queries can flush and round-trip. `readPixels` without a `PIXEL_PACK_BUFFER` means "finish + round-trip": use pixel-pack buffers, fences and polling instead. "The only errors a well-formed page generates are OUT_OF_MEMORY and CONTEXT_LOST_WEBGL." — [MDN, WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **MDN on shaders.** Compile all shaders, then link all programs, then check status, and only check compile status if linking fails. Prefer `KHR_parallel_shader_compile`'s non-blocking `COMPLETION_STATUS_KHR`. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **MDN on state and memory:**
  - Batch draws; draw from static VAOs; set up hot framebuffers ahead of time; upload textures before drawing.
  - Use `invalidateFramebuffer` for depth, stencil and multisampled attachments.
  - `texStorage` up front. Mipmaps add about 33%. Depth is rounded up to 4 bytes per texel.
  - RGB8 is "often surprisingly slow", so prefer RGBA8. `alpha:false` can be expensive.
  - Delete GL objects eagerly rather than waiting for GC, and handle `webglcontextlost`.
  - Safe minimums include `MAX_TEXTURE_SIZE` 4096, 16 vertex attributes and 8 texture units. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **MDN on canvas size.** Non-integer `devicePixelRatio` can cause moiré, so size the canvas from `ResizeObserver`'s `device-pixel-content-box`. Shrinking `canvas.width`/`height` while keeping its CSS size is a valid quality lever. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **three.js shader checks and compiling.** `renderer.debug.checkShaderErrors` defaults to `true`, and `WebGLProgram` then queries program status. `renderer.compile()` and `renderer.compileAsync()` pre-compile a scene's materials; the async path uses `KHR_parallel_shader_compile`. `renderer.info` exposes per-frame counts (local source). — [three.js WebGLRenderer.js](https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js); [WebGLProgram.js](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLProgram.js)
- **OffscreenCanvas** is Baseline "Widely available … since March 2023". `transferControlToOffscreen()` hands a canvas to a worker, which can render (including WebGL) and use `requestAnimationFrame`. — [MDN, OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- **Safari WebGL in workers.** Safari 17 added WebGL in OffscreenCanvas, but WebGL in workers reportedly failed on Safari 17.1 on Ventura while working on Sonoma. WebKit advises detecting the feature inside a worker rather than on the main thread (search excerpt). — [WebKit bug 183720](https://bugs.webkit.org/show_bug.cgi?id=183720)
- **three.js in a worker.** `@react-three/offscreen` is experimental: it forwards DOM events, shims the document and window, and falls back to the main thread (search excerpt). — [@react-three/offscreen](https://www.npmjs.com/package/@react-three/offscreen)
- **Spector.js** captures and inspects WebGL frames (commands, full context state, shaders), with heuristic analytics, stack traces and capture export. It runs as Chrome and Firefox extensions or embedded. — [Spector.js](https://spector.babylonjs.com/)
- **GPU timing.** `EXT_disjoint_timer_query_webgl2` support among reports: 64.2% overall; Chrome 79.6%, Edge 94.1%, Firefox 0.06%, Safari 0.26%; Windows 84.1%, Mac 60.9%, Linux 42.0%. — [web3dsurvey](https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2). Compatibility data says Firefox and Safari entries were removed after the "GLitch" exploit (search excerpt). — [MDN-derived compat data (w3cub)](https://docs.w3cub.com/dom/ext_disjoint_timer_query)
- **three.js Inspector.** Since r181, three.js reportedly ships an Inspector for WebGPURenderer that also works on its WebGL 2 fallback. This is from a secondary source. — [Utsubo, three.js 2026 changes](https://www.utsubo.com/blog/threejs-2026-what-changed)

### Inferences
- **Fit, a budget for 60 fps on a mid-range laptop.** These are my allocations, not sourced:
  - JS at most 10 ms in total: about 3–4 ms for simulation ticks at 16 guards, at most 2 ms for render submit, the rest for app, UI and audio, with headroom for GC.
  - GPU at most about 14 ms at 1080p, MSAA on.
  - Measure the simulation with `npm run sim -- --profile` and the renderer with `renderer.info` (already read in `src/render/renderer.ts:195`).
- **Fit, avoid synchronous stalls.** Set `renderer.debug.checkShaderErrors = false` in production builds, keeping it on in dev and tests. Call `renderer.compileAsync(scene, camera)` behind the loading screen for every material, including scope, debug and overlay variants, so the first zoom or debug toggle doesn't hitch. Never call `getError` or synchronous `readPixels` in the frame loop. The Section 1 agreement test should read back through a pixel-pack buffer and a fence, or run only in `test:browser`.
- **Fit, garbage collection.** The simulation already holds state as plain data (rule 9). The renderer and app should reuse scratch `Vector3`/`Matrix4` objects and snapshot buffers, not allocate per frame. Scavenges are cheap but not free, and survivors cost the most, so don't keep per-frame objects alive in caches.
- **Fit, workers.** The simulation is DOM-free, clock-free and deterministic (rules 1 and 2), so it can run in a worker without changes to its contract:
  - a fixed-tick loop fed `InputFrame`s by `postMessage`;
  - snapshots back as transferable typed arrays.
  - Keep the renderer on the main thread: DOM input, Web Audio and the overlay stay simple. OffscreenCanvas rendering in a worker would need event forwarding and Safari detection inside the worker.
  - Do this only if profiling shows simulation ticks plus rendering exceeding the budget.
- **Fit, pixel cost.** Fill rate is the likely mid-range limit (my opinion). Sightline renders at up to 1.5× device pixels with MSAA (`src/app/game.ts:664`): 2.25× the pixels of 1080p when the ratio is 1.5. Offer a render-scale setting by shrinking the canvas backing size (MDN), which by the parity rule changes sharpness, not what is visible. Use `invalidateFramebuffer` on multisampled render targets if a scope target or post pass is added.
- **Fit, profiling stack.**
  - Chrome Performance panel with CPU throttling, to approximate a mid-range laptop on the M3 Max.
  - Spector.js for state changes and draw order.
  - `EXT_disjoint_timer_query_webgl2` for GPU pass timings, Chromium only.
  - `renderer.info` for draws and triangles.
  - The project's headless `npm run look` for correctness. Its frame rate is not representative, as CLAUDE.md notes.
  - Judge final feel on target hardware.

### Gaps
- No published GC pause durations in milliseconds for V8 minor and major collections; the V8 post gives only relative improvements.
- No measured cost of `checkShaderErrors` per program on current Chrome.
- Chrome DevTools features (GPU track, CPU throttling factors) were not verified against current documentation before the search budget ran out.
- No first-party Firefox or Safari profiling guidance for WebGL GPU timing was found.
