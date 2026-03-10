# Project Journal

The full history of this project, session by session. Written as a reference for future articles and to keep track of what we tried, what worked, and what we learned along the way.

---

## Session 1: Getting Started

Set up the project as a fork of [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) at `msalmeida-boomer/runescaper`. The idea: use Claude Code as a coding agent to build and iterate on RuneScape bots for the 2004scape demo server, and document the whole process publicly.

Created our first bot (`boomer1`), got it connected to the game, and started experimenting with basic actions. The bot spawned in Lumbridge after the tutorial. We tried walking around, interacting with NPCs, and getting a feel for the SDK.

`boomer1` ended up dying to dark wizards south of Varrock. Learned that combat is dangerous for low-level bots and we need to be more careful about pathing near hostile NPCs. Abandoned the bot and decided to start fresh with a focused objective.

---

## Session 2: Fishing 70 Objective

Set our first real goal: get a bot from level 1 to Fishing 70 in one uninterrupted run. Created `fishing70v1` and wrote a simple net fishing script targeting Draynor Village (3087, 3230).

The script was straightforward:
1. Skip tutorial
2. Drop junk items from tutorial
3. Walk to Draynor fishing spot
4. Loop: find fishing spot, net fish, drop full inventory, repeat
5. Stop at level 70

It worked first try. The tutorial gives a small fishing net so we didn't need to buy one. Estimated it took about 16 minutes (this turned out to be wrong later, but we didn't know that yet).

With the basic goal done, we decided to try optimizing. Could we make it faster? What parameters matter?

---

## Session 3: Benchmarking (the long one)

This was a big session. We wanted to scientifically test different script variants to find the fastest path to Fishing 70. Built a benchmark runner that creates fresh bots, runs each variant with a 30-minute timeout, and records the results.

### Round 1: 10 variants, overnight run

Created 10 variants testing different things:
- Tick wait times (1, 2, 3 ticks between actions)
- Drop wait behavior (pause between drops vs instant)
- Drift tolerance (how far the fishing spot can move before re-walking)
- Fly fishing (switch to lure at level 20 for 5x XP)
- Closest spot selection

Ran it overnight. Results were bad: 9 out of 10 timed out. Only v07 (tight drift tolerance) finished, at 21 minutes. The fly fishing variants all failed because the shop navigation code was too fragile. Bots got stuck trying to pickpocket coins and navigate to Port Sarim shops.

Key takeaway: simple scripts beat complex ones. The over-engineered setup phase (pickpocket, shop, equip) was the bottleneck, not the fishing loop.

### Round 2: stripped down, 5 variants

Rewrote the base script to be dead simple. No shop phase, no fly fishing, just: skip tutorial, drop junk, walk to Draynor, fish. Tested 5 net-only variants with different loop parameters.

Results: 4 out of 5 timed out again. Only v03 (no drop wait) finished at about 18 minutes.

Checked the stuck bots and found them all sitting at the fishing spot with "Click here to continue" level-up dialogs open. Diagnosed it as level-up dialogs blocking the low-level `sdk.sendInteractNpc()` call. Added `bot.dismissBlockingUI()` to the loop.

### Round 3: dialog fix, dark wizard discovery

Ran again with the dialog fix. v01 baseline was progressing, but then noticed v02 was getting killed by dark wizards. Checked its position: it was way north of the fishing spot, right in dark wizard territory.

This was the big discovery. The escape code had `z + 20`, which we assumed meant "run south" (away from danger). But in RuneScape, z+ is NORTH. So every time a bot took damage, it ran NORTH, directly into the dark wizards. Then it took more damage, ran further north, and got stuck in a death loop.

This single bug was the root cause of most failures across all rounds. Not the dialogs, not the framework overhead, not the loop parameters. Just running the wrong direction.

### Round 4: both fixes applied

Fixed the escape direction to `z - 20` (south, toward the coast). Also kept the dialog fix and made the HP threshold less sensitive (only flee when HP drops by 3+, not any damage).

v01 baseline finished at 1211 seconds (about 20 minutes). v02 was in progress when a server disconnection killed the run.

### Sanity check

At this point we noticed the benchmark results (~20 min) were consistently slower than our original "16 minute" estimate. Was the framework adding overhead?

Ran the original simple script with ONLY the wizard escape fix. No `dismissBlockingUI`, no framework. Result: 1281 seconds, about 21.4 minutes.

So the original 16-minute estimate was just wrong. The true baseline was always about 21 minutes. The benchmark wasn't slower; it was measuring correctly the whole time.

The user called it: the dialog blocking theory was a red herring. Clicking the fishing spot probably auto-dismisses any open dialog. The bots that were "stuck on dialogs" were actually stuck because they'd been running into dark wizards. The dialog was just the last level-up before they died.

