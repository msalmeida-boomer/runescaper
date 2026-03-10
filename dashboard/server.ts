// Dashboard Server - Serves telemetry data and UI
// Usage: bun dashboard/server.ts

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const PORT = 3333;
const PROJECT_ROOT = join(import.meta.dir, '..');
const BOTS_DIR = join(PROJECT_ROOT, 'bots');

// ============ Data Discovery ============

interface RunInfo {
    filename: string;
    startTime: number;
    hasSummary: boolean;
    summary: any | null;
}

function discoverBots(): string[] {
    if (!existsSync(BOTS_DIR)) return [];
    return readdirSync(BOTS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .filter(e => existsSync(join(BOTS_DIR, e.name, 'runs')))
        .map(e => e.name);
}

function discoverRuns(botName: string): RunInfo[] {
    const runsDir = join(BOTS_DIR, botName, 'runs');
    if (!existsSync(runsDir)) return [];

    return readdirSync(runsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
            const filename = f.replace('.jsonl', '');
            const summaryPath = join(runsDir, filename + '.json');
            const hasSummary = existsSync(summaryPath);
            let summary = null;
            if (hasSummary) {
                try { summary = JSON.parse(readFileSync(summaryPath, 'utf-8')); } catch {}
            }
            // Parse start time from filename (ISO-ish format)
            const startTime = summary?.startTime || parseFilenameTime(filename);
            return { filename, startTime, hasSummary, summary };
        })
        .sort((a, b) => b.startTime - a.startTime);
}

function parseFilenameTime(filename: string): number {
    // Format: 2026-03-10T14-30-00
    try {
        const iso = filename.replace(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4');
        return new Date(iso).getTime();
    } catch {
        return 0;
    }
}

function parseJsonl(path: string): any[] {
    try {
        const content = readFileSync(path, 'utf-8').trim();
        if (!content) return [];
        return content.split('\n').map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
    } catch {
        return [];
    }
}

// ============ Server ============

const htmlPath = join(import.meta.dir, 'index.html');

Bun.serve({
    port: PORT,
    fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        // Serve dashboard HTML
        if (path === '/' || path === '/index.html') {
            if (!existsSync(htmlPath)) {
                return new Response('Dashboard HTML not found', { status: 404 });
            }
            return new Response(readFileSync(htmlPath, 'utf-8'), {
                headers: { 'Content-Type': 'text/html' },
            });
        }

        // API: List all bots with run counts
        if (path === '/api/bots') {
            const bots = discoverBots().map(name => ({
                name,
                runCount: discoverRuns(name).length,
            }));
            return Response.json(bots);
        }

        // API: Overview - all runs across all bots
        if (path === '/api/overview') {
            const bots = discoverBots();
            const allRuns: any[] = [];
            for (const botName of bots) {
                const runs = discoverRuns(botName);
                for (const run of runs) {
                    allRuns.push({
                        botName,
                        ...run,
                        // If no summary, try to derive basic info from JSONL
                        ...(!run.summary ? deriveFromJsonl(botName, run.filename) : {}),
                    });
                }
            }
            allRuns.sort((a, b) => b.startTime - a.startTime);
            return Response.json(allRuns);
        }

        // API: Runs for a specific bot
        const runsMatch = path.match(/^\/api\/runs\/([^/]+)$/);
        if (runsMatch) {
            const botName = decodeURIComponent(runsMatch[1]);
            return Response.json(discoverRuns(botName));
        }

        // API: Full run data (events + summary)
        const runMatch = path.match(/^\/api\/run\/([^/]+)\/([^/]+)$/);
        if (runMatch) {
            const botName = decodeURIComponent(runMatch[1]);
            const filename = decodeURIComponent(runMatch[2]);
            const jsonlPath = join(BOTS_DIR, botName, 'runs', filename + '.jsonl');
            const summaryPath = join(BOTS_DIR, botName, 'runs', filename + '.json');

            if (!existsSync(jsonlPath)) {
                return Response.json({ error: 'Run not found' }, { status: 404 });
            }

            const events = parseJsonl(jsonlPath);
            let summary = null;
            if (existsSync(summaryPath)) {
                try { summary = JSON.parse(readFileSync(summaryPath, 'utf-8')); } catch {}
            }

            return Response.json({ events, summary });
        }

        return new Response('Not found', { status: 404 });
    },
});

function deriveFromJsonl(botName: string, filename: string): any {
    const jsonlPath = join(BOTS_DIR, botName, 'runs', filename + '.jsonl');
    const events = parseJsonl(jsonlPath);
    if (events.length === 0) return {};

    const first = events[0];
    const last = events[events.length - 1];
    const runEnd = events.find(e => e.type === 'run_end');

    return {
        summary: {
            botName,
            goal: first.goal,
            startTime: first.ts,
            endTime: last.ts,
            durationMs: last.ts - first.ts,
            outcome: runEnd?.outcome || 'in_progress',
            message: runEnd?.message,
            eventCount: events.length,
            // Derive XP from xp_gain events
            ...deriveXpStats(events, first.ts, last.ts),
        },
    };
}

function deriveXpStats(events: any[], startTime: number, endTime: number) {
    const skillXp: Record<string, number> = {};
    let totalXpGained = 0;
    const durationMs = endTime - startTime;

    for (const e of events) {
        if (e.type === 'xp_gain') {
            skillXp[e.skill] = (skillXp[e.skill] || 0) + e.xpGained;
            totalXpGained += e.xpGained;
        }
    }

    const xpPerMinute: Record<string, number> = {};
    const minutes = durationMs / 60000;
    for (const [skill, xp] of Object.entries(skillXp)) {
        xpPerMinute[skill] = minutes > 0 ? Math.round(xp / minutes) : 0;
    }

    return { totalXpGained, xpPerMinute, skillDeltas: {} };
}

console.log(`Dashboard running at http://localhost:${PORT}`);
