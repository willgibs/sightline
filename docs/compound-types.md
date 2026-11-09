# Compound types: different kinds of place, and what a second storey asks of the engine

The design, Nov 9, 2026, for the owner's call of the same day ("compound types are the next thing the generator learns, on their own branch, alongside the camp work", with two-storey buildings to come with them). It is on the owner's desk as a decision (the *Compound types* ask). **Step 1 (section 6) has landed; Step 2 follows the owner's answer or the desk's default.**

## 1. The gap

Every camp is one place: a fence with one gate and one breach, seven slots round a yard, every building one storey. The cruxes (`generation/crux.ts`) made each camp a different *problem*. The topology stayed the same, so "a hundred seeds of it are a hundred rotations of one picture" is now true of the compound where it was true of the valley before lab D's six kinds of site. Assessed as an engine, the gap is that the generator has one plan shape in code, so a new kind of place means a new branch of `compound.ts`. Knowledge that varies what a camp *is* has to be data.

## 2. What a type is, as data

A compound type is a record in `tuning.gen.compound.types` (rule 16: content is data in tuning, so a recording embeds the types it was made with):

| Field | What it says |
| --- | --- |
| `cruxes`, `sites` | How well it suits each crux, and each kind of ground. The seed's type is picked from the product of the two (section 3). A type that can't suit a pair is weighted to nothing. |
| `shape` | Which **plot shape** lays it out: `yard`, `bailey`, `spine` or `steading`. A shape is the one piece of code per type family (a function in `generation/plots.ts`): it turns the numbers below into openings, parcels, a heart (the yard, the bailey, the road) and the lanes guards walk. Everything downstream (modules, doors, fixtures, cover, staffing, validation) reads what the shape produces and never asks which type it is. |
| `plots`, `perimeters`, `fills` | The plan's own relative weights (`layout.plan`), so each type draws its plot, perimeter and fill from what suits it. `yard` keeps today's weights exactly. |
| Sizes | The plot's half-sizes and heart, the road's width, how many towers, gates and how wide, by type. |
| `modules` | What stands in it, by module: its size, and (once Step 2 lands) its storeys. A keep's `hq` is the keep; a depot's sheds are long; a farm has a farmhouse and a barn. |
| `hq` | Which parcels the target's building may take, by crux: the crux decides where in the place he's buried, the type decides what "deep" means here. |

A new type that uses an existing shape is data alone. A new shape is one function, and everything else follows. That's the same seam as the kinds of site (`landform.ts`): new ground from new streams, with the old kind unchanged.

**Yard stays**, as one of four, and with its weights at the top it is bit for bit today's generator (new types only ever draw from new streams, rule 3). That's what the variety experiments' arms compare against.

## 3. How a seed gets its type

`compoundTypeOf(seed, crux, kind, gen)`, from a root stream of its own (`compound-type`), so a valley re-rolled or a camp rebuilt keeps its type, the same way cruxes and kinds of site already work. The weights multiply a type's fit to the crux and to the ground, so each pair of crux and ground reads as a real place, not a roll of the dice. The starting values below are to be set from `npm run experiment`:

| Crux | yard | keep | depot | farm |
| --- | --- | --- | --- | --- |
| inside: dig him out | 2 | 5 | 1 | 3 |
| flush: make him run | 2 | 2 | 4 | 3 |
| escort: he walks with eyes on him | 2 | 0 | 4 | 3 |

| Ground | yard | keep | depot | farm |
| --- | --- | --- | --- | --- |
| hollow | 3 | 1 | 2 | 3 |
| spur | 1 | 5 | 1 | 1 |
| bend | 2 | 1 | 1 | 3 |
| scarp | 2 | 2 | 2 | 1 |
| gorge | 1 | 1 | 4 | 1 |
| col | 2 | 3 | 2 | 1 |

(A keep on a spur is a keep on a hilltop: the ground falls away round the pad, except along its neck. A keep has no weight on an *escort* camp: walled in the middle of a walled plot, no perch ever has him long enough for that crux to be a crux, and validation says so.)

## 4. The three new places

Each is here because it changes *what a plan has to be*, not only how the camp looks.

**The keep (shape `bailey`).** A tight plot walled all round, one narrow gate, and in the middle where the yard was, a keep: the target's building, big and tall, standing in a ring of open ground (the bailey), with the outbuildings against the wall. Everything that matters is behind two lines. The keep hides the bailey behind it from a perch on one side and shows it from the other. It suits *inside* above all: he's at the middle of everything, and getting to him is the whole mission. On a *flush* camp he has the bailey to cross to reach his vehicle by the gate, in view of whichever perch has the bailey on that side.