### What we learned from all this

1. **One bug caused everything.** The escape direction being reversed caused most failures across 4 benchmark rounds. Everything else we diagnosed was a secondary effect of bots getting killed.

2. **Simple beats complex.** The plain "fish and drop" loop is already near-optimal for net fishing. No variant meaningfully beat the baseline.

3. **Measure precisely.** Our initial "16 min" estimate was 30% off. Real benchmarks matter.

4. **The real optimization lever is strategy, not parameters.** Fly fishing gives 50 XP per catch vs 10 XP for shrimp. That 5x multiplier will matter way more than any tick-timing optimization.

---

## Session 4: Planning tools and Fishing 99

Updated the objective from Fishing 70 to Fishing 99. The plan:
1. Build generic telemetry and analysis tools (not fishing-specific, reusable for any skill grind)
2. Use those tools to pursue Fishing 99 with fly fishing
3. Track runs, compare strategies, diagnose failures automatically

Also set up this journal and moved lab logs out of the gitignored `bots/` folder so everything is public and accessible from any machine.

Pulled upstream changes from rs-sdk (door retry logic, CLI file exec, resilience improvements).

Cleaned up the README to be simpler and more human. No em-dashes, no tables, no over-explaining.

---

## Session 5: Telemetry, Dashboard, and the Fishing Campaign

### What we built

Three new tools, all generic and reusable:

**Telemetry module** (`sdk/telemetry.ts`) — Structured event logging for any bot script. Hooks into `sdk.onStateUpdate()` and automatically detects XP gains, level-ups, HP changes, inventory changes, and deaths by diffing state every game tick. Writes JSONL files (one event per line, crash-resilient) to `bots/{username}/runs/`. Also writes a summary JSON at the end of each run with XP/min, skill deltas, death count, etc. Scripts integrate with three lines: create a `Telemetry` instance, call `start()`, call `stop()`.

**Dashboard** (`dashboard/server.ts` + `dashboard/index.html`) — A local web UI at `http://localhost:3333` that reads telemetry data from all bot run directories and visualizes it. Built with Bun.serve() and Chart.js (CDN, no npm deps). Features: run comparison table (bot, duration, outcome, XP, XP/min, levels), XP/min over time chart, level progression chart, failure breakdown. Dark theme, monospace font, auto-refresh toggle.

**Fishing 99 campaign** — Six bots running different fishing strategies simultaneously, all with telemetry enabled:

1. `f99net1` — Pure net fishing at Draynor (baseline control)
2. `f99net2` — Net fishing with fast dropping (no tick wait between drops)
3. `f99fly1` — Net to 20, sell fish at Gerrant's, buy fly rod+feathers, fly fish at Barbarian Village
4. `f99fly2` — Same as fly1 but fly fish at Lumbridge river
5. `f99fly3` — Net to 20 with banking, sell multiple loads for max feathers, fly at Barbarian Village
6. `f99fly4` — Fly fish with feather resupply loop (sell fish, buy more feathers, repeat)

### Early results

Fly fishing is dramatically faster than net fishing, as expected:

| Bot | Strategy | XP/min (early) | Notes |
|-----|----------|---------------|-------|
| f99fly4 | Fly + resupply loop | ~2,782 | Best so far, already at level 35+ |
| f99fly2 | Fly at Lumbridge | ~1,430 | Second best, clean transition |
| f99net1 | Net baseline | ~328 | Steady but slow |
| f99net2 | Net fast drop | ~191 | Surprisingly slower |

The resupply loop (f99fly4) is the standout — it sells caught fish to buy more feathers, creating a self-sustaining cycle. Each resupply gets more feathers because trout/salmon sell for more than shrimp.

f99fly3 crashed on first launch (server connection timeout) but was restarted. The other 5 bots connected and ran without issues.

Campaign runs are 1 hour each. Results are being collected in real-time via the dashboard.

### What we learned so far

- Fly fishing XP rates are 5-8x higher than net fishing, confirming the benchmark hypothesis
- The resupply loop pattern (sell fish for feathers, repeat) is sustainable and gets better over time
- Telemetry auto-detection works well — XP gains, level ups, deaths all captured without manual logging
- Running 6 bots simultaneously is possible but staggering their start times prevents connection failures

### Campaign, continued

The first round of 6 bots all crashed within 30 minutes from server disconnections. The default `onDisconnect: 'error'` behavior crashes the script on any server hiccup, and without a monitor, dead bots stayed dead.

**Key problems discovered and fixed:**
1. `onDisconnect: 'wait'` causes zombie processes — the runner disconnects after an error, but the wait handler tries to reconnect, hanging forever. Reverted to default.
2. Bot processes don't exit cleanly after errors — something in the event loop keeps them alive. Fixed by adding explicit `process.exit(run.success ? 0 : 1)` after `runScript()`.
3. Scripts only logged every 5 levels — long silent stretches made the monitor think bots were stalled. Added 30-second periodic status logging.
4. Monitor stall timeout was too aggressive at 2-3 minutes, killing bots during legitimate walks. Set to 4 minutes.

