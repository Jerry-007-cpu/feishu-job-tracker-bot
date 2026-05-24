import { describe, it, expect } from 'vitest';
import {
  detectCommand,
  parseCreateCommand,
  parseUpdateCommand,
  parseQueryCommand,
  isConfirmResponse,
  isSelectResponse,
  buildBitableFields,
} from '../src/bot/parser.js';

describe('detectCommand', () => {
  it('识别带斜杠的命令', () => {
    expect(detectCommand('/创建 携程 产品经理')).toBe('创建');
    expect(detectCommand('/更新 携程 产品经理')).toBe('更新');
    expect(detectCommand('/查询 携程')).toBe('查询');
    expect(detectCommand('/帮助')).toBe('帮助');
  });

  it('识别不带斜杠的命令', () => {
    expect(detectCommand('创建 携程 产品经理')).toBe('创建');
    expect(detectCommand('查询 携程')).toBe('查询');
  });

  it('非命令文本返回 null', () => {
    expect(detectCommand('你好')).toBeNull();
    expect(detectCommand('confirm')).toBeNull();
  });
});

describe('parseCreateCommand', () => {
  it('解析完整参数（紧贴写法）', () => {
    const r = parseCreateCommand(
      '/创建 携程 产品经理 当前进度三面 日期2026-05-25 平台官网 base上海 备注约了面试',
    );
    expect(r.company).toBe('携程');
    expect(r.position).toBe('产品经理');
    expect(r.fields['当前进度']).toBe('三面');
    expect(r.fields['对应日期']).toBe('2026-05-25');
    expect(r.fields['平台']).toBe('官网');
    expect(r.fields['base']).toBe('上海');
    expect(r.fields['备注']).toBe('约了面试');
  });

  it('支持顺序无关', () => {
    const r = parseCreateCommand('/创建 字节 客户端开发 base深圳 平台Boss 当前进度一面');
    expect(r.company).toBe('字节');
    expect(r.position).toBe('客户端开发');
    expect(r.fields['base']).toBe('深圳');
    expect(r.fields['平台']).toBe('Boss');
    expect(r.fields['当前进度']).toBe('一面');
  });

  it('字段可缺省', () => {
    const r = parseCreateCommand('/创建 网易 数据分析');
    expect(r.company).toBe('网易');
    expect(r.position).toBe('数据分析');
    expect(r.fields['当前进度']).toBeUndefined();
  });

  it('不带斜杠也能解析', () => {
    const r = parseCreateCommand('创建 美团 后端 当前进度二面');
    expect(r.company).toBe('美团');
    expect(r.position).toBe('后端');
    expect(r.fields['当前进度']).toBe('二面');
  });
});

describe('parseUpdateCommand', () => {
  it('解析更新命令', () => {
    const r = parseUpdateCommand('/更新 携程 产品经理 当前进度hr面 日期2026-06-01');
    expect(r.company).toBe('携程');
    expect(r.position).toBe('产品经理');
    expect(r.fields['当前进度']).toBe('hr面');
    expect(r.fields['对应日期']).toBe('2026-06-01');
  });
});

describe('parseQueryCommand', () => {
  it('只给公司', () => {
    const r = parseQueryCommand('/查询 携程');
    expect(r.company).toBe('携程');
    expect(r.position).toBeUndefined();
  });

  it('公司 + 岗位', () => {
    const r = parseQueryCommand('/查询 携程 产品经理');
    expect(r.company).toBe('携程');
    expect(r.position).toBe('产品经理');
  });
});

describe('isConfirmResponse', () => {
  it('识别确认词', () => {
    expect(isConfirmResponse('确认')).toBe(true);
    expect(isConfirmResponse('yes')).toBe(true);
    expect(isConfirmResponse('Y')).toBe(true);
  });

  it('其他文本不视为确认', () => {
    expect(isConfirmResponse('确认一下')).toBe(false);
    expect(isConfirmResponse('好的吧')).toBe(false);
    expect(isConfirmResponse('/创建 携程')).toBe(false);
  });
});

describe('isSelectResponse', () => {
  it('纯数字视为选择', () => {
    expect(isSelectResponse('1')).toBe(true);
    expect(isSelectResponse('  3  ')).toBe(true);
  });

  it('非纯数字不视为选择', () => {
    expect(isSelectResponse('a1')).toBe(false);
    expect(isSelectResponse('1.5')).toBe(false);
    expect(isSelectResponse('')).toBe(false);
  });
});

describe('buildBitableFields', () => {
  it('只输出有值字段', () => {
    const r = buildBitableFields({
      公司: '携程',
      岗位名称: '产品经理',
      当前进度: '三面',
    });
    expect(r).toEqual({
      公司: '携程',
      岗位名称: '产品经理',
      当前进度: '三面',
    });
  });

  it('空对象返回空对象', () => {
    expect(buildBitableFields({})).toEqual({});
  });
});
