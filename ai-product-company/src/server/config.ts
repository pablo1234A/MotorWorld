import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Minimal .env loader (no dependency). Real environment variables always win. */
function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function which(bin: string): string | null {
  try {
    return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

function detectFont(): string | null {
  const candidates = [
    '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf',
    '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    const out = execFileSync('fc-match', ['-f', '%{file}', 'sans:bold'], { encoding: 'utf8' }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* fc-match not available */
  }
  return null;
}

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  mediaDir: string;
  dbFile: string;
  cookieSecure: boolean;
  anthropicApiKey: string | null;
  llmModel: string;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  fontFile: string | null;
  shopifyDomain: string | null;
  shopifyToken: string | null;
  isTest: boolean;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadDotEnv();
  const env = process.env;
  const dataDir = path.resolve(overrides.dataDir ?? env.DATA_DIR ?? './data');
  const cfg: AppConfig = {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    dataDir,
    mediaDir: path.join(dataDir, 'media'),
    dbFile: path.join(dataDir, 'company.db'),
    cookieSecure: env.COOKIE_SECURE === 'true',
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    llmModel: env.LLM_MODEL?.trim() || 'claude-opus-5-5',
    ffmpegPath: env.FFMPEG_PATH?.trim() || which('ffmpeg'),
    ffprobePath: env.FFPROBE_PATH?.trim() || which('ffprobe'),
    fontFile: env.FONT_FILE?.trim() || detectFont(),
    shopifyDomain: env.SHOPIFY_STORE_DOMAIN?.trim() || null,
    shopifyToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() || null,
    isTest: env.VITEST === 'true' || env.NODE_ENV === 'test',
    ...overrides,
  };
  cfg.mediaDir = path.join(cfg.dataDir, 'media');
  if (!overrides.dbFile) cfg.dbFile = path.join(cfg.dataDir, 'company.db');
  fs.mkdirSync(cfg.mediaDir, { recursive: true });
  return cfg;
}