**Built a monitor script** (`scripts/monitor.ts`) that:
- Launches bots with staggered starts (10s between each)
- Detects crashes via exit code (immediate restart)
- Detects stalls via output silence (4-min timeout)
- Auto-restarts with a 3s delay, up to 50 retries per bot
- Prints status summary every 2 minutes

**Fresh campaign with 3 bots** (created new, clean characters):
- `fly99a` and `fly99b` — Fly fishing with resupply loop (proven best strategy)
- `net99a` — Pure net fishing at Draynor (baseline control)

**Results after ~35 minutes of wall time:**

| Bot | Level | XP | Restarts | Strategy | Effective XP/min |
|-----|-------|----|----------|----------|-----------------|
| net99a | 81 | 304,750 | 3 | Net fishing | ~3,500 (accumulated from prev sessions) |
| fly99b | 73 | 166,750 | 8 | Fly resupply | ~11,437 when fishing |
| fly99a | 61 | ~75,000 | 9 | Fly resupply | ~11,000 when fishing |

**Key insight:** Fly fishing is 4-5x faster XP/min when actually fishing (11K vs 2.5K), but the overhead of resupply walks + crashes from server disconnects during walks reduces effective throughput. Net fishing at Draynor requires no walks after initial setup, making it extremely stable (3 restarts vs 8-9 for fly bots).

The resupply economics improve over time: early trips buy 5-10 feathers (from shrimp), later trips buy 40-50 feathers (from trout/salmon at 14-35 gp each). Each fishing session gets longer as you can buy more feathers per trip.

### FISHING 99 ACHIEVED!

**fly99b hit Fishing 99 first** — 2 hours 40 minutes wall clock (per in-game hiscores), 25 total runs.

- **Strategy**: Fly fishing with feather resupply loop at Barbarian Village
- **Final session stats**: Level 96→99 in 9.5 minutes, 17,081 XP/min
- **Total XP at 99**: 999,000
- **Zero deaths**

All three bots eventually reached 99:
- **fly99b**: 2h40m, 25 runs — fastest, resupply economics snowballed early
- **net99a**: 3h25m, 32 runs — steady grind, 87% uptime
- **fly99a**: 4h38m, 30 runs — same code as fly99b, just unlucky with crash timing

**Why fly99b won**: The resupply economics snowball. Early trips buy 5-10 feathers (from selling shrimp at 3 gp). By Fishing 80+, each resupply was buying 200-320 feathers (selling trout at 14 gp and salmon at 35 gp). With 300 feathers, the bot could fish for 10+ minutes straight, gaining 150,000+ XP before needing to resupply. The walks to Port Sarim and Barbarian Village are the vulnerability — every crash during a walk is wasted time — but with enough feathers, the fishing sessions are long enough to outrun the crash rate.

**Why fly99a was so slow**: Same strategy, same server, just unlucky. It crashed on nearly every resupply walk and struggled to build feather momentum. It eventually reached 99 but took 4h38m — almost 2x fly99b's time. This shows how dependent the fly strategy is on surviving the resupply walks.

**The monitor script was essential**: Without auto-restart, no bot would have survived. The server disconnects every 3-10 minutes. The monitor detected crashes via exit code (instant restart) or stall timeout (4 min of silence).

### Tools built this session

| Tool | File | Purpose |
|------|------|---------|
| Telemetry | `sdk/telemetry.ts` | Auto-detects XP, levels, deaths, inventory changes via state diffing |
| Dashboard | `dashboard/` | Web UI with charts and run comparison |
| Monitor | `scripts/monitor.ts` | Auto-restart crashed/stalled bots |

### Key learnings

1. **Fly fishing is 5-7x faster XP than net fishing** — 15,000-17,000 XP/min vs 2,500-3,500 XP/min
2. **Resupply economics snowball** — early feather purchases are tiny, late ones are huge
3. **Server stability is the bottleneck**, not script quality — all crashes were server disconnects
4. **Process exit bugs matter** — Bun processes don't exit after `sdk.disconnect()`, need explicit `process.exit()`
5. **`onDisconnect: 'wait'` causes zombie processes** — better to crash fast and let monitor restart
6. **Periodic logging is essential** — without it, monitors kill healthy bots for being "silent"
7. **Net fishing is boring but rock-solid** — 3 restarts in 90 min vs 19-24 for fly bots
8. **Luck matters** — fly99a and fly99b ran identical code, fly99b finished in 2h40m, fly99a took 4h38m

---

*More sessions to come.*
