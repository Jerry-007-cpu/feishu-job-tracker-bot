import type { ParsedCreateCommand, ParsedUpdateCommand, ParsedQueryCommand, FieldKey } from '../types.js';
import { FIELD_KEYS_BY_LENGTH, FIELD_NAME_MAP } from '../types.js';

/** 去掉命令前的 / 前缀和命令本身，返回剩余参数文本 */
function stripCommand(input: string): string {
  return input.trim().replace(/^[/]?(?:创建|更新|查询|帮助)\s*/, '');
}

/**
 * 解析「/命令 ...」中的命令类型
 */
export function detectCommand(text: string): string | null {
  const trimmed = text.trim();
  // 注意：不能用 \b，中文不是 \w 字符
  const match = trimmed.match(/^[/]?(创建|更新|查询|帮助)/);
  return match ? match[1] : null;
}

/**
 * 解析键值参数 token
 * 如「当前进度三面」→ { key: '当前进度', value: '三面' }
 */
function parseFieldToken(token: string): { key: string; value: string } | null {
  for (const prefix of FIELD_KEYS_BY_LENGTH) {
    if (token.startsWith(prefix)) {
      const value = token.slice(prefix.length).trim();
      const mappedKey = FIELD_NAME_MAP[prefix];
      return { key: mappedKey, value };
    }
  }
  return null;
}

/**
 * 解析 /创建 命令
 * 格式: /创建 <公司> <岗位名称> [参数...]
 * 参数: 当前进度XX / 日期YYYY-MM-DD / 平台XX / baseXX / 备注XX
 */
export function parseCreateCommand(text: string): ParsedCreateCommand {
  const body = stripCommand(text);
  const tokens = body.split(/\s+/).filter(Boolean);

  const company = tokens[0] || '';
  const position = tokens[1] || '';
  const fields: ParsedCreateCommand['fields'] = {};

  for (const token of tokens.slice(2)) {
    const parsed = parseFieldToken(token);
    if (parsed) {
      fields[parsed.key as FieldKey] = parsed.value;
    }
  }

  return { company, position, fields };
}

/**
 * 解析 /更新 命令
 * 格式: /更新 <公司> <岗位名称> [参数...]
 */
export function parseUpdateCommand(text: string): ParsedUpdateCommand {
  const body = stripCommand(text);
  const tokens = body.split(/\s+/).filter(Boolean);

  const company = tokens[0] || '';
  const position = tokens[1] || '';
  const fields: ParsedUpdateCommand['fields'] = {};

  for (const token of tokens.slice(2)) {
    const parsed = parseFieldToken(token);
    if (parsed) {
      fields[parsed.key as FieldKey] = parsed.value;
    }
  }

  return { company, position, fields };
}

/**
 * 解析 /查询 命令
 * 格式: /查询 <公司> [<岗位名称>]
 */
export function parseQueryCommand(text: string): ParsedQueryCommand {
  const body = stripCommand(text);
  const tokens = body.split(/\s+/).filter(Boolean);

  return {
    company: tokens[0] || '',
    position: tokens[1] || undefined,
  };
}

/**
 * 将解析出的字段转换成 Bitable 写入格式
 * 日期字段需要特殊处理
 */
export function buildBitableFields(
  fields: Partial<Record<FieldKey, string>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (fields['公司']) result['公司'] = fields['公司'];
  if (fields['岗位名称']) result['岗位名称'] = fields['岗位名称'];
  if (fields['当前进度']) result['当前进度'] = fields['当前进度'];
  if (fields['平台']) result['平台'] = fields['平台'];
  if (fields['base']) result['base'] = fields['base'];
  if (fields['备注']) result['备注'] = fields['备注'];
  if (fields['对应日期']) {
    // 格式 YYYY-MM-DD
    result['对应日期'] = fields['对应日期'];
  }

  return result;
}

/** 生成记录摘要文本 */
export function formatRecordSummary(
  company: string,
  position: string,
  progress: string | null,
): string {
  return `${company} - ${position}${progress ? `（${progress}）` : ''}`;
}

/** 生成字段变更文本 */
export function formatFieldChanges(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/** 检查文本是否为确认回复 */
export function isConfirmResponse(text: string): boolean {
  return /^(确认|是的|对|嗯|是|y|yes)$/i.test(text.trim());
}

/** 检查文本是否为数字选择回复 */
export function isSelectResponse(text: string): boolean {
  return /^\d+$/.test(text.trim());
}
