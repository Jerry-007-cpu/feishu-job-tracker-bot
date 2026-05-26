import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * 推送目标持久化（每日定时推送用）。
 *
 * 设计：
 * - 只有一个 owner（这是单用户求职跟踪 bot），所以只存最近一次跟机器人交互的 open_id。
 * - 文件落在 process.cwd()/data/push_target.json，launchd plist 的 WorkingDirectory
 *   是 lark-bot 根目录，所以等价于 lark-bot/data/push_target.json。
 * - 内存里也缓存一份，热路径不读盘。
 */

const PUSH_TARGET_FILE = path.join(process.cwd(), 'data', 'push_target.json');

interface PushTargetFile {
  openId: string;
  updatedAt: string;
}

let cached: string | null = null;
let initialized = false;

async function ensureLoaded(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const raw = await fs.readFile(PUSH_TARGET_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PushTargetFile;
    if (parsed?.openId) {
      cached = parsed.openId;
      console.log(`[push_target] loaded existing target: ${cached}`);
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') {
      console.warn('[push_target] load failed:', e.message);
    }
  }
}

/**
 * 记录新的推送目标。
 *
 * 当前策略：直接覆盖（单用户场景）。如果以后要支持多人，把这改成 array+upsert 即可。
 * 同 open_id 重复调用会跳过写盘以避免 IO 浪费。
 */
export async function recordPushTarget(openId: string): Promise<void> {
  if (!openId) return;
  await ensureLoaded();
  if (cached === openId) return;
  cached = openId;
  try {
    await fs.mkdir(path.dirname(PUSH_TARGET_FILE), { recursive: true });
    const payload: PushTargetFile = {
      openId,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(PUSH_TARGET_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[push_target] recorded new target: ${openId}`);
  } catch (err) {
    console.error('[push_target] persist failed:', (err as Error).message);
  }
}

/**
 * 获取当前推送目标。
 *
 * 返回 null 表示还没有人跟机器人说过话——这种情况下定时推送应当跳过。
 */
export async function getPushTarget(): Promise<string | null> {
  await ensureLoaded();
  return cached;
}
