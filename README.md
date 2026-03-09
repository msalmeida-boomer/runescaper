# runescaper

A fork of [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) — an awesome RuneScape automation library built for coding agents.

This repo is my personal experiment log: building and iterating on bots using Claude Code + rs-sdk on the 2004scape demo server. Everything here is public so others can follow along or learn from the process.

## Objectives

### 01 — Fishing 70 (in progress)

First attempt failed — bot died to dark wizards near Draynor Village and lost its fishing net. Second attempt with a fresh bot nailed it: net fished shrimp and anchovies at Draynor from level 1 to 70 in a single uninterrupted run.

**Baseline:** ~16 minutes, 133,250 XP (~500k XP/hr).

**Benchmark round 1:** Ran 10 script variants overnight testing tick speed, fly fishing, drift tolerance, and spot selection. 9/10 timed out — the over-engineered setup phase (shop navigation, pickpocketing for coins) got most bots stuck before they even started fishing. The one variant that finished (tight drift tolerance) took 21 min — slower than the simple baseline. Lesson learned: simplicity wins. Re-benchmarking with a stripped-down script next.

## Setup

See the [original rs-sdk README](https://github.com/MaxBittker/rs-sdk) for full setup instructions, architecture docs, and server details.
