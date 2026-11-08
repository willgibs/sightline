# Ballistics and shooting: prior art and physics for a realistic-lite sniper model

Tags used below: **[Shipped: game, year]** means it is in a released game. **[Reference]** means a physics or real-world source, not a game. **[Lower confidence]** means a wiki, forum, guide or retailer page, or a claim seen only in a search-engine snippet whose page I could not open. **[Computed here]** means my own calculation with a point-mass solver; the method, inputs and validation are under question 2. The scripts are in the session scratchpad: `/private/tmp/claude-501/-Users-gibby--claude-spares-spare-aa5K8G/3eedefaa-a84c-4c32-a63c-8201e521a7c6/scratchpad/ballistics.py`, plus `closedform.py`, `zeros.py`, `extra.py`, `incline.py` and `validate.py` in the same folder. Gathered on 7 Nov 2026. The shared web-search budget ran out partway through, so Squad, Hitman, Far Cry, Call of Duty and some Battlefield details are listed as gaps, not findings.

## 1. How shipped games model drop, drag, wind, time of flight and spin drift

### Takeaway
Shipped games sit on four rungs:
- **No drop at all:** Hunt: Showdown (2018).
- **Flat, then gravity:** Hunt: Showdown 1896's "drop range".
- **Gravity plus one drag constant per round:** Arma 3 vanilla; Battlefield from BF1 on; Tarkov.
- **A full point-mass solver:** G-model drag tables, atmosphere, spin drift and Coriolis. Only a mod does this: ACE3 for Arma 3.

The best-selling sniper series, Sniper Elite (30M+ units), keeps realism optional. Its wind applies only on the two hardest presets, and the scope moves 100 m per click. Sniper Ghost Warrior Contracts 2 needs no correction inside about 400 m and uses reticle range marks for its 1,000 m+ shots.

