import { describe, expect, it } from 'vitest';
import { looksLikePastePayload, parsePastePayload } from '../src/bot/paste_parser.js';

describe('looksLikePastePayload', () => {
  it('只有同时包含公司和岗位名称才触发', () => {
    expect(looksLikePastePayload('公司：携程\n岗位名称：产品经理')).toBe(true);
    expect(looksLikePastePayload('公司: 携程\n岗位名称: 产品经理')).toBe(true);
    expect(looksLikePastePayload('公司：携程\n岗位：产品经理')).toBe(false);
  });
});

describe('parsePastePayload', () => {
  it('解析小程序粘贴出来的投递信息', () => {
    const result = parsePastePayload([
      '公司：携程',
      '岗位名称：产品经理',
      '当前进度：三面',
      '平台：官网',
      'base：上海',
      '对应日期：2026-05-25',
      '备注：约了面试',
    ].join('\n'));

    expect(result).toEqual({
      ok: true,
      missing: [],
      fields: {
        公司: '携程',
        岗位名称: '产品经理',
        当前进度: '三面',
        平台: '官网',
        base: '上海',
        对应日期: '2026-05-25',
        备注: '约了面试',
      },
    });
  });

  it('忽略空值和非白名单字段', () => {
    const result = parsePastePayload('公司：快手\n岗位名称：策略产品经理\n备注：未填写\n链接：https://example.com');

    expect(result.ok).toBe(true);
    expect(result.fields).toEqual({
      公司: '快手',
      岗位名称: '策略产品经理',
    });
  });

  it('缺少必填字段时返回 missing', () => {
    const result = parsePastePayload('公司：快手\n当前进度：一面');

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['岗位名称']);
  });
});