```
    wall ████████ gate ████████
    █  shed  mess   motor pool █
    █    ┌──────────────┐      █
    █    │     keep     │  ▲   █
    █    │ (he is here) │ bailey
    █    └──────────────┘  ▼   █
    █  radio  barracks  store  █
    ████ postern ██████████████
```

**The depot (shape `spine`).** A long, narrow plot strung along the road, which runs right through it from a gate at each end. Long sheds stand on both sides of the road, doors opening on to it; trucks are parked along it. There is no yard: the road is the yard. From a perch square-on you see a slice of road between two sheds; from a perch up the road's axis you see all of it and nothing behind the sheds. It suits *escort* (he walks the road from his office to the sheds, and the men along the road have him) and *flush* (his vehicle is on the road, a short sprint from his door, with the whole road for a long view). The two gates make "the way in" a real choice.

```
  ████████ fence ████████████████████████████████
  █ shed  │ shed    │ shed   │ office │ shed     █
  gate ═══╪══ road ═══╪══════╪════════╪═══ gate
  █ pool  │ shed    │ store  │ mess   │ radio    █
  ████████████████████████████ breach ███████████
```

**The farm (shape `steading`).** No fence: a farmhouse and a barn and a byre round a small farmyard, then sheds and a generator hut scattered further out across the plot, field walls low enough to see over and crawl behind, a silo the marksman holds. Every direction is open to walk in from, so the wall to get over is the way the farm's buildings see each other, not a fence. It suits *flush* (he bolts from the farmhouse for the cart shed across the yard) and *escort* (his walk from the house to the barn crosses open ground in view of the men in the yard), and *inside* with the house deep in the steading.

```
    field wall    ▒▒▒▒  ▒▒▒▒▒▒▒▒    ▒▒▒▒
       hut                       cart shed
             byre ┌───────┐ barn
                  │  yard │
                  └ house ┘             silo
     shed                   wireless hut
    ▒▒▒▒▒    field wall      ▒▒▒▒▒▒▒▒
```

What each *doesn't* do yet: buildings stay aligned to the camp's axes (the raster, doorways and the way the wall cells are stamped assume it), and the compound still sits on the site's flat pad at the middle of the map (the owner's *pad* call). Neither stops the types.

## 5. What a second storey asks of everything that assumes one surface per column

The honest list. Today the game is two-and-a-half-dimensional in several places, in different ways, and that's where the real work is.

