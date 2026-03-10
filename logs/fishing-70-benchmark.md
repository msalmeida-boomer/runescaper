# fishing70v1 Lab Log

## Run 1: Baseline (COMPLETE)

**Goal:** Take a fresh bot from level 1 to Fishing 70 in one run.

**Result:** ~16 minutes, 133,250 XP (~500k XP/hr)

**What happened:**
- New bot spawned in Lumbridge with starter gear (including a fishing net from tutorial)
- Skipped pickpocketing/shop phases — tutorial provided the net
- Walked to Draynor Village fishing spot (3087, 3230)
- Net fished shrimp/anchovies, dropping full inventories
- Level 1 → 70 in one uninterrupted run
- No deaths, no stuck states, no dark wizard issues

**Learned:**
- Tutorial gives a small fishing net — no need to buy one for fresh bots
- Dark wizards are 5 tiles away at this spot but don't aggro at combat level 3
- XP is heavily accelerated — 1 to 70 in a single session
- Simple scripts work: find spot → click net → wait → drop fish

---

## Run 2: Benchmark Round 1 (COMPLETE — mostly failed)

**Goal:** Run 10 script variants to find the fastest path to Fishing 70.

**Variants tested:**
1. Baseline (3 tick wait, net only) — TIMEOUT
2. 1 tick polling — TIMEOUT
3. 2 tick polling — TIMEOUT
4. No drop wait — TIMEOUT
5. Fly fishing at level 20 — TIMEOUT
6. Fly fishing + 1 tick — TIMEOUT
7. Tight drift (8 tiles) — **SUCCESS: 1266.4s (~21 min)**
8. Loose drift (25 tiles) — TIMEOUT
9. Closest spot selection — TIMEOUT
10. Hybrid (fly + closest + 1 tick + no drop wait) — TIMEOUT

**Setup:** Each variant created a fresh bot (bench01r1 through bench10r1), with 30-minute timeout per run. Ran overnight from ~1:53 AM to ~6:55 AM.

**Results:** 9/10 variants timed out. Only v07 (tight drift) completed. At 21 min it's actually slower than the original 16 min baseline.

**What went wrong:**
- The benchmark `base.ts` script is over-engineered compared to the original `script.ts`
- Setup phase (drop starter items → pickpocket coins → buy from shops) likely caused most bots to get stuck
- The original script worked because it was dead simple: tutorial gives net → walk to Draynor → fish
- Bots that need to navigate to Port Sarim shops, pickpocket men, handle shop UI are fragile
- v07 succeeded probably because its config is closest to defaults with just a tighter drift — it may have had a tutorial net and skipped the shop phase entirely

**Learned:**
- Complex setup phases are unreliable — bots get stuck on pathing, shop UI, pickpocketing
- Simplicity > optimization: the 16 min simple script beats all 10 "optimized" variants
- Next benchmark should strip the base script back to basics — assume tutorial gives net, skip shop phase
- Fly fishing variants need to be tested separately with more robust shop logic
- 30 min timeout was appropriate — caught stuck bots and kept the run moving

**Next steps:**
- Rewrite base.ts to be simpler (assume net from tutorial, no shop phase for net-only variants)
- Test fly fishing separately with better shop navigation
- Re-run benchmark with simpler base

---

## Run 3: Benchmark Round 2 (COMPLETE — still mostly failed)

**Goal:** Re-run with stripped-down base.ts (no shop phase, no fly fishing). 5 net-only variants.

**Changes:** Removed all pickpocketing/shop/fly-fishing logic. Script now just: skipTutorial → drop junk → walk to Draynor → fish.

**Results:** 4/5 timed out. v03-nodropwait succeeded at 1069.5s (~17.8 min).

**Root cause found:** Level-up dialogs. Checked all timed-out bots — they were all actively fishing (levels 20-50) but stuck on "Click here to continue" level-up dialogs. The script used `sdk.sendInteractNpc()` (low-level) which doesn't dismiss dialogs. Each level-up silently blocked fishing for 60 seconds until stuck detection fired. With 69 level-ups from 1→70, that's potentially over an hour of dead time.

