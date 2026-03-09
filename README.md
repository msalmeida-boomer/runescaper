# runescaper

A fork of [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) — an awesome RuneScape automation library built for coding agents.

This repo is my personal experiment log: building and iterating on bots using Claude Code + rs-sdk on the 2004scape demo server. Everything here is public so others can follow along or learn from the process.

## Objectives

### 01 — Fishing 70 (in progress)

First attempt failed — bot died to dark wizards near Draynor Village and lost its fishing net. Second attempt with a fresh bot nailed it: net fished shrimp and anchovies at Draynor from level 1 to 70 in a single uninterrupted run.

**Baseline:** ~16 minutes, 133,250 XP (~500k XP/hr).

**Benchmarking:** Ran 4 rounds of automated benchmarks testing tick speed, drop timing, drift tolerance, and spot selection. Most of the work ended up being debugging the benchmark framework itself — found three bugs along the way: an over-engineered setup phase that got bots stuck before they even started fishing, level-up dialogs silently blocking all interactions (costing ~60s per level-up), and an escape route that ran bots north into dark wizards instead of south to safety. After fixing all three, the baseline lands consistently around ~20 min. The ~4 min gap vs the original run is likely framework overhead. Still haven't beaten the original simple script.

## Setup

See the [original rs-sdk README](https://github.com/MaxBittker/rs-sdk) for full setup instructions, architecture docs, and server details.
