import { config } from '../config.js';
import { BaseService } from '../lark/base.js';
import { imService } from '../lark/im.js';
import { sessionStore } from './session.js';
import {
  parseCreateCommand,
  parseUpdateCommand,
  parseQueryCommand,
  buildBitableFields,
  formatRecordSummary,
  formatFieldChanges,
  isConfirmResponse,
  isSelectResponse,
} from './parser.js';

const baseService = new BaseService(config.base.token);

/** /帮助 */
async function handleHelp(openId: string, messageId: string): Promise<void> {
  await imService.replyMessage(messageId,
`📋 可用命令：

/创建 <公司> <岗位> [参数...]
  示例：/创建 携程 产品经理 当前进度三面 日期2026-05-25 平台官网 base上海 备注约了面试

/更新 <公司> <岗位> [参数...]
  示例：/更新 携程 产品经理 当前进度hr面

/查询 <公司> [<岗位>]
  示例：/查询 携程

/帮助
  显示此帮助

参数说明：
  当前进度：投递 / 测评 / 初筛 / 群面 / 一面 / 二面 / 三面 / hr面 / offer
  日期：YYYY-MM-DD
  平台：官网 / 牛客 / Boss / 内推 / 公众号 / 邮件 / 其他
  base：北京 / 上海 / 杭州 / 深圳 / 南京 / 广州 / 成都 / 迪拜 / 天津`);
}

/** /查询 */
async function handleQuery(openId: string, messageId: string, text: string): Promise<void> {
  const parsed = parseQueryCommand(text);

  if (!parsed.company) {
    await imService.replyMessage(messageId, '请指定公司名，格式：/查询 <公司> [<岗位>]');
    return;
  }

  const records = await baseService.searchByCompanyAndPosition(
    config.base.mainTableId,
    parsed.company,
    parsed.position,
  );

  if (records.length === 0) {
    await imService.replyMessage(messageId, `未找到"${parsed.company}${parsed.position ? ' ' + parsed.position : ''}"的相关记录`);
    return;
  }

  if (records.length > 5) {
    // 记录太多，仅简要列出
    const lines = records.slice(0, 5).map((r, i) =>
      `${i + 1}. ${formatRecordSummary(
        String(r.fields['公司'] ?? ''),
        String(r.fields['岗位名称'] ?? ''),
        String(r.fields['当前进度'] ?? ''),
      )}`
    );
    await imService.replyMessage(messageId,
      `找到 ${records.length} 条记录（仅显示前 5 条）：\n\n${lines.join('\n')}`);
    return;
  }

  // 少于 5 条，展示详情
  const blocks = records.map((r) => {
    const f = r.fields;
    const date = f['对应日期'] ? `日期：${f['对应日期']}` : '';
    const platform = f['平台'] ? `平台：${f['平台']}` : '';
    const base = f['base'] ? `地点：${f['base']}` : '';
    const notes = f['备注'] ? `备注：${f['备注']}` : '';
    return [
      `▸ ${f['公司']} - ${f['岗位名称']}`,
      `  进度：${f['当前进度'] || '-'}`,
      [date, platform, base, notes].filter(Boolean).join(' | '),
    ].filter(Boolean).join('\n');
  });

  await imService.replyMessage(messageId, blocks.join('\n\n'));
}

/** /创建 — 先确认再写入 */
async function handleCreate(openId: string, messageId: string, text: string): Promise<void> {
  const parsed = parseCreateCommand(text);

  if (!parsed.company || !parsed.position) {
    await imService.replyMessage(messageId,
      '请提供公司名称和岗位名称。\n格式：/创建 <公司> <岗位> [参数...]');
    return;
  }

  // 构建要写入的字段
  const fields: Record<string, unknown> = {};
  fields['公司'] = parsed.company;
  fields['岗位名称'] = parsed.position;
  const extraFields = buildBitableFields(parsed.fields);
  Object.assign(fields, extraFields);

  // 存入 session，等待确认
  sessionStore.set(openId, {
    kind: 'confirm_create',
    fields,
  });

  const fieldSummary = formatFieldChanges(fields);
  await imService.replyMessage(messageId,
    `确认创建以下记录？\n\n${fieldSummary}\n\n回复"确认"以创建，或发送其他内容取消`);
}