| System | Today | A floor above asks | Real engine work? |
| --- | --- | --- | --- |
| **The motor** (`body/motor.ts`, rule 10) | Bodies stand on terrain *or on anything solid*: `groundBelow` finds the highest top within a step, and ceilings already stop a body at height. | Nothing. Stairs and floors are colliders with a rise inside `stepHeight`, as on the movement course. | **No.** An invariant run on a two-storey camp, and that's all. |
| **Sight and bullets** (labs A, B) | Rays against colliders, in full 3D. | Nothing. A window is a gap in a wall. | **No.** |
| **The renderer** | Draws the colliders. | Nothing. | **No.** |
| **The analysis raster** (`generation/raster.ts`, D7), the certified way in | One ground height, one `top`, and *one* overhead slab per 1 m cell. | A floor and a roof in one column (a second slab), a window (a doorway with a sill, in the same carving), and cells for the upper floor and the run of the stairs, so a way in can be certified all the way to him. | **Yes, the largest piece.** Extra cells beyond the grid's `na × nb` for upper floors and stairs; a second slab through `lineOfSight`, `ViewMarcher` and `perchViewshed`; exposure over the extra cells by a per-guard line test (there are few); the infiltration search crossing them. |
| **The spatial grid and grid search** (`kernel/world/grid.ts`, `search.ts`) | One surface per column: a 0.5 m site layer at the terrain. | The upper floor as a layer of its own, and stairs as links between layers. | **Yes, small in lines, but it's the kernel.** `GridSearch` runs over the site layer and its upper levels as one index space. With no levels it is the same search, bit for bit: every pin holds. |
| **Navigation** (`brain/nav.ts`) | Routes are (x, z) on one surface, pulled taut against the terrain's height. | Route ends with a height; pulling stays within a level; a stair is a pair of waypoints that are never pulled across. | **Yes, moderate.** Routes stay (x, z): a guard walking toward the head of the stairs climbs because the treads are there. |
| **Sound** (`perception/hearing.ts`) | A flood over the site layer, and a straight line through walls. | The flood crosses the stairs with the rest of the stack, so a step upstairs reaches a man below by the stairs or muffled through the floor (a floor isn't a wall: a small `floorLossDb`). | Moderate, and most of it falls out of the stack. |
| **Guards' routines** (`generation/routine.ts`) | Pure functions of time in (x, z), on the ground or on a fixed deck (`elevated`). | Nothing for a post: an upstairs post is a deck. A routine that climbs stairs would need a height per leg. | **No, deliberately.** Upstairs men hold posts (the target, a marksman at a window). Nobody's rhythm climbs stairs in this work. |
| **The brain** (`brain/brain.ts`) | Goals are (x, z). A man on a deck stays there. | A goal with a height, where the percept had one: a man who heard or saw something upstairs goes up. The target's run starts upstairs on a flush camp. | Small. |
| **The commander's search and the cover search** (`searchMap.ts`, `ground.ts`) | One plane. | Unchanged. A man the commander sends to search goes to the ground floor. | **Not in this work.** A known limit, written down: a search doesn't climb on its own, only a man who sensed something upstairs does. |
| **The generator** | Hollow one-storey boxes. | Floor slabs with a stairwell, a flight of stairs, windows, a partition upstairs. | Content, inside `generation/` alone. |

**The engine under all that: levels.** A level is a walkable surface above the ground, a building's upper floor. `SpatialGrid` gains a list of levels (each a small layer over its own footprint, at the site's 0.5 m, on the site layer's cell boundaries) and the stairs that join them, as links between cells. `GridSearch` treats the site layer and its levels as one index space, the site's cells first, so a flood or a path crosses a stair like any other move, and everything above follows from that. The analysis raster does the same one level up, with extra cells after its `na × nb`, derived from the same list. A storey is 3.0 m floor to floor.

**What the second storey is for.** A place to bury him that a perch can't reach except through a window. A vantage inside the camp: a marksman at a window watches the bailey or the road. A silhouette at 6 m that blocks what a perch sees of the ground behind it. And for a player, somewhere to go: up the stairs, and the same things that hold for him hold for the guards.

**Which buildings get two.** By type, as data: a keep's keep, a depot's office, a farm's house. Everything else stays at one, so a storey means something.

**Who stands upstairs.** The target where the crux is *inside* or *flush* and his building has two storeys: a post, picked where no perch's window line reaches him and away from the head of the stairs, so getting in means going up and finding him. A marksman at an upper window where the plan has one (the keep and the farm); a tower still holds him elsewhere.

## 6. The order, and what each step proves

**Step 1 · The types, on one storey** (one pull request; `GEN_VERSION` 7). `generation/plots.ts`: the four shapes. `compound.ts`: types and shapes in place of the one topology; `staffing.ts`: the loops and zones it walks come from the shape, not from hard-coded rectangles. Variety experiments gain a `type` column and an arm with the types switched off.

Done when: every seed generates one of the four, chosen to suit its crux and ground; lab D's bar holds on a new held-out series (90 of 100 valid at the first attempt, `npm run seeds -- --count 100 --from compound-types-exit`); the variety experiments show the gain; each type reads as itself in `npm run look` and the debug view; `npm run check` passes.

**Step 2 · The levels, and two storeys** (a second pull request, the next free `GEN_VERSION`). Levels in the grid and the search; navigation, hearing, the raster and the search over extra cells; floors, stairs and windows in the generator; upstairs posts in staffing; a goal's height in the brain. The motor's invariant run and `npm run fuzz` go over two-storey camps.

Done when: the second storey is reached by real stairs, by the player and by guards who have heard something up there; the way in is certified to a clear shot at the target upstairs; sound goes up the stairs and through the floor, tested; every pin that doesn't stand on a two-storey camp is unmoved; a person can play it.

**Why this order.** The types are the owner's ask and they change what a plan is by themselves; they're testable and playable on one storey, and that lets the owner judge them on their own. The second storey is real engine work that lands behind tests, and it changes every lane a little, so it should land on a compound generator that has already settled.

## 7. Measuring it

- **Lab D's bar**, per pull request, on a held-out series new to it: 90 of 100 valid at the first attempt.
- **The variety experiments** (`npm run experiment -- variety-*`), with a `type` column and the arm with one type: plot shape and openings, what a perch sees, how deep the target is (his door's walk from the nearest opening), the family of plan that's best, and the regret of holding to one family. The gain to show: more spread in those descriptors across types than across the old generator, and a best-plan mix per type that differs from the others (Beukman's test: two camps are different if they're solved differently).
- **Pictures** (`npm run look`, one seed per type, honest and debug) and a person's sitting: three seeds, one per type, with the links, on the owner's desk.

## 8. The call on the owner's desk

Two-storey buildings need the engine in section 5. The recommendation is to build it, in the two steps above, because every simpler version leaves a hole: upstairs that no guard can reach is a safe room, and a target upstairs needs a certified way in or an *inside* camp can't be promised. The cheaper version is posts only (upper floors hold a target or a marksman, nobody else climbs, and the way in is certified to the foot of the stairs), and it's offered on the desk with what it leaves out.