**Learned:**
- Must call `bot.dismissBlockingUI()` in the main loop when using low-level sdk methods
- Level-up dialogs block all NPC interactions silently — no error, just nothing happens
- v03 (no drop wait) was fast enough to beat the 30 min timeout despite the dialog bug

---

## Run 4: Benchmark Round 3 (PARTIAL — dark wizard bug found)

**Goal:** Re-run with dialog dismissal fix. 5 variants.

**Changes:** Added `bot.dismissBlockingUI()` at top of main loop.

**Results:** v01-baseline succeeded at 1211.0s (~20 min). v02-1tick got stuck — killed by dark wizards.

**Root cause found:** The "run south" escape code (`z + 20`) was actually running the bot NORTH (z increases northward in RuneScape). North of the fishing spot = dark wizard territory. So when a bot took any damage, it fled directly into the dark wizards and got stuck in a death loop.

**Learned:**
- RS coordinate system: z+ = north, z- = south
- The escape route was running INTO danger, not away from it
- Any damage → flee north → more damage → flee north again → stuck forever

---

## Run 5: Benchmark Round 4 (PARTIAL — server disconnection)

**Goal:** Re-run with both fixes: dialog dismissal + correct escape direction (z - 20, south toward coast).

**Changes:**
- `bot.dismissBlockingUI()` every loop iteration
- Flee south (z - 20) instead of north
- Only flee when HP drops by 3+ (ignore chip damage)
- Wait for full HP before returning to fish

**Results (partial — stopped due to server disconnection):**
- v01-baseline: **SUCCESS at 1211.0s (~20.2 min)**
- v02-1tick: In progress when stopped (was at Fishing 58, on track)

**Observation:** Baseline consistently lands around 20 min with the benchmark framework, compared to the original one-off script's ~16 min. The ~4 min overhead is likely from `dismissBlockingUI()` being called every tick + starter item dropping + general framework overhead.

---

## Run 6: Sanity Check (COMPLETE)

**Goal:** Run the original simple script with ONLY the wizard escape fix (z-20 not z+20), no `dismissBlockingUI`, to establish a true baseline.

**Result:** **1281.3s (~21.4 min) fishing time.** Total wall-clock including tutorial + walk was ~22-23 min.

**Conclusion:** The original "~16 min" was never accurate — it was a rough estimate. The true baseline has always been ~21 min. The benchmark framework wasn't adding overhead; it was measuring correctly all along.

**What this means:**
- `dismissBlockingUI()` was unnecessary (dialog theory was a red herring, as user suspected)
- The ONLY real bug across all 4 rounds was the escape direction (`z+20` running north into wizards)
- The benchmark framework works fine — ~20 min results were actually at or near true baseline

---

## Overall Summary

**True baseline:** ~21 min (1281s) for Fishing 1→70 via net fishing at Draynor.

**What worked:**
- Simple net fishing at Draynor (3087, 3230) — reliable and fast
- Tutorial provides the fishing net — no shop phase needed
- Stuck detection (60s no XP → re-walk) catches most failure modes
- 30 min timeout per bot keeps benchmark runs moving

**The one real bug:**
- **Wrong escape direction** — `z + 20` runs NORTH into dark wizards (z+ = north in RS). Fix: `z - 20` runs south to safety. This caused most failures across all 4 benchmark rounds.

**Red herrings we chased:**
- **Level-up dialog blocking** — we thought `sdk.sendInteractNpc()` was silently failing during dialogs. More likely, clicking the fishing spot auto-dismisses dialogs. The bots with open dialogs at timeout were probably stuck from wizard damage, not dialog blocking.
- **Over-engineered setup** — the shop phase WAS fragile, but even the simplified script had the wizard bug, so failures continued.
- **Framework overhead** — we thought the benchmark was 4 min slower than the original. Turned out the original measurement was just wrong.

**Still to explore:**
- Fly fishing (trout 50 XP vs shrimp 10 XP = 5x multiplier) — the real optimization lever
- Running multiple bots in parallel
- Server stability — disconnections kill long benchmark runs
