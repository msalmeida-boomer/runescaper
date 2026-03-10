// Telemetry - Structured event logging for bot scripts
// Auto-detects XP gains, level-ups, HP changes from state diffs
// Writes JSONL (one event per line) for crash resilience

import type { BotSDK } from './index';
import type { BotWorldState, InventoryItem } from './types';
import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============ Types ============

export interface TelemetryConfig {
    botName: string;
    sdk: BotSDK;
    goal?: string;
    runsDir?: string;
}

export interface RunSummary {
    botName: string;
    goal?: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    outcome: string;
    message?: string;
    skillDeltas: Record<string, {
        startLevel: number;
        endLevel: number;
        startXp: number;
        endXp: number;
        xpGained: number;
    }>;
    xpPerMinute: Record<string, number>;
    totalXpGained: number;
    deathCount: number;
    eventCount: number;
}

// ============ Telemetry Class ============

export class Telemetry {
    private sdk: BotSDK;
    private botName: string;
    private goal?: string;
    private runsDir: string;
    private jsonlPath: string;
    private summaryPath: string;
    private unsubscribe: (() => void) | null = null;
    private startTime = 0;

    // State tracking
    private prevSkills = new Map<string, { level: number; xp: number }>();
    private prevHp = 0;
    private prevInvKey = '';
    private initialized = false;

    // Counters
    private deathCount = 0;
    private eventCount = 0;
    private startSkills: Record<string, { level: number; xp: number }> = {};

    constructor(config: TelemetryConfig) {
        this.sdk = config.sdk;
        this.botName = config.botName;
        this.goal = config.goal;

        const projectRoot = process.cwd();
        this.runsDir = config.runsDir || join(projectRoot, 'bots', config.botName, 'runs');

        const now = new Date();
        const slug = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.jsonlPath = join(this.runsDir, `${slug}.jsonl`);
        this.summaryPath = join(this.runsDir, `${slug}.json`);
    }

    start(): void {
        mkdirSync(this.runsDir, { recursive: true });
        this.startTime = Date.now();

        // Capture initial state if available
        const state = this.sdk.getState();
        if (state) this.captureInitialState(state);

        // Write run_start event
        this.emit({
            type: 'run_start',
            botName: this.botName,
            goal: this.goal,
            skills: this.startSkills,
            position: state?.player ? { x: state.player.worldX, z: state.player.worldZ } : undefined,
        });

        // Subscribe to state updates for auto-diffing
        this.unsubscribe = this.sdk.onStateUpdate((state: BotWorldState) => {
            if (!this.initialized) {
                this.captureInitialState(state);
                this.initialized = true;
            }
            this.diffState(state);
        });
    }

    stop(outcome: string, message?: string): RunSummary {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        const endTime = Date.now();
        const durationMs = endTime - this.startTime;

        // Get final skills
        const state = this.sdk.getState();
        const endSkills: Record<string, { level: number; xp: number }> = {};
        if (state) {
            for (const s of state.skills) {
                endSkills[s.name] = { level: s.level, xp: s.experience };
            }
        }

        // Compute deltas
        const skillDeltas: RunSummary['skillDeltas'] = {};
        const xpPerMinute: Record<string, number> = {};
        let totalXpGained = 0;

        for (const [name, end] of Object.entries(endSkills)) {
            const start = this.startSkills[name] || { level: 1, xp: 0 };
            const xpGained = end.xp - start.xp;
            if (xpGained > 0) {
                skillDeltas[name] = {
                    startLevel: start.level,
                    endLevel: end.level,
                    startXp: start.xp,
                    endXp: end.xp,
                    xpGained,
                };
                const minutes = durationMs / 60000;
                xpPerMinute[name] = minutes > 0 ? Math.round(xpGained / minutes) : 0;
                totalXpGained += xpGained;
            }
        }

        // Write run_end event
        this.emit({
            type: 'run_end',
            durationMs,
            outcome,
            message,
            skills: endSkills,
        });

        const summary: RunSummary = {
            botName: this.botName,
            goal: this.goal,
            startTime: this.startTime,
            endTime,
            durationMs,
            outcome,
            message,
            skillDeltas,
            xpPerMinute,
            totalXpGained,
            deathCount: this.deathCount,
            eventCount: this.eventCount,
        };

        writeFileSync(this.summaryPath, JSON.stringify(summary, null, 2));
        return summary;
    }

    /** Emit a custom event */
    event(name: string, data?: Record<string, unknown>): void {
        this.emit({ type: 'custom', name, ...data });
    }

    // ============ Internal ============

    private emit(event: Record<string, any>): void {
        const state = this.sdk.getState();
        const fullEvent = {
            ts: Date.now(),
            tick: state?.tick ?? 0,
            ...event,
        };
        this.eventCount++;
        try {
            appendFileSync(this.jsonlPath, JSON.stringify(fullEvent) + '\n');
        } catch {
            // Silently fail on write errors (e.g. disk full)
        }
    }

    private captureInitialState(state: BotWorldState): void {
        for (const s of state.skills) {
            this.startSkills[s.name] = { level: s.level, xp: s.experience };
            this.prevSkills.set(s.name, { level: s.level, xp: s.experience });
        }
        if (state.player) {
            this.prevHp = state.player.hp;
        }
        this.prevInvKey = this.invKey(state.inventory);
    }

    private diffState(state: BotWorldState): void {
        // XP + level diffs
        for (const s of state.skills) {
            const prev = this.prevSkills.get(s.name);
            if (!prev) {
                this.prevSkills.set(s.name, { level: s.level, xp: s.experience });
                continue;
            }
            if (s.experience > prev.xp) {
                this.emit({
                    type: 'xp_gain',
                    skill: s.name,
                    xpGained: s.experience - prev.xp,
                    totalXp: s.experience,
                    level: s.level,
                });
                if (s.level > prev.level) {
                    this.emit({
                        type: 'level_up',
                        skill: s.name,
                        previousLevel: prev.level,
                        newLevel: s.level,
                        totalXp: s.experience,
                    });
                }
                this.prevSkills.set(s.name, { level: s.level, xp: s.experience });
            }
        }

        // HP diff
        if (state.player) {
            const hp = state.player.hp;
            if (hp !== this.prevHp) {
                const delta = hp - this.prevHp;
                this.emit({ type: 'hp_change', hp, maxHp: state.player.maxHp, delta });
                if (hp === 0 && this.prevHp > 0) {
                    this.emit({
                        type: 'death',
                        lastHp: this.prevHp,
                        position: { x: state.player.worldX, z: state.player.worldZ },
                    });
                    this.deathCount++;
                }
                this.prevHp = hp;
            }
        }

        // Inventory change (lightweight hash comparison)
        const newInvKey = this.invKey(state.inventory);
        if (newInvKey !== this.prevInvKey) {
            this.emit({
                type: 'inv_change',
                totalSlots: state.inventory.length,
            });
            this.prevInvKey = newInvKey;
        }
    }

    private invKey(inv: InventoryItem[]): string {
        return inv.map(i => `${i.id}:${i.count}`).join(',');
    }
}
