import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from './config.js';
import { handleBotMenuEvent } from './bot/menu.js';
import { recordPushTarget } from './bot/push_target.js';
import { startDailyAgendaScheduler } from './bot/scheduler.js';
import { looksLikePastePayload, parsePastePayload } from './bot/paste_parser.js';
import { buildBitableFields, formatFieldValue } from './bot/parser.js';
import { baseService } from './lark/base.js';
import { imService } from './lark/im.js';
import { eventDedupe } from './utils/dedupe.js';
import type { BotMenuEvent, MessageReceiveEvent } from './types.js';

/** 从消息 content 抽出纯文本（去掉群聊 @ 占位符）。 */
function extractText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    const raw = parsed.text ?? '';
    return raw.replace(/@_user_\d+/g, '').trim();
  } catch {
    return content.trim();
  }
}

/** 处理小程序粘贴：解析多行 KV → 直接建记录 → 回复结果。 */
async function handlePastePayload(messageId: string, text: string): Promise<void> {
  const parsed = parsePastePayload(text);
  if (!parsed.ok) {
    await imService.replyMessage(
      messageId,
      `❌ 缺少必填字段：${parsed.missing.join('、')}\n\n请回小程序确认后重新粘贴`,
    );
    return;
  }

  const bitableFields = buildBitableFields(parsed.fields);
  try {
    const record = await baseService.createRecord(config.base.mainTableId, bitableFields);
    const company = formatFieldValue(record.fields['公司']);
    const position = formatFieldValue(record.fields['岗位名称']);
    const progress = formatFieldValue(record.fields['当前进度']) || '未填进度';
    await imService.replyMessage(
      messageId,
      `✅ 已创建：${company} - ${position} · ${progress}\n\n如有误请到多维表格里手动删除该行`,
    );
  } catch (err) {
    await imService.replyMessage(
      messageId,
      `❌ 创建失败：${(err as Error).message}`,
    );
  }
}

/**
 * 文本消息处理：纯菜单驱动 + 小程序粘贴写入。
 *
 * 规则：
 * - 仅当文本同时含「公司：」和「岗位名称：」时，按小程序粘贴格式解析并写入主表
 * - 其他自由文本一律不响应（保留菜单驱动原则）
 * - 顺带把发送者 open_id 记下，作为每日定时推送目标
 */
async function handleMessageEvent(event: MessageReceiveEvent): Promise<void> {
  const message = event.message;
  if (message.message_type !== 'text') return;

  const openId = event.sender.sender_id.open_id;
  if (openId) {
    recordPushTarget(openId).catch((err) => {
      console.error('[ws] recordPushTarget failed:', err);
    });
  }

  const text = extractText(message.content);
  if (!text) return;

  if (looksLikePastePayload(text)) {
    await handlePastePayload(message.message_id, text);
  }
  // 不像粘贴 → 静默忽略
}

const wsClient = new Lark.WSClient({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  domain: Lark.Domain.Feishu,
  loggerLevel: Lark.LoggerLevel.info,
});

const eventDispatcher = new Lark.EventDispatcher({}).register({
  'im.message.receive_v1': (data) => {
    const eventId = data.message.message_id;
    if (!eventDedupe.checkAndMark(eventId)) {
      return;
    }

    console.log(`[ws] received text message ${data.message.message_id}`);
    handleMessageEvent(data as MessageReceiveEvent).catch((err) => {
      console.error('[ws] handleMessageEvent failed:', err);
    });
  },

  /**
   * 多维表格记录变更事件（飞书 App / 网页端等外部入口修改了表）
   *
   * payload 大致结构（来自飞书文档）：
   *   { file_token, table_id, revision, action_list: [{ action, record_id, ... }] }
   *
   * 我们不关心具体改了哪几条 —— 防抖触发一次全表 refresh，简单可靠。
   * 多条变更在 debounceMs 内只会触发一次拉取。
   */
  'drive.file.bitable_record_changed_v1': (data: unknown) => {
    console.log('[ws] bitable record changed → schedule cache refresh', data);
    baseService.scheduleMainTableRefresh();
  },

  'application.bot.menu_v6': (data) => {
    const event = data as BotMenuEvent;
    const openId = event.operator?.operator_id?.open_id;
    const eventKey = event.event_key;
    if (!openId || !eventKey) {
      console.warn('[ws] invalid bot menu event:', data);
      return;
    }

    console.log(`[ws] bot menu clicked: ${eventKey}`);
    // 顺便记下 open_id 作为推送目标
    recordPushTarget(openId).catch((err) => {
      console.error('[ws] recordPushTarget failed:', err);
    });
    handleBotMenuEvent(openId, eventKey).catch((err) => {
      console.error('[ws] handleBotMenuEvent failed:', err);
    });
  },
});

console.log('🚀 Feishu bot long connection starting...');
console.log('   Subscription mode: 使用长连接接收事件');
console.log('   Click bot menu or paste structured application text in Feishu after ready.');

await wsClient.start({ eventDispatcher });

// 启动每日待办定时推送（默认 08:00，可用 DAILY_PUSH_HOUR / DAILY_PUSH_MINUTE 调整）
startDailyAgendaScheduler();

// 启动成功后预热主表缓存（失败不影响 ws 运行；首次查询会自己懒加载）
baseService
  .prewarmMainTable()
  .then(() => {
    console.log(`✅ 主表缓存预热完成（${baseService.getMainTableCacheSize()} 条记录）`);
  })
  .catch((err) => {
    console.error('[ws] 主表缓存预热失败（将在首次查询时懒加载）:', (err as Error).message);
  });
