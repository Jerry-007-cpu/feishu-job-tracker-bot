import { imService } from '../lark/im.js';
import { buildMenuPresetText, MENU_EVENT_KEYS } from './menu.js';
import { getPushTarget } from './push_target.js';

/**
 * 每日待办定时推送。
 *
 * 实现：用递归 setTimeout 算下一次触发时刻，避免引入 cron 依赖。
 *
 * 触发时间默认 08:00（本机时区）。可用环境变量覆盖：
 *   DAILY_PUSH_HOUR    0-23，默认 8
 *   DAILY_PUSH_MINUTE  0-59，默认 0
 *   DAILY_PUSH_DISABLE 设为 "1" / "true" 时关闭定时推送
 */

function readHour(): number {
  const raw = process.env.DAILY_PUSH_HOUR;
  const n = raw != null ? parseInt(raw, 10) : 8;
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 8;
}

function readMinute(): number {
  const raw = process.env.DAILY_PUSH_MINUTE;
  const n = raw != null ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 && n <= 59 ? n : 0;
}

function isDisabled(): boolean {
  const raw = (process.env.DAILY_PUSH_DISABLE || '').toLowerCase().trim();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function msUntilNext(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function formatNext(hour: number, minute: number): string {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toLocaleString('zh-CN', { hour12: false });
}

async function runOnce(): Promise<void> {
  const openId = await getPushTarget();
  if (!openId) {
    console.warn('[scheduler] 暂无推送目标（push_target.json 为空），跳过本次推送。请先在飞书里给机器人发任意消息或点一次菜单按钮。');
    return;
  }
  try {
    const text = await buildMenuPresetText(MENU_EVENT_KEYS.agenda);
    await imService.sendMessage(openId, `⏰ 每日待办播报\n\n${text}`);
    console.log(`[scheduler] daily agenda pushed to ${openId}`);
  } catch (err) {
    console.error('[scheduler] push failed:', (err as Error).message);
  }
}

export function startDailyAgendaScheduler(): void {
  if (isDisabled()) {
    console.log('[scheduler] DAILY_PUSH_DISABLE 已设置，跳过每日定时推送。');
    return;
  }
  const hour = readHour();
  const minute = readMinute();

  const schedule = () => {
    const delay = msUntilNext(hour, minute);
    console.log(
      `[scheduler] 下一次每日推送：${formatNext(hour, minute)}（${Math.round(delay / 1000 / 60)} 分钟后）`,
    );
    setTimeout(() => {
      runOnce()
        .catch((err) => console.error('[scheduler] runOnce failed:', err))
        .finally(() => schedule());
    }, delay);
  };

  schedule();
}