### Cited Findings
**Sniper Elite (Rebellion)**
- [Shipped: Sniper Elite, 2005 onward] Realistic ballistics are an option. When it is on, wind direction, wind strength and bullet drop change the shot, and a deep breath ("focus") steadies aim. The series has sold over 30 million units (the figure is undated). — [Wikipedia: Sniper Elite](https://en.wikipedia.org/wiki/Sniper_Elite)
- [Shipped: Sniper Elite 4, 2017] How ranging, holdover and wind work. — [GamePressure SE4 guide](https://www.gamepressure.com/sniper-elite-4/using-the-sniper-rifle/z797d3) [Lower confidence: guide]
  - Binoculars tag a target and show its range in metres above its head.
  - The scope's range setting moves 100 m per click. For a target between settings, set the nearer one and hold over, or the farther one and hold under.
  - Wind applies only on the "Sniper Elite" and "Authentic" presets (the top two of four). An arrow above the scope shows it; at 100 m the round lands under the arrow, and wind can change while you aim.
  - Focus steadies the scope but can't be held long, nor right after running.
- [Shipped: Sniper Elite 4] On lower difficulties a red diamond marks where the round will land; Authentic removes the aids. — [Shacknews](https://www.shacknews.com/article/99012/sniper-elite-4---how-to-snipe) [Lower confidence: search snippet]
- [Shipped: Sniper Elite: Resistance, 2025] Players describe the scope's indicators. — [Steam discussion, 31 Jan 2025](https://steamcommunity.com/app/2169200/discussions/0/601894977920914494) [Lower confidence: player forum]
  - A vertical drop line and a lateral wind line cross at the predicted impact.
  - Below Authentic, empty lung (breath hold) also places an impact marker. It is white, and turns red only when the shot would hit a target.
  - On Authentic only the wind indicator is shown.
- Unverified claim: an aggregator says Sniper Elite 5's trajectory models "over 30" factors. I found no primary Rebellion source for this. — [Expert Beacon](https://expertbeacon.com/why-is-sniper-elite-5-so-hard/) [Lower confidence]

**Sniper Ghost Warrior Contracts 2 (CI Games, released 4 Jun 2021)**
- Long-range missions require kills beyond 1,000 m. "Classic" missions keep targets inside 400 m. — [Wikipedia: SGWC2](https://en.wikipedia.org/wiki/Sniper_Ghost_Warrior_Contracts_2)
- How the reticle is used. — [GamePressure SGWC2 guide](https://www.gamepressure.com/sniper-ghost-warrior-contracts-2/shooting/z1e91b) [Lower confidence: guide]
  - Inside about 400 m no correction is needed.
  - Beyond that, set the scope to the nearest listed range and aim between marks. Example: for a 1,220 m target, set 1,200 and aim between the 1,200 and 1,250 marks.
  - Each range mark carries white horizontal lines for wind direction and strength. Lower difficulties add a slanted line showing the wind's influence.
- Kenton Fletcher, lead creative producer. — [GamingBolt, 20 Apr 2021](https://gamingbolt.com/sniper-ghost-warrior-contracts-2-interview-maps-weapons-progression-and-more)
  - Sniping physics get closer to the real thing on higher difficulties.
  - Lower difficulties provide "target assist tools".
  - Some maps are built around extreme long shots, a first for the series.
- A preview describes a .50 rifle with manual distance calibration up to 1,500 m. — [God is a Geek preview, May 2021](https://godisageek.com/2021/05/sniper-ghost-warrior-contracts-2-blends-intensity-and-patience-superbly-hands-on-preview/) [Lower confidence: search snippet]

**Arma 3 (Bohemia Interactive) and the ACE3 mod**
- [Shipped: Arma 3] Vanilla bullets use one per-ammo `airFriction` constant applied to speed squared. ACE3's fallback, for ammo without ACE data, computes drag as −airFriction·|v|², scaled by air density over ICAO density. — [ACE3 model.rs](https://raw.githubusercontent.com/acemod/ACE3/master/extension/src/ballistics/bullet/model.rs)
- [Shipped: Arma 3 Marksmen DLC, 2015] Bohemia did not add wind ("windage") to bullet flight, citing performance, time and gameplay. The DLC did add weapon resting and bipod deployment. — [OPREP Marksmen Weapons, Lukáš Haládik, 13 Mar 2015](https://dev.arma3.com/post/oprep-marksmen-weapons)
- [Shipped: ACE3 mod; Advanced Ballistics added in v3.0.0] What the module simulates; it is enabled as an addon setting, so players opt in. — [ACE3 wiki: Advanced Ballistics](https://ace3.acemod.org/wiki/feature/advanced-ballistics)
  - Drag from real-world ballistic coefficients, changed by air pressure, temperature and humidity.
  - Wind that varies with altitude and is disrupted by terrain and buildings.
  - Spin drift (the Magnus effect), Coriolis and Eötvös.
  - Loss of stability in transonic flight.
  - Muzzle velocity that varies with powder temperature and barrel length.
  - A light-refraction "bullet trace" for supersonic rounds.
- ACE3 per-ammo data. — [ACE3 framework wiki](https://ace3.acemod.org/wiki/framework/advanced-ballistics-framework)
  - Drag model 1, 2, 5, 6, 7 or 8 (G1 to G8).
  - Ballistic coefficients in velocity bands.
  - Reference atmosphere "ASM" (15 °C, 999.916 hPa, 78% humidity) or "ICAO" (15 °C, 1013.25 hPa, 0%).
  - Muzzle-velocity spread as an SD in percent. The 0.35% example puts 68% of shots within ±3 m/s at 850 m/s.
  - Muzzle velocity interpolated from barrel-length tables; twist rate and direction per weapon.
- ACE3's current Rust extension. — [ACE3 model.rs](https://raw.githubusercontent.com/acemod/ACE3/master/extension/src/ballistics/bullet/model.rs)
  - **Stepping:** each frame it advances the bullet in fixed sub-steps of at most 5 ms (a pre-pass) and 10 ms (the main loop). It updates velocity Euler-style from the current acceleration and returns a velocity correction; the game engine moves the bullet.
  - **Wind:** drag acts on the air-relative velocity (bullet minus wind). Wind is weakened behind terrain, using a 50 m grid sample taken 100 m upwind, and below 20 m by a logarithmic roughness-length profile.
  - **Spin drift:** a velocity term of 0.0581025·(Sg+1.2)·t^0.83.
  - **Earth rotation:** 7.292×10⁻⁵ rad/s.
  - **Transonic jitter:** between Mach 1.0 and 1.2, a bullet with poor transonic stability gets random direction noise from a ChaCha8 RNG.
- ACE3 drag: retardation = 0.00068418·(Cd(M)/BC)·v², with Cd linearly interpolated from the G-table by Mach. — [ACE3 drag.rs](https://raw.githubusercontent.com/acemod/ACE3/master/extension/src/ballistics/drag.rs). The older C++ version credited its drag tables to JBM Ballistics. — [ACE3 AdvancedBallistics.cpp, since removed](https://github.com/acemod/ACE3/blob/master/extensions/advanced_ballistics/AdvancedBallistics.cpp) [Lower confidence: search snippet]
- ACE3 is licensed GPLv2. — [ACE3 repository](https://github.com/acemod/ACE3)

**Escape from Tarkov (Battlestate Games)**
- [Shipped: Tarkov; community test, 2019] A player analysis, reposted by /u/trainfender, compared a .308 175 gr SMK at 880 m/s out to 400 m. — [devtrackers.gg repost](https://devtrackers.gg/escapefromtarkov/p/7cd2cf1d-how-to-make-snipers-snipe) [Lower confidence: community test from 2019; may be outdated]
  - **Real-world model:** about 660 m/s, about 70 cm of drop, 0.48 s.
  - **Tarkov:** about 300 m/s, 65 in of drop, 0.75 s.
  - It estimated Tarkov's effective BC at about 0.14 (G1) or 0.07 (G7), against the real 0.496 and 0.252, and said drag seemed identical for all bullets.
  - High field of view distorted zeroing: a 100 m zero behaved like 200–300 m.
  - A reply (unattributed on the page) agreed the system needed work.

**Battlefield (DICE)**
- [Shipped: Battlefield 1, 2016] A Symthic community analysis says BF1 added air drag on top of gravity, where BF4 was gravity-only. Its comparison used gravity of −12 m/s². It read the change as DICE narrowing the range of engagement distances. — [Symthic forum](https://forum.sym.gg/t/consequences-of-bf1-air-drag-for-players/183) [Lower confidence: search snippet; the page would not load]
- [Shipped: Battlefield 1] Each bolt-action rifle has a "sweet spot" range band where a body hit kills in one shot. Outside it, damage falls (the SMLE drops to 79, a two-shot kill). — [PC Gamer BF1 weapons guide](https://www.pcgamer.com/battlefield-1-weapons-guide/4) [Lower confidence: search snippet]
- Players report bullet lifetimes of about 1,000 m in BF1, shorter in BFV, and about 6,000 m in BF4. — [EA forums](https://forums.ea.com/discussions/battlefield-2042-general-discussion-en/bullet-velocity/6803609) [Lower confidence: forum]
- [Shipped: Battlefield 2042, 2021] Holding breath steadies the scope for a couple of seconds, then recharges; a field upgrade reportedly doubles it. — [Twinfinite](https://twinfinite.net/guides/battlefield-2042-steady-scope-breathe-how/), [GosuNoob](https://www.gosunoob.com/?p=196161) [Lower confidence: guides, no exact numbers]

**Hunt: Showdown (Crytek)**
- [Shipped: Hunt: Showdown, 2018] Crytek's own description of the system. — [Crytek, 18 Apr 2018](https://www.huntshowdown.com/news/inside-hunt-s-weapon-system-with-david-west)
  - **No drop:** gravity doesn't act on bullets, except a mild drop in water.
  - **Speeds:** 375 m/s compact, 500 medium, 800 long, 450 shotgun, 610 nitro.
  - **Range:** 300 m maximum (shotgun 45 m, nitro 280 m).
  - **Published leads** for a centre hit at 100 m: walking 0.31, 0.5 and 0.66 m, running 0.56, 0.9 and 1.2 m, for long, medium and compact ammo.
  - **Hits and damage:** each shot spawns a physical bullet object; damage falls with distance and with each penetration.
  - **Rationale (David West):** fights are typically 50–75 m over iron sights, so drop would only make players guess, and a miss should be the player's fault rather than a random element.
- [Shipped: Hunt: Showdown 1896] Gravity acts only past a per-weapon "drop range"; inside about 125 m there is no drop to consider. Drop range depends on barrel, action, ammo and muzzle velocity. — [GameSkinny](https://gameskinny.com/tips/what-is-drop-range-in-hunt-showdown-1896) [Lower confidence: search snippet; the page refused the fetch]
- Custom ammo trades velocity, drop range and penetration. Spitzer, for example, gains velocity and drop range and loses damage. — [Hunt wiki: Ammunition](https://huntshowdown.fandom.com/wiki/Ammunition) [Lower confidence: wiki snippet]

**Insurgency: Sandstorm (New World Interactive)**
- [Shipped] The bullet leaves along the muzzle, not the screen centre. Stamina affects sway, and heavier gear slows recovery. Under suppression, sway increases and vision is obscured. Time-to-kill is one or two shots. — [Xbox Wire, 13 Sep 2021](https://news.xbox.com/en-us/2021/09/13/creating-immersion-and-intensity-in-insurgency-sandstorm/)

### Inferences
- **Where Sightline sits.** Its default model (drop, travel time, 100 m zero steps, mil holdover, rangefinder, steady wind) is functionally Sniper Elite 4 on its top two presets, plus SGWC2's reticle-mark holds, but physically consistent. No shipped single-player sniper game I found documents a point-mass G-model solver; that is mod territory (ACE3).
- **Tarkov's 2019 numbers don't add up.** A bullet slowing from 880 to 660 m/s cannot cover 400 m in 0.48 s; that would need an average of 833 m/s. My solver gives 0.531 s and 646 m/s at 400 m for that load (G7 0.252) [Computed here]. Use the post's BC estimate, not its time.
- **Hunt's lead table implies speeds.** Dividing each lead by the time to 100 m gives walking about 2.5 m/s and running about 4.5 m/s.
- **A per-round drag constant isn't crude at 100–500 m.** Fitted to a G7 load, it reproduces drop within 1 cm out to 600 m (question 2) [Computed here]. If a search snippet's community value for vanilla Arma 3 .308 ammo (airFriction −0.00101 at 853 m/s, unverified) is right, it equals a G7 BC of about 0.20 (k scales as 1/BC: 0.000756·0.263/0.00101 ≈ 0.197). That is plausible for M80 ball.
- **Fit with Sightline's constraints, one line per technique:**
  - **No drop (Hunt 2018):** trivially deterministic, but there is nothing to hold over and no earned 300 m shot. Doesn't meet the spec.
  - **Flat, then gravity (Hunt 1896):** deterministic, but puts a kink in the path, so zero and mil holds stop matching intuition. Not recommended.
  - **Gravity plus one drag constant (Arma vanilla, Battlefield):** + − × ÷ and sqrt per step, or a closed form using dexp and dlog (question 2). The best realistic-lite fit.
  - **G7-table point mass (ACE3):** a table lookup with linear interpolation plus sqrt, all allowed. Cost is trivial for 15 rounds. Only worth it if ammo types with very different BCs, or subsonic ammo, must share one model.
  - **Spin drift (ACE3):** needs dpow, and is about 0.1 mil at 500 m. Omit.
  - **Coriolis and Eötvös:** need dsin and dcos of latitude, and are a few cm at 500 m. Omit.
  - **Transonic jitter (ACE3):** would draw from the bullet entity's own stream (`ctx.draw`), which is fine under rule 3. Irrelevant, though: the bullets stay above Mach 1.6 at 500 m.
  - **Terrain wind shelter and a log wind profile (ACE3):** dlog is allowed. It makes reading the wind richer (flags at different heights) but adds hidden state. A Phase 3 candidate.
  - **Wind arrow and impact marker (Sniper Elite):** assist layers computed from the same solver. Fits.
  - **Muzzle-anchored bullet (Sandstorm):** conflicts with Sightline's rule that a shot leaves from where the camera looks. In Sightline the camera is the bore line.

### Gaps
- Not researched before the search budget ran out:
  - Squad (optic zeroing and BDC reticles).
  - Hitman (Sniper Assassin).
  - Far Cry (drop on sniper rifles).
  - Sniper Ghost Warrior Contracts (2019).
  - Battlefield V and 2042 numbers, and Battlefield 6's reported "ping-to-zero".
  - Call of Duty.
- No primary technical description from Rebellion or CI Games of their drag form, wind model or spin drift.
- Whether Tarkov's ballistics changed after 2019 is unknown.
- Vanilla Arma 3 `airFriction` values are from a search snippet only; the Bohemia wiki returned 403.

## 2. Physics: the point-mass trajectory with drag, integration choices, Siacci, load data and open-source solvers

### Takeaway
A 3-DoF point-mass model with the G7 table is the reference for modern boat-tail match bullets. For supersonic flight at 100–500 m, one quadratic-drag constant per load reproduces it within 1 cm of drop. That model has a closed form needing only exp and log, and it stays exact to 0.05 cm on ±30° slopes.

At Sightline's 30 Hz, the step choice matters:
- **Semi-implicit Euler, one step per tick:** 18.5 cm off at 500 m.
- **Heun (RK2), one step per tick:** within 0.15 cm.
- **RK4, one step per tick:** within 0.07 cm.

Reference numbers for a .308 Win 168 gr ELD Match with a 100 m zero:
- **300 m:** 0.41 s, 1.50 mil of drop, 0.40 mil of drift in a 10 km/h full-value crosswind.
- **500 m:** 0.74 s, 3.64 mil of drop, 0.73 mil of drift.

### Cited Findings
**Drag models and classic methods**
- [Reference] The standard projectiles. — [Wikipedia: External ballistics](https://en.wikipedia.org/wiki/External_ballistics)
  - G1 is Krupp's 1881 "C" projectile: flat base, 3.28 calibres long, 2-calibre tangent ogive.
  - G7 is a long 7.5° boat-tail with a 10-calibre tangent ogive. Some manufacturers prefer it for very-low-drag bullets.
  - BC varies with Mach and generally falls as the bullet slows. Sporting bullets' G1 BCs run from about 0.12 to just over 1.0.
- [Reference] Methods and models. — [Wikipedia: External ballistics](https://en.wikipedia.org/wiki/External_ballistics)
  - Mayevski–Siacci with G1 (1881) is the most common traditional method. It is optimistic against Doppler-derived drag: for a .338 at 1,500 m it gives 25 m/s more speed and 125.6 cm less drop.
  - Pejsa's closed form stays close in supersonic flight: 10 m/s and 23.6 cm off at 1,500 m.
  - The NATO Armament Ballistic Kernel is a 4-DoF modified point mass. BALCO is 6/7-DoF, integrated with 7th-order Runge–Kutta–Fehlberg.
- [Reference] Effects and worked examples from the same page. — [Wikipedia: External ballistics](https://en.wikipedia.org/wiki/External_ballistics)
  - Transonic flight, about Mach 1.2–0.8, is where prediction gets hard.
  - Doppler-measured spin drift at 1,000 yd: M118 173 gr 11.5 in; M193 55 gr 23 in.
  - Coriolis is about 10 cm at 1,000 m for high-powered rifles. Yaw of repose is typically under 0.5°.
  - G7 column for a .338 at 830 m/s, G7 0.377, ISA sea level:
    - 1,500 m: 339 m/s, 2.8404 s, 30.039 m of drop.
    - 3,000 m: 235 m/s, 8.3369 s, 246.968 m of drop.
- [Reference] G7 table excerpt as (Mach, Cd) pairs; there are 84 rows from Mach 0 to 5: (0.0, 0.1198), (0.9, 0.1464), (0.95, 0.2054), (1.0, 0.3803), (1.05, 0.4043, the peak), (1.2, 0.3884), (1.5, 0.3440), (2.0, 0.2980), (2.5, 0.2697), (3.0, 0.2424), (5.0, 0.1618). — [py-ballisticcalc drag_tables.py](https://raw.githubusercontent.com/o-murphy/py-ballisticcalc/master/py_ballisticcalc/drag_tables.py) (the file has no licence header; the project is LGPL-3.0)
- [Shipped code] ACE3 uses retardation a = 0.00068418·Cd(M)·v²/BC, with v in m/s and BC in lb/in². — [ACE3 drag.rs](https://raw.githubusercontent.com/acemod/ACE3/master/extension/src/ballistics/drag.rs). The constant equals ρ₀·π/(8·703.07) with ρ₀ = 1.225 kg/m³; that derivation is mine.
- [Reference] A forum point: step size often matters more than the integration method, and fixed distance steps simplify reporting at set ranges. — [Sniper's Hide forum](https://www.snipershide.com/shooting/goto/post?id=3134520) [Lower confidence: forum snippet]

**Load data** (Hornady factory figures transcribed by retailers; Hornady's own page returned 404)
- .308 Win 168 gr ELD Match (Hornady 80966): 2,700 fps (823 m/s), G1 0.523, G7 0.263; one listing says 0.268. — [Global Ordnance](https://globalordnance.com/hornady-match-308-win-168-grain-eld-match-20-round-box-80966-upc-090255809664), [Blackstone](https://blackstoneshooting.com/hornady-match-308-win-168-gr-eld-m-20-rounds/) [Lower confidence: retailers]
- 6.5 Creedmoor 140 gr ELD Match (Hornady 81500): 2,710 fps (826 m/s), G1 0.646, G7 0.326; one listing says 0.305. — [OpticsPlanet](https://www.opticsplanet.com/hornady-ammo-6-5-creedmoor-140gr-eld-match-20-81500.html), [1800GunsAndAmmo](https://1800gunsandammo.com/hornady-6-5-creedmoor-140gr-eld-match-ammo-20rd-81500) [Lower confidence: retailers]
- .300 Win Mag 195 gr ELD Match (Hornady 82180): 2,930 fps (893 m/s), G1 0.584, G7 0.292. — [OpticsPlanet](https://www.opticsplanet.com/hornady-ammo-300-win-mag-195gr-eld-match-20-82180.html), [Global Ordnance](https://globalordnance.com/hornady-match-300-winchester-195-grain-eld-match-20-round-box-82180-upc-090255821802) [Lower confidence: retailers]
- .308 175 gr Sierra MatchKing: BC 0.496 (G1) and 0.252 (G7), as quoted in the Tarkov analysis. — [devtrackers.gg](https://devtrackers.gg/escapefromtarkov/p/7cd2cf1d-how-to-make-snipers-snipe) [Lower confidence]

**Open-source solvers and licences**
- **js-ballistics** (TypeScript, on npm). — [GitHub o-murphy/js-ballistics](https://github.com/o-murphy/js-ballistics), [npm](https://www.npmjs.com/package/js-ballistics)
  - Licence: ISC.
  - Models: point mass (3-DoF) plus spin drift; G1, G7 and multi-BC drag; Coriolis from latitude and azimuth; wind layers; zero-finding.
  - Integrators: RK4 (default), Euler and velocity Verlet.
  - Built on a shared C/C++ core ("bclibc") compiled to WebAssembly.
- **py-ballisticcalc** (Python). — [GitHub o-murphy/py-ballisticcalc](https://github.com/o-murphy/py-ballisticcalc)
  - Licence: LGPL-3.0, with its bclibc core separately LGPL-3.0.
  - Engines: python+rk4 (default), euler and verlet, plus adaptive RK45 variants in Cython and SciPy.
  - Lineage: McCoy (BASIC) → JBM (C) → Gekht (C# and Go, adding formulas from Litz) → Trofimov (JavaScript).
- **ballistics-engine** (Rust, also published to npm via wasm-bindgen). — [docs.rs](https://docs.rs/crate/ballistics-engine/latest)
  - Licence: MIT. The page also mentions an Apache licence file, so it may be dual-licensed.
  - Drag models G1, G2, G5, G6, G7, G8, GI, GS, RA4 and custom Cd tables.
  - Effects: Magnus, spin drift, Coriolis, wind shear, precession and nutation.
  - Integrators: adaptive RK45 (Dormand–Prince) by default, fixed RK4 as an option.
  - Version 0.50.1, 4 Nov 2026.
- **ACE3** (Rust extension): GPLv2. — [ACE3](https://github.com/acemod/ACE3)

### Inferences
**Method [Computed here].**
- **Model:** 3-DoF point mass with the G7 table above, linearly interpolated.
- **Constants:** ICAO air (ρ 1.225 kg/m³, sound 340.29 m/s), g 9.80665 m/s², sight 4 cm above the bore.
- **Solving:** zero found by bisection; RK4 at 0.1 ms; no spin drift or Coriolis.
- **Validation** against Wikipedia's .338 G7 column (mine, then published):
  - 1,500 m: 334 m/s, 2.860 s, 30.27 m (published 339, 2.840, 30.04).
  - 3,000 m: 236 m/s, 8.41 s, 251.0 m (published 235, 8.34, 247.0).
  - That is within 0.7–1.6%, likely from the atmosphere or BC reference.

**Reference trajectories [Computed here].** 100 m zero. Drift is for a 10 km/h (2.78 m/s) full-value crosswind.

| Load | Range m | Time of flight s | Speed m/s (Mach) | Drop cm / mil | Drift cm / mil |
|---|---|---|---|---|---|
| .308 168 ELD-M, 823 m/s, G7 .263 | 100 | 0.126 | 765 (2.25) | 0 / 0 | 1.2 / 0.12 |
| | 200 | 0.262 | 710 (2.09) | 12.8 / 0.64 | 5.2 / 0.26 |
| | 300 | 0.408 | 657 (1.93) | 45.1 / 1.50 | 12.1 / 0.40 |
| | 400 | 0.566 | 607 (1.78) | 100.1 / 2.50 | 22.3 / 0.56 |
| | 500 | 0.738 | 558 (1.64) | 181.8 / 3.64 | 36.3 / 0.73 |
| | 600 | 0.925 | 512 (1.50) | 295.2 / 4.92 | 54.5 / 0.91 |
| | 800 | 1.355 | 424 (1.25) | 642.2 / 8.03 | 106.3 / 1.33 |
| 6.5 CM 140 ELD-M, 826 m/s, G7 .326 | 200 | 0.257 | 734 | 12.2 / 0.61 | 4.1 / 0.20 |
| | 300 | 0.397 | 690 (2.03) | 42.6 / 1.42 | 9.5 / 0.32 |
| | 400 | 0.547 | 648 | 93.6 / 2.34 | 17.4 / 0.43 |
| | 500 | 0.706 | 608 (1.79) | 168.0 / 3.36 | 28.0 / 0.56 |
| .300 WM 195 ELD-M, 893 m/s, G7 .292 | 200 | 0.239 | 786 | 10.0 / 0.50 | 4.1 / 0.20 |
| | 300 | 0.370 | 736 (2.16) | 35.8 / 1.19 | 9.5 / 0.32 |
| | 400 | 0.511 | 687 | 79.8 / 2.00 | 17.5 / 0.44 |
| | 500 | 0.662 | 640 (1.88) | 144.6 / 2.89 | 28.3 / 0.57 |

- The design doc's "about half a second at 400 m" holds: 0.51–0.57 s for all three loads.
- All three stay above Mach 1.6 at 500 m, so nothing transonic happens in Sightline's band.

**Integrator error [Computed here].** .308, same launch angle, vertical error in cm at 500 m against the reference; a positive value is high.

| Method, steps per second | 30 | 60 | 120 | 240 |
|---|---|---|---|---|
| Explicit Euler | +11.8 | +5.9 | +2.9 | +1.5 |
| Semi-implicit (symplectic) Euler | −18.5 | −9.1 | −4.5 | −2.3 |
| Semi-implicit velocity, trapezoid position (p += (v_old+v_new)/2·dt) | −3.3 | −1.6 | −0.8 | −0.4 |
| Heun (RK2) | −0.15 | −0.05 | −0.01 | 0.00 |
| RK4 | −0.07 | −0.03 | −0.01 | 0.00 |

- Time-of-flight error at 500 m and 30 Hz: semi-implicit +10.4 ms, RK2 +0.09 ms, RK4 +0.03 ms. At 300 m, semi-implicit is off by −8.7 cm at 30 Hz.
- Euler's first-order error is mostly gravity: about g·t·dt/2, so 12 cm at 0.74 s with 1/30 s steps. RK2 at one step per tick costs two drag evaluations per tick, which is all a 15-round mission needs.
- **Accuracy only matters relative to the instruments.** If the scope's hash marks, the rangefinder's drop readout and the bullet all use the same function and step, any integrator is self-consistent. A mismatch would make the reticle lie by up to a head height at 500 m. One example is a closed-form UI paired with a semi-implicit Euler bullet.

**Simpler models against the G7 reference [Computed here].** .308; each model gets its own 100 m zero.
- **One quadratic-drag constant** (a = −k·|v|·v − g, Arma-style), with k = 0.000756 m⁻¹ fitted to the G7 time of flight at 500 m:
  - Drop: −45.4 vs −45.1 cm at 300 m; −182.6 vs −181.8 at 500 m; −295.4 vs −295.2 at 600 m; −634.7 vs −642.2 at 800 m.
  - Time of flight within 3 ms out to 600 m.
  - Crosswind drift: 12.4 vs 12.1 cm at 300 m; 36.3 vs 36.3 at 500 m.
- **Gravity only, no drag:**
  - Drop is 22% short at 300 m (−35.4 cm) and 29% short at 500 m (−128.8 cm).
  - Time of flight is 0.365 vs 0.408 s at 300 m.
  - There is no physical wind drift at all, because drift comes from drag.
- **"Naive" wind** carries the bullet with the air (drift = W·time of flight). It overstates drift about 9× at 300 m (1.13 vs 0.12 m) and about 6× at 500 m (2.05 vs 0.36 m).
  - Correct drift is W·(time of flight − x/v₀), the "lag" rule. My numeric drift matched it to 0.1 cm at every range.
  - Sniper Elite players reportedly find wind overstated (search snippet, unverified). Whether a shortcut like this is the cause is a guess.

**Closed form for one drag constant [Computed here; derived here].**
- **Formulas:** with s = k·v₀, and flat fire (drag on the drop axis uses the along-path speed):
  - x(t) = ln(1+s·t)/k
  - t(x) = (e^{k·x} − 1)/s
  - v(x) = v₀·e^{−k·x}
  - drop(t) = −g·[t²/4 + (t/s − ln(1+s·t)/s²)/2]
  - crosswind z(t) = W·(t − x(t)/v₀)
- **Accuracy:** matches numeric integration of the same model within 0.1 cm and 1 ms out to 800 m.
- **Slopes:** work in the bore's frame. Use g·cos θ for drop, which is where the rifleman's rule comes from, and subtract ½·g·sin θ·t² along the bore. On ±30° slopes the error across the line of aim is then at most 0.05 cm. The along-bore error is at most 28 cm at 0.74 s, which is under 0.5 ms of timing.
- **Why it fits Sightline:** it needs only dlog, dexp, sqrt and division. A bullet's position at any sub-tick time is exact, with no integration state: just the fire time, origin, direction, k, v₀ and wind. That is ideal for swept hits (question 6) and for drawing the reticle from the same function.

**Small effects [Computed here].** All of these stay below a 20 cm head at Sightline's ranges.
- **Spin drift**, with ACE3's constants and Sg = 1.5 assumed: 1.7 cm (0.06 mil) at 300 m, 4.9 cm (0.10 mil) at 500 m.
- **Muzzle-velocity spread** of ±0.35% (ACE3's default SD): ±0.55 cm at 300 m, ±1.8 cm at 500 m.
- **Coriolis:** a few cm at 500 m, scaled from Wikipedia's 10 cm at 1,000 m.
- ACE3's spin-drift constant is 1.83 × 0.03175 m (1.25 in). That makes it the time derivative of the commonly quoted 1.25·(Sg+1.2)·t^1.83 inch formula. The arithmetic is mine; that the formula is Litz's is from memory, not fetched.

**Subsonic, illustrative [Computed here].** I found no sourced BC, so G7 0.30 is assumed. 320 m/s with a 100 m zero:
- 150 m: 36 cm of drop (2.4 mil).
- 200 m: 99 cm (5.0 mil), 0.65 s.
- 300 m: 3.1 m (10.3 mil).
This supports the design doc's "quiet, short-range tool".

**Licences and porting** (not legal advice):
- ISC (js-ballistics) and MIT (ballistics-engine) allow copying with a notice.
- LGPL-3.0 (py-ballisticcalc, bclibc) and GPLv2 (ACE3) put obligations on derived code. Read them for method and write Sightline's own.
- js-ballistics wraps bclibc, which py-ballisticcalc's page lists as LGPL-3.0. Check this before copying anything from js-ballistics.
- None of them can go into `src/sim` as-is. They use native `Math.pow` and `Math.exp`, configurable step sizes or WASM. A port replaces transcendental calls with detmath and fixes the step.
- Zero-solving by bisection with a fixed iteration count satisfies rule 18 (60 halvings resolve the angle to about 1e-18 rad). The closed form can also be inverted directly.

### Gaps
- Hornady's official tables returned 404, so all BCs came through retailers.
- Litz's independently measured G7 BCs for these bullets were not fetched.
- The atmosphere Hornady's BCs refer to (ASM or ICAO, about 1.8% apart in density) is unconfirmed.
- The attribution of the lag rule (Didion) and of the spin-drift formula (Litz) was not fetched. My numeric checks confirm how both behave.
- The GNU Ballistics and JBM code licences were not verified.
- No source quantified Siacci's accuracy specifically inside 500 m.

## 3. Aiming instruments, zeroing, rangefinders, wind reading; sway, breath hold, heart rate and rests

### Takeaway
Mil (milliradian) reticles with 0.1-mil clicks make every correction decimal: 1 mil is 10 cm at 100 m, and range in metres = target size in mm ÷ mils. Shipped games offer the same three tools: a range-set scope (Sniper Elite 4: 100 m per click; SGWC2: range marks), ranging through binoculars, and a wind indicator on easier settings.

The most documented shipped sway model is Arma 3's:
- Breathing, which is vertical and scaled by fatigue, plus grip.
- Stance tiers.
- An oxygen-limited breath hold with a penalty spike on release.

Sniper Elite 3 allows breath hold only at 80 BPM or below, and crouch or prone caps heart rate at 65 BPM. In reality heartbeat and breathing do move the rifle, but when elite shooters fire relative to their heartbeat doesn't predict their scores; steadiness does.

### Cited Findings
**Units and reticles**
- [Reference] Milliradian basics. — [Wikipedia: Milliradian](https://en.wikipedia.org/wiki/Milliradian)
  - 0.1 mrad is 1 cm at 100 m.
  - Size (mm) ÷ angle (mrad) = range (m). Example: a 1.5 m target at 2.8 mrad is 535.7 m away.
  - Mil reticles usually mark every 1 mrad, sometimes 0.8 or 1.2. The most common turret click is 0.1 mrad.
  - 1 mrad ≈ 3.438 MOA, and 1 MOA ≈ 2.91 cm at 100 m. A NATO mil (1/6400 of a circle) ≈ 0.982 mrad.
  - Pairing MOA turrets with a mrad reticle is generally avoided.

**Zeroing, ranging and wind in games**
- [Shipped: Sniper Elite 4] Binocular range shown above the target's head; the scope moves 100 m per click; a wind arrow sits above the scope. — [GamePressure SE4 guide](https://www.gamepressure.com/sniper-elite-4/using-the-sniper-rifle/z797d3) [Lower confidence]
- [Shipped: Sniper Elite: Resistance] Drop and wind lines on the scope; an impact marker on empty lung below Authentic. — [Steam discussion](https://steamcommunity.com/app/2169200/discussions/0/601894977920914494) [Lower confidence]
- [Shipped: SGWC2] Binoculars measure range; reticle range marks carry wind lines. — [GamePressure SGWC2 guide](https://www.gamepressure.com/sniper-ghost-warrior-contracts-2/shooting/z1e91b) [Lower confidence]
- [Shipped: ACE3] A range card; a protractor (Ctrl+Shift+K) that shows inclination in degrees. — [ACE3 wiki](https://ace3.acemod.org/wiki/feature/advanced-ballistics). Players use ACE's ATragMx ballistic computer with the G7 model. — [Bohemia forum thread title](https://forums.bohemia.net/forums/topic/226000-ace-advanced-ballistics-how-do-you-use-the-g7-drag-model-with-the-atragmx) [Lower confidence: title only]
- [Shipped: Tarkov] Field of view distorts zero and BDC reticle scaling. — [devtrackers.gg](https://devtrackers.gg/escapefromtarkov/p/7cd2cf1d-how-to-make-snipers-snipe) [Lower confidence]

**Reading wind in reality**
- [Reference] Marine and Army sniper training gives two field methods for wind speed; the observation method is the primary tactical one. The flag method: the angle between flag and pole in degrees, divided by 4, gives about mph (40° ≈ 10 mph). — [USMC Weapons Training Battalion, "Effects of Weather"](https://www.trngcmd.marines.mil/Portals/207/Docs/wtbn/ART-A%203%20Effects%20of%20Weather.doc) [Lower confidence: search snippet]. FM 23-10 (1994) has been superseded by FM 3-22.10. — [EverySpec](https://everyspec.com/ARMY/FM-Field-Manual/FM_23-10_17UG1994_14421/) [Lower confidence: snippet]

**Sway, breath and heart rate in games**
- [Shipped: Arma 3, 2014 rework] No numbers were published. — [OPREP Weapon Sway & Fatigue, Radko Voda, 30 Jun 2014](https://dev.arma3.com/post/oprep-weapon-sway-fatigue)
  - Sway is two forces: breathing (vertical, with magnitude and speed tied to fatigue) and grip, which must be maintained.
  - Crouched is more precise than standing, and prone most precise. Basic stances are steadier when still but worse when turning.
  - Holding breath cancels breathing sway while oxygen lasts, and fatigue reduces oxygen.
  - On release, or when oxygen runs out, breathing sway spikes in proportion to the oxygen used.
  - Injuries hurt grip more than breath.
- [Shipped: Arma 3 Marksmen, 2015] Resting a weapon on cover and deploying a bipod. — [OPREP Marksmen Weapons](https://dev.arma3.com/post/oprep-marksmen-weapons)
- [Shipped: Sniper Elite 3, 2014] Heart-rate rules from a guide. — [Digital Trends, Jacob Roach, 16 Mar 2021](https://digitaltrends.com/gaming/sniper-elite-3-guide) [Lower confidence: guide]
  - Empty lung is allowed only at 80 BPM or below; heart rate is on the HUD.
  - Crouched or prone, heart rate never exceeds 65. Walking or jogging brings it near 90; sprinting goes past 90 and takes seconds to settle.
  - The aim state shows a marker where the bullet will hit.
  - Ballistic realism can be set separately from the difficulty preset.
- [Shipped: Sniper Elite 4] Focus can't be held long, nor after running. — [GamePressure SE4 guide](https://www.gamepressure.com/sniper-elite-4/using-the-sniper-rifle/z797d3) [Lower confidence]
- [Shipped: Insurgency: Sandstorm] Stamina drives sway, and suppression increases it. — [Xbox Wire](https://news.xbox.com/en-us/2021/09/13/creating-immersion-and-intensity-in-insurgency-sandstorm/)
- Convention: scope sway that traces a figure eight (a Lissajous figure), often mostly sideways, is a common trope. — [Tropedia: Sniper Scope Sway](https://tropedia.fandom.com/wiki/Sniper_Scope_Sway) [Lower confidence]

**Physiology**
- [Reference] Helin et al. 1987: six Finnish champion shooters fired during diastole (between beats). Beginners fired in both phases, and their diastole shots scored better. — [British Journal of Sports Medicine](https://bjsm.bmj.com/content/21/1/33) [Lower confidence: abstract snippet]
- [Reference] A US Army report: slight movement from breathing, heartbeat or muscle tremor can push a shot well off target. It analysed data from 8 expert marksmen. — [DTIC AD1008572](https://apps.dtic.mil/sti/pdfs/AD1008572.pdf) [Lower confidence: snippet]

### Inferences
**The 300 m walking shot in mils [Computed here].** .308 load, 10 km/h crosswind:

| Factor | Mils |
|---|---|
| Drop, 100 m zero (or 300 m zero) | 1.50 (0) |
| Wind | 0.40 |
| Lead for a 1.4 m/s walker | 1.90 |
| Head, 0.2 m wide | 0.67 |
| Torso, 0.4 m wide | 1.33 |

Lead and drop are each at least two head-widths, and wind is about 0.6 of one. The shot genuinely needs every instrument.

**Lead is almost the same in mils at any range.** It equals target speed ÷ average bullet speed, so it barely changes with distance [Computed here]:
- Walker at 1.4 m/s: 1.76 mil at 100 m, rising to 2.07 at 500 m.
- Jogger at 2.5 m/s: 3.4–3.7 mil.
- Runner at 4.5 m/s: 6.1–6.6 mil.

A mil reticle turns lead into a learnable rule: walker about 2 mils, jogger about 3.5, runner about 6.

**Zero steps leave a gap that holds have to cover [Computed here].** With the zero set in 100 m steps, the error 50 m either side of the zero:

| Zero | 50 m short of zero | 50 m past zero |
|---|---|---|
| 300 m | +11 cm (at 250 m) | −17 cm (at 350 m) |
| 400 m | +18 cm | −25 cm |
| 500 m | +26 cm | −34 cm |

Headshots between steps need a hold, with 0.1–0.5-mil hash marks. Both systems are needed, as the design doc has them.

**Ranging error matters for heads [Computed here].** ±25 m at 300 m moves the impact about 10–11 cm, half a head. Headshots beyond about 250 m need the rangefinder or mil-ranging; a 1.75 m guard at 300 m is 5.8 mil tall.

**Sway building blocks, each with its fit:**
- **Sum of sines, Lissajous:** two incommensurate frequencies, for example breath near 0.25 Hz vertical and 0.13 Hz lateral (suggested values). A pure function of time through dsin, so rule 14 holds directly, and it is learnable.
- **Heartbeat pulse:** a short bump each beat, with period 60/BPM. The phase lives in state and advances as rate·dt (rule 17). The bump is a pure function of phase and amplitude.
- **Grip tremor from hashed value noise:** keyed on tick and entity id, never `Math.random`. Still a pure function of state and time.
- **Breath-hold state machine** (holding → depleted → recovering), like Arma's oxygen. Sightline's numbers: 4 s steady, then about 6 s to recover. Add a release spike in proportion to the hold, as Arma does. All of it lives in `sim.state`.
- **Heart rate: gate or scale.** Sniper Elite 3 gates breath hold at 80 BPM or below; Sightline's doc scales sway width and hold length. Scaling is less binary. A hard ceiling above which no hold is possible can be combined with it.
- **Stance and rest multipliers:** Arma's tiers plus Marksmen's resting and bipod.

**Suggested starting amplitudes** (not sourced, for tuning). Free-standing sway well above a head's 0.67 mil; prone unrested about 0.5–0.8 mil; prone rested about 0.25; prone, rested and holding breath ≤ 0.1. Then a 300 m headshot needs prone plus a breath hold, and a torso shot doesn't.

### Gaps
- No shipped game publishes sway amplitudes or frequencies; Arma's OPREP gives no numbers.
- Call of Duty's breath-hold timing could not be verified; Tarkov and Squad sway were not researched.
- Real-world guidance often quoted as "don't hold your breath beyond 8–10 s" is unverified; the FM 23-10 PDF couldn't be read here.
- A search summary attributed to Konttinen, Mets and Lyytinen (2007) found that trigger timing within the cardiac cycle is not a determinant of junior-elite performance. It also cited a study in which horizontal stability and clean triggering, not timing, correlated with score. Neither paper was opened.
- No sourced measurements of real sway by shooting position.

## 4. What makes long-range hits feel earned and satisfying; difficulty tuning and player reception

### Takeaway
The deepest shipped evidence comes from Sniper Elite:
- The bullet cam (2005) and the X-ray kill cam (2012) were built as the payoff for doing the wind and distance work.
- A hidden score decides how elaborate each cam is: moving target, shot difficulty, distance, body part, and time since the last cam.
- The cam stays optional, and the game is meant to stand without it.

Reviewers single out the long-distance kills as SGWC2's best part. Hunt's designer holds that a miss must be the player's fault. Few players climb to the hardest settings: on Steam, 27.4% finished Sniper Elite 4 on Cadet and 21.5% on Marksman.

### Cited Findings
**Payoff and feedback**
- [Shipped: Sniper Elite series] Tim Jones, head of creative. — [MCV/DEVELOP, 15 Mar 2018](https://mcvuk.com/?p=23739)
  - The first game's kill cam was added late and simply followed the bullet.
  - V2 (2012) added a skeleton and organs, with an X-ray view. Sniper Elite 4 added muscle layers and finer bone damage.
  - In the original, the brief pause was a payoff for the effort of reading wind and distance.
  - A hidden scoring system sets how elaborate a cam is. Its inputs: moving target, shot difficulty, distance, body part, time since the last cam, and the player's settings.
  - It avoids bad views, such as facing a wall. It sometimes hides the bullet's path to stay punchy, or skips the cam after several quick kills.
  - Jones calls the cam somewhat separate from the core game, not a crutch.
- Jones again: the kill cam is optional. Sniper Elite 4 added melee and explosive cams. Example: a missed shot at a soldier 700 m away hits a nearby wall and alerts him. — [GamingBolt, 10 Oct 2016](https://gamingbolt.com/sniper-elite-4-interview-bringing-sniping-back)
- Rebellion, 2025: main weapons aim for a one-to-one match with their real counterparts. Staff spend days at ranges, filmed to map each weapon's sound and study recoil. The kill cam is researched with high-speed film and ballistic gel. — [TheSixthAxis, 27 Jun 2025](https://www.thesixthaxis.com/2025/06/27/rebellion-on-sniper-elites-wacky-wunderwaffe-and-weapon-authenticity/)
- Beck Shaw, lead level designer: gorier bullet-cam features were tested internally and judged to go too far. The PEGI 16 rating widens the audience. — [FRVR, 27 Oct 2025](https://frvr.com/blog/news/sniper-elite-devs-wont-add-gorier-bullet-cams-as-multiple-tests-proved-more-violence-went-too-far/)
- [Shipped: Sniper Elite 5, 26 May 2022] Long-range rifle kills trigger the X-ray cam. — [Wikipedia: Sniper Elite 5](https://en.wikipedia.org/wiki/Sniper_Elite_5)
- [Shipped: ACE3] A visible refraction trace for supersonic bullets. — [ACE3 wiki](https://ace3.acemod.org/wiki/feature/advanced-ballistics)
- [Shipped: Hunt] No drop at short ranges, because a miss should be the player's mistake, never random. — [Crytek, 2018](https://www.huntshowdown.com/news/inside-hunt-s-weapon-system-with-david-west)
- [Shipped: Sniper Elite 3] The loop is one shot, relocate up to 30 m, then another shot. — [Engadget, 11 Jul 2014](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html) [Lower confidence: search snippet]. A white ghost marks your last known position, and enemies search around it. — [Wikipedia: Sniper Elite III](https://en.wikipedia.org/wiki/Sniper_Elite_III) [Lower confidence: snippet]

**Difficulty and assists**
- [Shipped: Sniper Elite 3–5, Resistance] Realism is optional. Wind applies only on the top two presets. An impact marker (Sniper Elite 4's red diamond; Resistance's white-to-red marker) appears below Authentic. Ballistic realism can be set separately from the preset. — sources in questions 1 and 3 ([GamePressure SE4](https://www.gamepressure.com/sniper-elite-4/using-the-sniper-rifle/z797d3), [Steam](https://steamcommunity.com/app/2169200/discussions/0/601894977920914494), [Digital Trends](https://digitaltrends.com/gaming/sniper-elite-3-guide)) [Lower confidence]
- [Shipped: SGWC2] Target assist tools on lower difficulties. — [GamingBolt](https://gamingbolt.com/sniper-ghost-warrior-contracts-2-interview-maps-weapons-progression-and-more)

**Reception**
- Sniper Elite 5 on Metacritic: PC 79, PS5 and Xbox Series 77. GameSpot (8/10) praised the core sniping; Shacknews (9/10) praised the gun feel and X-ray detail; IGN (7/10) called it incremental. — [Wikipedia: Sniper Elite 5](https://en.wikipedia.org/wiki/Sniper_Elite_5)
- SGWC2 on Metacritic: PC 73, PS4 68, PS5 81, Xbox Series 74. IGN (6/10) found the long-distance kills its strongest sections, but said the gunfights break the realism. PC Gamer (80) found the sniping authentic. GameStar (75) said it suits players who like planning perfect long shots. — [Wikipedia: SGWC2](https://en.wikipedia.org/wiki/Sniper_Ghost_Warrior_Contracts_2)
- Steam global achievements, read 7 Nov 2026. — [Steam SE4](https://steamcommunity.com/stats/312660/achievements), [Steam SE5](https://steamcommunity.com/stats/1029690/achievements)
  - Sniper Elite 4: campaign on Cadet 27.4%, on Marksman 21.5%. No Authentic or "Sniper Elite" achievement is visible.
  - Sniper Elite 5: campaign completion 36.7%; a special rifle shot from 100 m or more 23.1%.
- Sound-masking reception: Engadget called Sniper Elite 3's poorly implemented, and Game Informer found Sniper Elite 4's inconsistent at times. — [Engadget](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html), [Game Informer](https://www.gameinformer.com/games/sniper_elite_4/b/playstation4/archive/2017/02/13/sniper-elite-4-game-informer-review.aspx) [Lower confidence: snippets]
- Tarkov's community argued for realistic, lower drag so that snipers could actually snipe. — [devtrackers.gg](https://devtrackers.gg/escapefromtarkov/p/7cd2cf1d-how-to-make-snipers-snipe) [Lower confidence]

### Inferences
**What "earned" is made of.** A visible chain of decisions (range → zero or hold → wind → lead → breath), each worth at least a head-width at 300 m (question 3). Then a delayed, legible confirmation.

**Timeline of a hit, for the shooter [Computed here]:**
- At 300 m: impact at 0.41 s, which the player can see if the scope recovers from recoil. The impact sound arrives back 0.41 + 0.875 = 1.28 s after the shot.
- At 500 m: impact at 0.74 s; sound back at 2.20 s.

A delayed "thwack" is a free, physically true payoff. I found no game source using it. The sim can schedule it exactly.

**Feedback menu, each with its fit:**
- **Bullet trace or vapour trail (ACE3):** render-only, drawn from the sim's deterministic path. Changes no outcome, so rule 14 is satisfied.
- **Recoil and recovery that lets the player see the impact:** if recoil moves the aim, it is sim state, or a pure function per rule 14.
- **Delayed impact sound:** an event scheduled through `ctx.schedule` at time of flight + range/343.
- **Dust or splash on a miss:** lets the player correct like a spotter, and the impact point is deterministic. It also feeds the design doc's "impact draws the guard's eye".
- **Target reaction:** stagger, fall, or a torso-shot cry-out as in the design doc. The cry-out makes precision matter.
- **Kill cam or replay:** Sightline already records every run, so a kill cam is a slowed replay of the recording at no sim cost. Ration it with a hidden Sniper Elite-style score: distance, moving target, body part, time since the last cam.
- **Impact marker and hit marker:** assist toggles, computed from the same solver.

**Arcade, realistic-lite and full simulation, as input to taste call 3:**
- **Arcade** (Sniper Elite Cadet, Hunt 2018): gravity only or hitscan, an impact marker, no wind. Easy to keep deterministic, but no 300 m skill.
- **Realistic-lite** (the doc's default): drag via the closed form or G7 with RK2; zero in 100 m steps; mil holds; steady wind through the lag rule; sway from stance, heart rate and breath; assists for the impact marker and the wind readout. Every number lands in mils the player can read.
- **Full simulation** (ACE3): adds atmosphere, spin drift, Coriolis, muzzle-velocity spread and transonic effects. At 100–500 m those add up to under 0.2 mil: imperceptible gains for more opacity.

**What reception suggests.** The 30M-unit series treats realism as optional; SGWC2 was praised for its long shots, not its gunfights; and only a minority of players reach the harder settings. That points to realistic-lite with assist toggles layered on, rather than separate physics per difficulty.

### Gaps
- No developer talk with measured playtest data on why long shots satisfy, beyond Rebellion's remarks.
- Steam achievement percentages are over all owners, and it's unclear whether a harder completion also unlocks the easier ones.
- No game source found for a delayed impact sound as hit confirmation.
- Hitman and Far Cry feedback were not researched.

## 5. Shot sound: report, crack, subsonic, suppressors, the crack-thump delay, and how games use shot sound for AI and masking

### Takeaway
Real rifles reach about 155–170 dB at the shooter's ear. Suppressors cut roughly 20–35 dB (7–41 dB across studies and positions), and suppressed supersonic fire still exceeds 140 dB, so the bullet's crack remains. The crack seems to come from the bullet's path; the thump (the muzzle report) comes from the shooter. The gap between them grows with range: 0.17 s at 100 m, 0.47 s at 300 m, 0.72 s at 500 m, and about 1 s at 800 m [Computed here]. Games use shot sound as a stealth budget: Sniper Elite's masking works only near a loud source, and noise alerts nearby enemies at once.

### Cited Findings
**Real-world levels**
- [Reference] Branch 2011 (Otolaryngology–Head and Neck Surgery 144(6):950–953). — [ENT Today summary](https://www.enttoday.org/article/firearm-muzzle-suppressors-far-superior-to-ear-level-protection-devices-for-noise-reduction/)
  - Unsuppressed rifles: 155–157.2 dB at the shooter's ear (pistols 157.7–162.5).
  - Suppressors cut 26–41 dB.
  - Measured 1 m left of the muzzle and at the ear.
- [Reference] Le Prell 2017. — [Hearing Review, Dec 2017](https://hearingreview.com/inside-hearing/research/sound-level-suppressors-firearm-noise-reduction-implications-hearing-conservation)
  - A 10.5-inch short-barrelled AR rifle: about 170 dB at the ear, 180–185 dB with muzzle brakes.
  - Suppression of 7–32 dB, depending on ear position, ammunition and weapon.
  - Suppressed fire routinely exceeded 140 dB, except in some subsonic conditions.
  - Sound level meters under-read peaks by at least 6 dB, often 12 or more.
  - The research was funded by the American Suppressor Association.

**Crack and thump**
- [Reference] The crack points along the bullet's path and the thump locates the shooter. Soldiers are trained to wait for the thump, and suppressors weaken it. — [NDIA 2009 Infantry Small Arms slides](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf) [Lower confidence: search snippet; the PDF couldn't be read here]
- [Reference] Max Velocity Tactical. — [Max Velocity Tactical](https://maxvelocitytactical.com/crack-thump) [Lower confidence: practitioner blog, about 2013]
  - The crack is a small sonic boom as the round passes; the thump is the rifle's report and arrives after it.
  - Range from the gap: about 1 s means beyond 600 m; a clear gap under 1 s means 300–600 m; little or none means inside about 300 m.
  - The method fails in a full firefight and under about 100 m.
  - A suppressed shooter's crack is still heard, while the thump is faint at long range.
  - You don't hear the round that hits you.
- [Reference] Crack-to-thump localization needs a supersonic bullet. — [VERA technical report, arXiv 1905.13313](https://arxiv.org/pdf/1905.13313) [Lower confidence: snippet]
- The crack seems to come from where the bullet passed nearest. — [Sniper's Hide](https://www.snipershide.com/shooting/goto/post?id=2527251) [Lower confidence: forum snippet]

**Games**
- [Shipped: Sniper Elite 3] Sound masking. — [Digital Trends](https://digitaltrends.com/gaming/sniper-elite-3-guide) [Lower confidence]
  - A pulsing-lines icon shows when unsuppressed shots are masked.
  - Sources: backfiring trucks, manned anti-aircraft guns, generators. A kicked generator backfires at intervals for a while.
  - You must be close to the source. Killing or alerting the crew tied to it ends the masking.
- [Shipped: Sniper Elite 4] Unsuppressed shots are heard across a wide area. Suppressed ammo deals less damage. Standard rounds go through wood. — [GamePressure SE4](https://www.gamepressure.com/sniper-elite-4/using-the-sniper-rifle/z797d3) [Lower confidence]
- [Shipped: Sniper Elite 4/5] Sniper Elite 4 dropped Sniper Elite 3's relocation meter; noise near enemies alerts them immediately. — [Game Informer](https://www.gameinformer.com/games/sniper_elite_4/b/playstation4/archive/2017/02/13/sniper-elite-4-game-informer-review.aspx) [Lower confidence: snippet]. Sniper Elite 5 uses a "Loud Area": enemies inside it hear gunshots, and masking is the counter. — [GamePressure SE5](https://www.gamepressure.com/sniper-elite-5/beginners-guide/z2fe6a) [Lower confidence: snippet]
- [Shipped: Insurgency: Sandstorm] From sound alone, players work out a shot's location, whether the shooter is indoors or out, the room type (big, small, metal, concrete) and which way the shooter faces. — [Xbox Wire](https://news.xbox.com/en-us/2021/09/13/creating-immersion-and-intensity-in-insurgency-sandstorm/)
- [Shipped: Sniper Elite] Rebellion films range sessions to map each weapon's sound. — [TheSixthAxis](https://www.thesixthaxis.com/2025/06/27/rebellion-on-sniper-elites-wacky-wunderwaffe-and-weapon-authenticity/)

### Inferences
**Crack-thump gap at the target, .308 [Computed here].** These agree with Max Velocity's bands.

| Range | Gap |
|---|---|
| 100 m | 0.17 s |
| 200 m | 0.32 s |
| 300 m | 0.47 s |
| 400 m | 0.60 s |
| 500 m | 0.72 s |
| 600 m | 0.82 s |
| 800 m | 0.98 s |

**Where the crack seems to come from [Computed here].**
- The shock cone's half-angle θ satisfies tan θ = 1/√(M²−1), so no inverse trig is needed. It is 31.5° at 300 m (657 m/s) and 37.9° at 500 m (558 m/s).
- A listener at perpendicular distance d from the path hears the crack from a point d·tan θ upstream of the nearest pass: 0.61·d at 300 m. That is roughly 60° off the bullet's line.
- So a guard 10 m from the path at 300 m hears the crack from about 6 m upstream of where the bullet passed him, not from the shooter 300 m away. This is the physics behind the design doc's "crack misleads listeners".

**A sim model for shot sound.** Each shot schedules per-listener events through `ctx.schedule`:
- **Report:** at shooter range/343 s, pointing at the shooter.
- **Crack:** at the shock's arrival time, for listeners within a crack radius of the path, pointing at the upstream point.
- **Impact:** at its time and place.

All of it is + − × ÷ and sqrt. Masking compares levels in dB at the listener against the masking source, with a threshold; dB needs dlog. Distance loss can be −6 dB per doubling (inverse square, standard acoustics, not fetched). The suppressor takes 20–30 dB off the report and leaves a supersonic crack unchanged. Subsonic ammo plus a suppressor removes the crack and keeps the report low, matching the design doc's table.

### Gaps
- No primary source for how any game's AI uses crack versus report to localize a shooter, nor for Sniper Elite's masking thresholds and radii.
- No data on crack loudness against miss distance.
- No measured numbers for suppressed subsonic levels.
- A NIOSH study reportedly measured 20–28 dB reductions at an instructor position about 1 m behind the shooter; I saw this only in a search snippet and did not open the source.

## 6. Swept collision of fast projectiles against moving capsules, and what single-player games do instead of lag compensation

### Takeaway
Shipped references are thin. ACE3 sub-steps bullets at no more than 10 ms per frame. Hunt spawns a physical bullet object and, in multiplayer, "favors the shooter" within limits.

In a single-player fixed-step sim with render interpolation (Fiedler), the equivalent of lag compensation is to resolve the shot at the instant the player saw it. Carry a sub-tick fire time in the input, and sweep the bullet against target poses interpolated between ticks. At 30 Hz:
- A .308 bullet moves about 27 m per tick.
- Its path bends only 1.4 mm over that span.
- A walking guard moves 4.7 cm in the same time.

### Cited Findings
- [Shipped: ACE3] Per frame, the bullet is advanced in fixed sub-steps of at most 5–10 ms, returning a velocity correction to the engine. — [ACE3 model.rs](https://raw.githubusercontent.com/acemod/ACE3/master/extension/src/ballistics/bullet/model.rs)
- [Shipped: Hunt: Showdown] Each shot creates a physical bullet that collides with the world. "Favor the shooter" compensates for latency, with limits so players can't benefit by raising their ping. — [Crytek, 2018](https://www.huntshowdown.com/news/inside-hunt-s-weapon-system-with-david-west)
- [Reference] Glenn Fiedler, "Fix Your Timestep!". — [Gaffer on Games, 10 Jun 2004](https://gafferongames.com/post/fix_your_timestep/)
  - A fixed-dt accumulator, with rendering interpolated between the previous and current state by the leftover fraction (alpha).
  - Rendering otherwise shows the sim at a slightly different time from render time.
  - Fixed steps give exact reproducibility, and avoid instability and tunnelling from variable dt.

### Inferences
**Numbers [Computed here].**
- The bullet travels 27.4 m per 30 Hz tick at the muzzle, and its path bends 1.36 mm over one tick (sagitta).
- Target movement per tick: 4.7 cm at 1.4 m/s, 10 cm at 3 m/s, 16.7 cm at 5 m/s.

**A swept test per tick.**
1. Treat the bullet's path over the tick as one straight segment (or a few). Take positions from the closed form or the integrator's samples.
2. Move each hit shape (head sphere or capsule, torso capsule, leg capsules) linearly from its pose at tick k to its pose at tick k+1.
3. Within each sub-interval, subtract the shape's displacement over the same interval from the bullet's segment. What's left is a segment against a static capsule: a hit when the closest distance between two segments is no more than the radius.
4. Across shapes and the world, the earliest time of impact wins. Break ties in a fixed order (head, torso, legs, world) for determinism.
5. Test the same segment against terrain triangles split on the (i, j)–(i+1, j+1) diagonal (rule 7) and against the colliders seen through `Solids`.

**Precision.** With linear target motion and one straight bullet segment per tick, the error is about the sagitta (1.4 mm) plus any non-linear limb motion. Sub-steps (for example 4 per tick, about 7 m each) are only needed for fast limb rotation or for path bend at long range, not for ballistic accuracy (question 2).

**What the player saw.**
- The renderer shows an interpolation between ticks k−1 and k at alpha. A click therefore corresponds to sim time (k−1+α)·dt. That is up to one tick behind the newest state (4.7 cm for a walker, a quarter of a head) and up to two ticks behind the tick that processes the input.
- The single-player equivalent of lag compensation:
  - Store the fire time as a fraction of a tick in `InputFrame`, quantized (say to 1/64 tick), so the recording replays it (rule 5).
  - Start the bullet at that time along the view direction, with sway evaluated as a pure function at that same time (rule 14).
  - Sweep targets starting from their interpolated pose at that time.
- Equivalently, rewind: keep the last two tick poses of every hit shape, which interpolation needs anyway.

### Gaps
- No primary source was fetched for the segment–capsule closest-point math (Ericson's *Real-Time Collision Detection* is the usual reference).
- Valve's lag-compensation page returned 403.
- No single-player shooter's documentation on sub-tick shot timing was found.