/** /更新 — 先搜索、再确认 */
async function handleUpdate(openId: string, messageId: string, text: string): Promise<void> {
  const parsed = parseUpdateCommand(text);

  if (!parsed.company || !parsed.position) {
    await imService.replyMessage(messageId,
      '请提供公司名称和岗位名称。\n格式：/更新 <公司> <岗位> [参数...]');
    return;
  }

  // 搜索匹配记录
  const records = await baseService.searchByCompanyAndPosition(
    config.base.mainTableId,
    parsed.company,
    parsed.position,
  );

  if (records.length === 0) {
    await imService.replyMessage(messageId,
      `未找到"${parsed.company} ${parsed.position}"的相关记录，请先使用 /创建`);
    return;
  }

  if (records.length === 1) {
    // 唯一匹配，直接进入确认
    const rec = records[0];
    const fields = buildBitableFields(parsed.fields);
    const summary = formatRecordSummary(
      String(rec.fields['公司'] ?? ''),
      String(rec.fields['岗位名称'] ?? ''),
      String(rec.fields['当前进度'] ?? ''),
    );

    sessionStore.set(openId, {
      kind: 'confirm_update',
      recordId: rec.record_id,
      fields,
      summary,
    });

    const changeText = formatFieldChanges(fields);
    await imService.replyMessage(messageId,
      `找到记录：${summary}\n\n将更新以下字段：\n${changeText}\n\n回复"确认"以更新，或发送其他内容取消`);
    return;
  }

  // 多条匹配，让用户选择
  const candidates = records.map((r) => ({
    recordId: r.record_id,
    summary: formatRecordSummary(
      String(r.fields['公司'] ?? ''),
      String(r.fields['岗位名称'] ?? ''),
      String(r.fields['当前进度'] ?? ''),
    ),
  }));

  sessionStore.set(openId, {
    kind: 'select_for_update',
    records: candidates,
    fields: buildBitableFields(parsed.fields),
  });

  const list = candidates.map((c, i) => `${i + 1}. ${c.summary}`).join('\n');
  await imService.replyMessage(messageId,
    `找到多条记录：\n\n${list}\n\n请回复序号选择要更新的记录`);
}

/** 处理「确认」回复 */
async function handleConfirm(openId: string, messageId: string): Promise<void> {
  const session = sessionStore.get(openId);
  if (!session) {
    await imService.replyMessage(messageId, '当前没有待确认的操作');
    return;
  }

  if (session.kind === 'confirm_create') {
    try {
      const record = await baseService.createRecord(config.base.mainTableId, session.fields);
      sessionStore.delete(openId);
      await imService.replyMessage(messageId,
        `✅ 已创建：${record.fields['公司']} - ${record.fields['岗位名称']}`);
    } catch (err) {
      await imService.replyMessage(messageId, `❌ 创建失败：${(err as Error).message}`);
    }
    return;
  }

  if (session.kind === 'confirm_update') {
    try {
      await baseService.updateRecord(config.base.mainTableId, session.recordId, session.fields);
      sessionStore.delete(openId);
      await imService.replyMessage(messageId,
        `✅ 已更新：${session.summary}`);
    } catch (err) {
      await imService.replyMessage(messageId, `❌ 更新失败：${(err as Error).message}`);
    }
    return;
  }

  // 如果当前 session 是 select 状态，确认无效
  await imService.replyMessage(messageId, '请先回复序号选择记录');
}

/** 处理数字选择回复 */
async function handleSelect(openId: string, messageId: string, text: string): Promise<void> {
  const session = sessionStore.get(openId);
  if (!session) {
    await imService.replyMessage(messageId, '当前没有可选择的操作');
    return;
  }

  if (session.kind === 'select_for_update') {
    const idx = parseInt(text.trim(), 10) - 1;
    if (idx < 0 || idx >= session.records.length) {
      await imService.replyMessage(messageId, `请输入 1-${session.records.length} 之间的序号`);
      return;
    }

    const selected = session.records[idx];
    // 转为确认更新状态
    sessionStore.set(openId, {
      kind: 'confirm_update',
      recordId: selected.recordId,
      fields: session.fields,
      summary: selected.summary,
    });

    const changeText = formatFieldChanges(session.fields);
    await imService.replyMessage(messageId,
      `已选择：${selected.summary}\n\n将更新以下字段：\n${changeText}\n\n回复"确认"以更新`);
    return;
  }

  if (session.kind === 'select_for_query') {
    const idx = parseInt(text.trim(), 10) - 1;
    if (idx < 0 || idx >= session.records.length) {
      await imService.replyMessage(messageId, `请输入 1-${session.records.length} 之间的序号`);
      return;
    }

    sessionStore.delete(openId);
    // 这里可以展示选中记录的详情，复用查询逻辑
    await imService.replyMessage(messageId, `已选中：${session.records[idx].summary}`);
    return;
  }

  await imService.replyMessage(messageId, '当前操作不需要选择序号');
}

/** 统一入口：根据文本分发命令 */
export async function dispatchCommand(
  openId: string,
  messageId: string,
  text: string,
): Promise<void> {
  // 先检查是否为对之前操作的回复
  const session = sessionStore.get(openId);
  if (session) {
    if (isConfirmResponse(text)) {
      await handleConfirm(openId, messageId);
      return;
    }
    if (isSelectResponse(text)) {
      await handleSelect(openId, messageId, text);
      return;
    }
    // 非确认/选择回复，取消当前 session
    sessionStore.delete(openId);
    // fallthrough to command parsing
  }

  const trimmed = text.trim();

  if (trimmed.startsWith('帮助') || trimmed === '/帮助') {
    await handleHelp(openId, messageId);
    return;
  }

  if (trimmed.startsWith('创建') || trimmed.startsWith('/创建')) {
    await handleCreate(openId, messageId, trimmed);
    return;
  }

  if (trimmed.startsWith('更新') || trimmed.startsWith('/更新')) {
    await handleUpdate(openId, messageId, trimmed);
    return;
  }

  if (trimmed.startsWith('查询') || trimmed.startsWith('/查询')) {
    await handleQuery(openId, messageId, trimmed);
    return;
  }

  // 未识别的命令
  await imService.replyMessage(messageId,
    `未识别的命令，发送 /帮助 查看可用命令`);
}
