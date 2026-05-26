import type { FieldKey } from '../types.js';

/**
 * 小程序「投递信息」粘贴解析器
 *
 * 期望输入格式（一行一个字段，全/半角冒号都支持，行序无关）：
 *
 *   公司：快手
 *   岗位名称：产品经理
 *   当前进度：投递
 *   平台：邮件
 *   base：未填写
 *   对应日期：2026-05-29
 *   备注：朋友内推
 *
 * 设计原则：
 * - 严格白名单字段，非白名单的行直接忽略，不报错
 * - 值为「未填写」「未填」「无」「none」「N/A」（大小写不敏感）一律视为空
 * - 公司 + 岗位名称 是必填，缺一个则返回 missing 列表，由上层提示用户
 */

const FIELD_ALIASES: Record<string, FieldKey> = {
  公司: '公司',
  岗位名称: '岗位名称',
  岗位: '岗位名称', // 容错：用户可能简写
  当前进度: '当前进度',
  进度: '当前进度', // 容错
  平台: '平台',
  base: 'base',
  Base: 'base',
  BASE: 'base',
  备注: '备注',
  对应日期: '对应日期',
  日期: '对应日期', // 容错
};

const EMPTY_VALUES = new Set(['未填写', '未填', '无', 'none', 'n/a', 'na', '-', '空']);

export interface PasteParseResult {
  ok: boolean;
  fields: Partial<Record<FieldKey, string>>;
  missing: FieldKey[];
}

/**
 * 判断一段文本是否「看起来像」小程序粘贴出来的投递信息。
 * 触发条件：同时出现「公司：」和「岗位名称：」（半/全角冒号都行）。
 *
 * 这个判定刻意严格——避免普通聊天文本误触。
 */
export function looksLikePastePayload(text: string): boolean {
  const normalized = text.replace(/：/g, ':');
  return /(^|\n)\s*公司\s*:/.test(normalized) && /(^|\n)\s*岗位名称\s*:/.test(normalized);
}

export function parsePastePayload(text: string): PasteParseResult {
  const fields: Partial<Record<FieldKey, string>> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // 把全角冒号统一成半角，便于 split
    const normalized = line.replace(/：/g, ':');
    const colonIdx = normalized.indexOf(':');
    if (colonIdx <= 0) continue;

    const key = normalized.slice(0, colonIdx).trim();
    const value = normalized.slice(colonIdx + 1).trim();

    const fieldKey = FIELD_ALIASES[key];
    if (!fieldKey) continue;

    if (!value) continue;
    if (EMPTY_VALUES.has(value.toLowerCase())) continue;

    fields[fieldKey] = value;
  }

  const missing: FieldKey[] = [];
  if (!fields['公司']) missing.push('公司');
  if (!fields['岗位名称']) missing.push('岗位名称');

  return {
    ok: missing.length === 0,
    fields,
    missing,
  };
}
