#!/usr/bin/env bun
/**
 * Monitor script: launches bots, watches for crashes/stalls, auto-restarts.
 *
 * Usage:
 *   bun scripts/monitor.ts f99net1 f99net2 f99fly1 f99fly2 f99fly3 f99fly4
 *   bun scripts/monitor.ts --all    # runs all f99* bots
 */

import { spawn, type Subprocess } from 'bun';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const BOTS_DIR = join(ROOT, 'bots');

// Config
const STALL_TIMEOUT = 4 * 60_000;   // 4 min no output = stalled (walks can take 2+ min)
const STARTUP_DELAY = 10_000;       // 10s between bot launches to avoid server overload
const MAX_RESTARTS = 50;            // max restarts per bot (long grinds need lots of retries)
const CHECK_INTERVAL = 30_000;      // check every 30s

interface BotProcess {
    name: string;
    proc: Subprocess | null;
    lastOutput: number;
    restarts: number;
    startedAt: number;
    status: 'running' | 'crashed' | 'stalled' | 'done' | 'max_restarts';
    lastLine: string;
}

const bots = new Map<string, BotProcess>();

function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    console.log(`[Monitor ${ts}] ${msg}`);
}

function getBotNames(): string[] {
    const args = process.argv.slice(2);
    if (args.includes('--all')) {
        return readdirSync(BOTS_DIR)
            .filter(d => (d.startsWith('f99') || d.startsWith('fly99') || d.startsWith('net99')) && existsSync(join(BOTS_DIR, d, 'script.ts')))
            .sort();
    }
    return args.filter(a => !a.startsWith('--'));
}

function launchBot(name: string): Subprocess {
    const scriptPath = join(BOTS_DIR, name, 'script.ts');
    log(`Starting ${name}...`);

    const proc = spawn(['bun', scriptPath], {
        cwd: ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    });

    // Read stdout
    (async () => {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value).trim();
                if (text) {
                    const bot = bots.get(name);
                    if (bot) {
                        bot.lastOutput = Date.now();
                        bot.lastLine = text.split('\n').pop() || '';
                    }
                    // Prefix each line with bot name
                    for (const line of text.split('\n')) {
                        console.log(`  [${name}] ${line}`);
                    }
                }
            }
        } catch {}
    })();

    // Read stderr
    (async () => {
        const reader = proc.stderr.getReader();
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value).trim();
                if (text) {
                    const bot = bots.get(name);
                    if (bot) {
                        bot.lastOutput = Date.now();
                        bot.lastLine = text.split('\n').pop() || '';
                    }
                    for (const line of text.split('\n')) {
                        console.log(`  [${name}] ERR: ${line}`);
                    }
                }
            }
        } catch {}
    })();

    return proc;
}

async function startBot(name: string) {
    const existing = bots.get(name);
    if (existing?.proc) {
        try { existing.proc.kill(); } catch {}
    }

    const proc = launchBot(name);
    const now = Date.now();

    bots.set(name, {
        name,
        proc,
        lastOutput: now,
        restarts: (existing?.restarts ?? 0),
        startedAt: now,
        status: 'running',
        lastLine: '',
    });
}

async function restartBot(name: string, reason: string) {
    const bot = bots.get(name);
    if (!bot) return;

    if (bot.restarts >= MAX_RESTARTS) {
        log(`${name}: Hit max restarts (${MAX_RESTARTS}). Giving up.`);
        bot.status = 'max_restarts';
        return;
    }

    bot.restarts++;
    log(`${name}: Restarting (#${bot.restarts}) — ${reason}`);

    if (bot.proc) {
        try { bot.proc.kill(); } catch {}
    }

    // Small delay before restart
    await Bun.sleep(3000);

    const proc = launchBot(name);
    bot.proc = proc;
    bot.lastOutput = Date.now();
    bot.startedAt = Date.now();
    bot.status = 'running';
}

function checkBots() {
    const now = Date.now();

    for (const [name, bot] of bots) {
        if (bot.status === 'done' || bot.status === 'max_restarts') continue;

        // Check if process exited
        if (bot.proc && bot.proc.exitCode !== null) {
            const exitCode = bot.proc.exitCode;
            if (exitCode === 0) {
                log(`${name}: Completed successfully!`);
                bot.status = 'done';
            } else {
                log(`${name}: Crashed (exit code ${exitCode})`);
                bot.status = 'crashed';
                restartBot(name, `exit code ${exitCode}`);
            }
            continue;
        }

        // Check for stall (no output for STALL_TIMEOUT)
        const silentFor = now - bot.lastOutput;
        if (silentFor > STALL_TIMEOUT) {
            log(`${name}: Stalled (no output for ${Math.round(silentFor / 1000)}s)`);
            bot.status = 'stalled';
            restartBot(name, `no output for ${Math.round(silentFor / 1000)}s`);
        }
    }
}

function printStatus() {
    log('=== Status ===');
    for (const [name, bot] of bots) {
        const uptime = Math.round((Date.now() - bot.startedAt) / 1000);
        const silentFor = Math.round((Date.now() - bot.lastOutput) / 1000);
        const line = bot.lastLine.substring(0, 80);
        log(`  ${name}: ${bot.status} | up ${uptime}s | silent ${silentFor}s | restarts: ${bot.restarts} | ${line}`);
    }
    log('==============');
}

// Main
const botNames = getBotNames();
if (botNames.length === 0) {
    console.log('Usage: bun scripts/monitor.ts <bot1> <bot2> ... or --all');
    process.exit(1);
}

log(`Starting ${botNames.length} bots: ${botNames.join(', ')}`);

// Stagger launches
for (let i = 0; i < botNames.length; i++) {
    await startBot(botNames[i]);
    if (i < botNames.length - 1) {
        log(`Waiting ${STARTUP_DELAY / 1000}s before next bot...`);
        await Bun.sleep(STARTUP_DELAY);
    }
}

log('All bots launched. Monitoring...');

// Status print every 2 min
let checkCount = 0;
setInterval(() => {
    checkBots();
    checkCount++;
    if (checkCount % 4 === 0) { // Every 2 min
        printStatus();
    }
}, CHECK_INTERVAL);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    log('Shutting down all bots...');
    for (const [name, bot] of bots) {
        if (bot.proc) {
            try { bot.proc.kill(); } catch {}
        }
    }
    printStatus();
    process.exit(0);
});

// Keep alive
await new Promise(() => {});
