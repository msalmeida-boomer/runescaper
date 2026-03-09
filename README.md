# runescaper

A fork of [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) — an awesome RuneScape automation library built for coding agents.

This repo is my personal experiment log: building and iterating on bots using Claude Code + rs-sdk on the 2004scape demo server. Everything here is public so others can follow along or learn from the process.

## Objectives

### 01 — Fishing 70 (in progress)

First attempt failed — bot died to dark wizards near Draynor Village and lost its fishing net. Second attempt with a fresh bot nailed it: net fished shrimp and anchovies at Draynor from level 1 to 70 in a single uninterrupted run.

**Baseline:** ~21 minutes (1281s fishing time), 133,250 XP.

**Benchmarking:** Ran 4 rounds of automated benchmarks (15+ bots) testing tick speed, drop timing, drift tolerance, and spot selection. Spent most of the time debugging — chased red herrings around level-up dialogs and framework overhead before discovering the real bug: the escape code ran bots north into dark wizards instead of south to safety (`z+` is north in RS, not south). Once fixed, everything worked. No variant beat the simple baseline — simplicity wins. Next optimization lever is fly fishing (trout at 50 XP vs shrimp at 10 XP).

## Setup

See the [original rs-sdk README](https://github.com/MaxBittker/rs-sdk) for full setup instructions, architecture docs, and server details.
