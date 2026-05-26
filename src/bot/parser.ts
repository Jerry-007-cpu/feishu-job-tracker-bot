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
 * 将 YYYY-MM-DD / YYYY-M-D / YYYY/MM/DD / 等日期字符串转成 Unix 毫秒时间戳
 * Bitable 的日期字段要求 number 类型
 * 解析失败返回 null
 */
export function parseDateToMs(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  // 已经是数字（容错，例如模型抽抽风返回 timestamp 字符串）
  if (/^\d{10,13}$/.test(s)) {
    const n = parseInt(s, 10);
    return n < 1e12 ? n * 1000 : n; // 10 位秒级补成毫秒
  }

  // 匹配 YYYY[-/.]M[M][-/.]D[D]
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);

  if (year < 1970 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // 使用 UTC 中午 12 点构造，避开时区导致前后差一天
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.getTime();
}

/**
 * 将解析出的字段转换成 Bitable 写入格式
 * 日期字段需要把 YYYY-MM-DD 字符串转成毫秒时间戳
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
    const ms = parseDateToMs(fields['对应日期']);
    if (ms !== null) {
      result['对应日期'] = ms; // Bitable 要求 number（毫秒时间戳）
    }
    // 解析失败就直接跳过，避免触发 DatetimeFieldConvFail
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

/** 生成字段变更文本
 *
 * 走 formatFieldValue 统一格式化：
 * - 对应日期（ms 时间戳）→ YYYY-MM-DD
 * - 数组 / 对象 → 取 text/name/value
 * - 其他 → 原样
 */
export function formatFieldChanges(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${formatFieldValue(v)}`)
    .join('\n');
}

/** 检查文本是否为确认回复 */
export function isConfirmResponse(text: string): boolean {
  return /^(确认|是的|对|嗯|是|ok|y|yes)$/i.test(text.trim());
}

/** 检查文本是否为取消回复 */
export function isCancelResponse(text: string): boolean {
  return /^(取消|不要了?|算了|不|no|cancel)$/i.test(text.trim());
}

/**
 * 检查文本是否为序号选择回复
 * 支持：1 / 2 / 第一个 / 第二 / 第三个 / 一 / 二 / 首个 / 第1 / 第1个
 */
export function isSelectResponse(text: string): boolean {
  return parseSelectIndex(text) !== null;
}

/**
 * 把序号回复解析成 1-based 整数（找不到返回 null）
 * 例：
 *   "1"        → 1
 *   "第一"      → 1
 *   "第一个"    → 1
 *   "第二"      → 2
 *   "首个"      → 1
 *   "一"        → 1
 *   "第10个"    → 10
 *   "其他"       → null
 */
export function parseSelectIndex(text: string): number | null {
  const t = text.trim();

  // 纯阿拉伯数字
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n > 0 ? n : null;
  }

  // 「第N」「第N个」（N 可以是阿拉伯数字）
  const arabic = t.match(/^第\s*(\d+)\s*(个|条|项)?$/);
  if (arabic) {
    const n = parseInt(arabic[1], 10);
    return n > 0 ? n : null;
  }

  // 首个 / 最后一个
  if (/^首(个|条|项)?$/.test(t)) return 1;

  // 中文数字（一~十），可带"第"和"个/条/项"
  const cnNumMap: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const cn = t.match(/^第?\s*([一二两三四五六七八九十])\s*(个|条|项)?$/);
  if (cn && cnNumMap[cn[1]]) {
    return cnNumMap[cn[1]];
  }

  return null;
}

/**
 * 把 Bitable 返回的字段值（日期可能是 ms 时间戳）格式化成可显示字符串
 * - 日期字段：number（ms）→ YYYY-MM-DD
 * - 数组：取第一个元素的 text/name/value
 * - 其他：String()
 */
export function formatFieldValue(value: unknown): string {
  if (value == null || value === '') return '';

  if (typeof value === 'number') {
    // 启发式：> 10^11 当成毫秒时间戳（约 1973 年以后）
    if (value > 1e11) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return String(obj.text ?? obj.name ?? obj.value ?? '');
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj.text ?? obj.name ?? obj.value ?? JSON.stringify(obj));
  }

  return String(value);
}
