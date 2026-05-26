import { config } from '../config.js';
import { imService } from '../lark/im.js';
import { baseService } from '../lark/base.js';
import { formatFieldValue } from './parser.js';
import type { BitableRecord } from '../types.js';

export const MENU_EVENT_KEYS = {
  agenda: 'preset_agenda',
  today: 'preset_today',
  week: 'preset_week',
  overview: 'preset_overview',
  followup: 'preset_followup',
  help: 'preset_help',
} as const;

const INTERVIEW_PROGRESS = ['群面', '一面', '二面', '三面', 'hr面'];
const OFFER_PROGRESS = ['offer'];
const CLOSED_PROGRESS = ['拒绝', '已拒', '挂', '已挂'];

export const HELP_TEXT = `📖 投递助手 · 使用指南

⏰ 每日定时推送
- 每天 08:00 自动推送「今日待办」

🔘 顶部菜单按钮
- 本周待办 → 本周安排
- 投递总览 → 全部 / 面试中 / 待跟进 / 行动建议

📲 投递信息同步
- 投递鸭小程序，结构化录入投递信息并同步到表格

ℹ️ 机器人不再解析自由文本，发任何消息都不会触发动作`;

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function weekRangeMs(): { startMs: number; endMs: number; startText: string; endText: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const endInclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    startText: formatDate(start),
    endText: formatDate(endInclusive),
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekdayName(dateText: string): string {
  const d = new Date(`${dateText}T12:00:00`);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] ?? '';
}

function progressOf(record: BitableRecord): string {
  return formatFieldValue(record.fields['当前进度']) || '未填进度';
}

function isOffer(progress: string): boolean {
  return OFFER_PROGRESS.includes(progress);
}

function isInterview(progress: string): boolean {
  return INTERVIEW_PROGRESS.includes(progress);
}

function isClosed(progress: string): boolean {
  return CLOSED_PROGRESS.includes(progress);
}

function isFollowup(progress: string): boolean {
  return !isOffer(progress) && !isInterview(progress) && !isClosed(progress);
}

function formatRecordTitle(record: BitableRecord): string {
  const f = record.fields;
  const company = formatFieldValue(f['公司']) || '-';
  const position = formatFieldValue(f['岗位名称']) || '-';
  return `${company} - ${position}`;
}

function formatCompactRecord(record: BitableRecord, includeDate = true): string {
  const progress = progressOf(record);
  const date = formatFieldValue(record.fields['对应日期']);
  return `${formatRecordTitle(record)}${includeDate && date ? ` (${date})` : ''}｜${progress}`;
}

function progressOrder(progress: string): number {
  const order = ['offer', 'hr面', '三面', '二面', '一面', '群面', '初筛', '测评', '投递', '未填进度'];
  const idx = order.indexOf(progress);
  return idx === -1 ? order.length : idx;
}

function buildUpcomingRecords(records: BitableRecord[], startMs: number, endMs: number): BitableRecord[] {
  return records
    .filter((r) => {
      const dateVal = r.fields['对应日期'];
      if (typeof dateVal !== 'number') return false;
      if (dateVal < startMs || dateVal >= endMs) return false;
      return !isOffer(progressOf(r)) && !isClosed(progressOf(r));
    })
    .sort((a, b) => {
      const da = a.fields['对应日期'] as number;
      const db = b.fields['对应日期'] as number;
      return da - db || progressOrder(progressOf(a)) - progressOrder(progressOf(b));
    });
}

function groupLinesByProgress(records: BitableRecord[], limitPerProgress: number): string[] {
  const groups = new Map<string, BitableRecord[]>();
  for (const r of records) {
    const progress = progressOf(r);
    if (!groups.has(progress)) groups.set(progress, []);
    groups.get(progress)!.push(r);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => progressOrder(a) - progressOrder(b))
    .map(([progress, recs]) => {
      const shown = recs.slice(0, limitPerProgress).map((r) => formatRecordTitle(r)).join('、');
      const more = recs.length > limitPerProgress ? `（另有${recs.length - limitPerProgress}条未列出）` : '';
      return `- ${progress}：${shown}${more}`;
    });
}

