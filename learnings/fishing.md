# Fishing

Successful patterns for fishing automation.

## Finding Fishing Spots

Fishing spots are **NPCs**, not locations:

```typescript
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
```

## Spot Types Matter

Different spots have different level requirements:

| Spot Options | Fish Type | Level |
|--------------|-----------|-------|
| Net, Bait | Shrimp, anchovies | 1+ |
| Net, Harpoon | Mackerel, cod, bass | 16+ |
| Lure, Bait | Trout, salmon | 20+ |

Filter for the right spot type:

```typescript
// Level 1 fishing - need "Bait" option (indicates small net spot)
const smallNetSpots = fishingSpots.filter(npc =>
    npc.options.some(opt => /^bait$/i.test(opt))
);
```

## Fishing Action

```typescript
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
```

## Continuous Clicking Works

Don't over-engineer wait conditions. Just keep clicking:

```typescript
while (true) {
    // Dismiss any dialogs (level-ups)
    if (state.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        continue;
    }

    const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
    if (spot) {
        const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
        await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
    }

    await new Promise(r => setTimeout(r, 1000));
}
```

## Safe Fishing Locations

| Location | Coordinates | Spot Type | Notes |
|----------|-------------|-----------|-------|
| **Draynor Village** | **(3087, 3230)** | **Net/Bait** | **USE THIS for level 1.** Shrimp/anchovies. Dark wizards north - stay south if you are low combat level! |
| Lumbridge Swamp | (3239, 3147) | Lure/Bait | **WARNING: Fly fishing only (level 20+), NO small net spots!** |
| Barbarian Village | (3104, 3432) | Lure/Bait | Fly fishing (level 20+) |

**COMMON MISTAKE**: Lumbridge area (3238, 3251) has NO level-1 fishing spots. Use Draynor!

## Handling Drift

Fishing spots move. Check distance and walk back if needed:

```typescript
const START_AREA = { x: 3087, z: 3230 };
const MAX_DRIFT = 15;

const player = state.player;
const drift = Math.sqrt(
    Math.pow(player.worldX - START_AREA.x, 2) +
    Math.pow(player.worldZ - START_AREA.z, 2)
);

if (drift > MAX_DRIFT) {
    console.log(`Drifted ${drift.toFixed(0)} tiles, walking back`);
    await ctx.bot.walkTo(START_AREA.x, START_AREA.z);
}
```

## Dark Wizard Escape (CRITICAL BUG FIX)

**z+ is NORTH in RuneScape, z- is SOUTH.** If taking damage near Draynor, flee SOUTH (z - 20), not north. The dark wizards are north of the fishing spot.

```typescript
// CORRECT — flee south away from dark wizards
if (state.player.hp <= state.player.maxHp - 3) {
    await bot.walkTo(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z - 20, 3);
}

// WRONG — this runs NORTH into the dark wizards!
// await bot.walkTo(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z + 20, 3);
```

Also, `hp < maxHp` is too sensitive — triggers on 1 point of chip damage. Use `hp <= maxHp - 3` to only flee when actually under attack.

## Benchmark Results (Fishing 70, net fishing at Draynor)

**True baseline:** ~21 min (1281s fishing time) from level 1 to 70.

Ran 4 rounds of automated benchmarks (15+ bots total). Key findings:
- No variant (tick speed, drop timing, drift tolerance, spot selection) beat the simple baseline
- The simple script wins: skip tutorial → walk to Draynor → find spot → click net → wait 3 ticks → drop when full
- Over-engineered setup phases (buying gear, pickpocketing for coins) make bots fragile
- `bot.dismissBlockingUI()` is probably unnecessary — clicking the fishing spot dismisses level-up dialogs
- Stuck detection (60s no XP → re-walk) is essential

**Optimization frontier:** Fly fishing confirmed as 5-8x faster than net fishing.

## Fly Fishing (Confirmed Working)

### Equipment & Costs
- **Fly fishing rod:** 5 gp from Gerrant's Fishy Business, Port Sarim (3014, 3224)
- **Feathers:** 2 gp each, 1000 stock from Gerrant's
- Feathers are consumed on each cast (1 per catch attempt)

### XP Rates (confirmed at scale, fly99b to 99)
- **Trout:** 50 XP per catch (level 20+)
- **Salmon:** 70 XP per catch (level 30+)
- **Sustained rate:** 11,000-17,000 XP/min when actively fishing
- **Final session (96→99):** 17,081 XP/min
- **Net fishing comparison:** 2,500-3,500 XP/min sustained
- **Effective rate including crashes/resupply overhead:** ~11,000 XP/min

### Best Strategy: Resupply Loop
1. Net fish at Draynor to level 20 (drops fish)
2. Fill inventory with fish, walk to Port Sarim
3. Sell fish at Gerrant's for coins
4. Buy fly rod (5 gp) + as many feathers as coins allow
5. Walk to Barbarian Village (3104, 3432), fly fish using "Lure" option
6. When feathers run out, DON'T drop all fish — keep them to sell
7. Walk back to Port Sarim, sell fish, buy more feathers
8. Repeat steps 5-7

The loop gets more efficient over time: trout sells for 14 gp (= 7 feathers), salmon for 35 gp (= 17 feathers).

### Fishing Spots for Fly Fishing
Use "Lure" option (not "Bait") on Lure/Bait spots:
```typescript
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
if (spot) {
    const lureOpt = spot.optionsWithIndex.find(o => /^lure$/i.test(o.text));
    if (lureOpt) await sdk.sendInteractNpc(spot.index, lureOpt.opIndex);
}
```

### Locations
| Location | Coords | Notes |
|----------|--------|-------|
| Barbarian Village | (3104, 3432) | Best for fly fishing, no enemies nearby |
| Lumbridge River | (3239, 3147) | Alternative, Lure/Bait spots |
| Port Sarim (Gerrant's) | (3014, 3224) | Shop for rod + feathers |

### Resupply Economics (measured)
The resupply loop gets dramatically more efficient as levels increase:

| Phase | Fish sold | ~Coins per inventory | Feathers bought |
|-------|-----------|---------------------|----------------|
| Early (lvl 20-30) | Shrimp/anchovies | ~80-150 gp | 5-10 |
| Mid (lvl 40-60) | Mix trout/salmon | ~300-500 gp | 40-50 |
| Late (lvl 70-90) | Mostly salmon | ~600-900 gp | 150-300 |

With 200+ feathers, a single fishing session can last 10+ minutes and gain 150,000+ XP.

### Running Bots Long-Term
- **MUST have auto-restart** — server disconnects every 3-10 min
- Use `scripts/monitor.ts` for auto-restart on crash/stall
- Add `process.exit(run.success ? 0 : 1)` after `runScript()` — Bun doesn't exit cleanly otherwise
- DON'T use `onDisconnect: 'wait'` — causes zombie processes
- Log status every 30s to avoid false stall detection
- Stagger bot launches by 10s
- Luck matters: identical code, fly99a stuck at 64, fly99b hit 99