async function buildAgendaText(): Promise<string> {
  const all = await baseService.listAllRecords(config.base.mainTableId);
  const todayMs = todayStartMs();
  const tomorrowMs = todayMs + 24 * 60 * 60 * 1000;
  const week = weekRangeMs();

  // 前几日已完成：本周一到昨天，凡是有日期的都列出（无论进度）
  const pastInWeek = all
    .filter((r) => {
      const d = r.fields['对应日期'];
      return typeof d === 'number' && d >= week.startMs && d < todayMs;
    })
    .sort((a, b) => (a.fields['对应日期'] as number) - (b.fields['对应日期'] as number));

  // 后几日还未完成：今天到本周日，排除 offer / 拒绝
  const upcomingInWeek = buildUpcomingRecords(all, todayMs, week.endMs);

  const lines: string[] = [
    `🗓️ 本周日程`,
    `${week.startText} ~ ${week.endText}`,
    '',
  ];

  lines.push('✅ 前几日已完成');
  if (pastInWeek.length === 0) {
    lines.push('- 前几日没有日程记录');
  } else {
    lines.push(
      ...pastInWeek.map((r) => {
        const date = formatFieldValue(r.fields['对应日期']);
        const shortDate = date.length >= 10 ? date.slice(5) : date;
        return `- ${shortDate} ${weekdayName(date)} ｜ ${formatRecordTitle(r)} · ${progressOf(r)}`;
      }),
    );
  }

  lines.push('', '⏳ 后几日还未完成');
  if (upcomingInWeek.length === 0) {
    lines.push('- 后几日暂无待办');
  } else {
    lines.push(
      ...upcomingInWeek.map((r) => {
        const date = formatFieldValue(r.fields['对应日期']);
        const shortDate = date.length >= 10 ? date.slice(5) : date;
        return `- ${shortDate} ${weekdayName(date)} ｜ ${formatRecordTitle(r)} · ${progressOf(r)}`;
      }),
    );
  }

  // 行动建议：基于"今天"切片重新计算
  const todayItems = upcomingInWeek.filter((r) => {
    const d = r.fields['对应日期'] as number;
    return d >= todayMs && d < tomorrowMs;
  });
  const interviewToday = todayItems.filter((r) => isInterview(progressOf(r)));
  const advice = interviewToday.length
    ? `优先准备今天 ${interviewToday.length} 个面试：${interviewToday.map(formatRecordTitle).join('、')}`
    : upcomingInWeek.length
      ? `本周还有 ${upcomingInWeek.length} 条待办，记得提前确认时间和材料`
      : '本周已无硬安排，可以集中处理待跟进投递';
  lines.push('', `💡 行动建议：${advice}`);

  return lines.join('\n');
}

async function buildOverviewText(): Promise<string> {
  const all = await baseService.listAllRecords(config.base.mainTableId);
  const offer = all.filter((r) => isOffer(progressOf(r)));
  const interview = all.filter((r) => isInterview(progressOf(r)));
  const followup = all.filter((r) => isFollowup(progressOf(r)));

  const lines: string[] = [
    `📊 投递总览`,
    `共 ${all.length} 条 ｜ ${offer.length} offer ｜ ${interview.length} 面试中 ｜ ${followup.length} 待跟进`,
    '',
  ];

  if (offer.length > 0) {
    lines.push('🏆 Offer');
    lines.push(...groupLinesByProgress(offer, 4));
    lines.push('');
  }

  lines.push('🎤 面试中');
  if (interview.length === 0) {
    lines.push('- 暂无面试中的记录');
  } else {
    lines.push(...groupLinesByProgress(interview, 4));
  }
  lines.push('');

  lines.push('📮 待跟进');
  if (followup.length === 0) {
    lines.push('- 暂无待跟进记录');
  } else {
    lines.push(...groupLinesByProgress(followup, 4));
  }

  const stale = pickStaleFollowups(followup);
  const advice = stale.length
    ? `建议优先跟进 ${stale.length} 条超过 7 天未更新或日期缺失的记录，先处理 ${stale.slice(0, 2).map(formatRecordTitle).join('、')}`
    : followup.length
      ? `还有 ${followup.length} 条待跟进，可以按投递时间逐条推进`
      : interview.length
        ? '当前重点在面试推进，优先准备最近的面试'
        : '可以继续补充新的投递记录';
  lines.push('', `🚀 行动建议：${advice}`);

  return lines.join('\n');
}

function pickStaleFollowups(records: BitableRecord[]): BitableRecord[] {
  const now = todayStartMs();
  const staleAfterMs = 7 * 24 * 60 * 60 * 1000;
  return records
    .filter((r) => {
      const dateVal = r.fields['对应日期'];
      return typeof dateVal !== 'number' || now - dateVal >= staleAfterMs;
    })
    .sort((a, b) => {
      const da = typeof a.fields['对应日期'] === 'number' ? a.fields['对应日期'] as number : 0;
      const db = typeof b.fields['对应日期'] === 'number' ? b.fields['对应日期'] as number : 0;
      return da - db;
    });
}

async function buildFollowupText(): Promise<string> {
  const all = await baseService.listAllRecords(config.base.mainTableId);
  const followup = all.filter((r) => isFollowup(progressOf(r)));
  const stale = pickStaleFollowups(followup).slice(0, 10);

  if (stale.length === 0) {
    return '暂时没有明显需要跟进的记录。';
  }

  return `⏳ 需要跟进\n\n${stale
    .map((r, i) => `${i + 1}. ${formatCompactRecord(r)}`)
    .join('\n')}\n\n🔥 行动建议：先处理日期最早或未填日期的记录`;
}

export async function buildMenuPresetText(eventKey: string): Promise<string> {
  switch (eventKey) {
    case MENU_EVENT_KEYS.agenda:
    case MENU_EVENT_KEYS.today:
    case MENU_EVENT_KEYS.week:
      return buildAgendaText();
    case MENU_EVENT_KEYS.overview:
      return buildOverviewText();
    case MENU_EVENT_KEYS.followup:
      // 兼容旧菜单 ID：需要跟进已经合并进投递总览。
      return buildOverviewText();
    case MENU_EVENT_KEYS.help:
      return HELP_TEXT;
    default:
      return `未识别的菜单事件：${eventKey}`;
  }
}

export async function handleBotMenuEvent(openId: string, eventKey: string): Promise<void> {
  let waitingSent = false;
  const waitingTimer = setTimeout(() => {
    waitingSent = true;
    imService.sendMessage(openId, '正在查询中，请稍等...').catch((err) => {
      console.error('[menu] send waiting message failed:', err);
    });
  }, 800);

  const text = await buildMenuPresetText(eventKey);
  clearTimeout(waitingTimer);
  if (waitingSent) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await imService.sendMessage(openId, text);
}
