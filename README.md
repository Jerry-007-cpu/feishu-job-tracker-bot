# Feishu Job Tracker Bot · 飞书投递记录机器人

> 用飞书机器人菜单 + 投递鸭小程序同步求职投递记录。小程序里结构化录入，复制投递信息发给机器人，自动写进你的飞书多维表格。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

<p align="center">
  <a href="https://y00b74dmx5n.feishu.cn/base/RhW5bufmOa4wiLsSmhcc42wKnXf?from=template_center&ccm_open_type=template_center">
    <img alt="一键安装飞书模板" src="https://img.shields.io/badge/%E9%A3%9E%E4%B9%A6%E6%A8%A1%E6%9D%BF-%E4%B8%80%E9%94%AE%E5%AE%89%E8%A3%85-00B96B?style=for-the-badge">
  </a>
</p>

> 点上面按钮，飞书会引导你把这张多维表格**复制到你自己的空间**。复制后会得到一个属于你的新 URL，把这个新 URL 填进 `npm run setup` 即可。

## ✨ 特性

- 🔘 **菜单驱动**：顶部菜单一键查看本周待办、投递总览、帮助说明
- 📲 **小程序同步**：识别投递鸭小程序复制出的结构化投递信息，直接写入多维表格
- ⚡ **本地规则解析**：全程本地 KV 解析，不走 LLM，不消耗 token
- 🗓️ **每日提醒**：支持每天定时推送今日 / 本周待办
- 🧠 **内存缓存**：多维表格主表缓存 + 外部变更事件刷新，菜单查询更快
- 🧪 **带单测**：parser 和缓存逻辑有 vitest 单测护航

## 📋 适用人群

任何想用飞书机器人 + 多维表格管理结构化记录的人。本项目以"求职投递"为例，但只要改下 `src/types.ts` 里的字段和枚举，就能改造成读书记录、健身打卡、客户跟进、Bug 跟进等任何场景。

## 🎬 同步示例

```
公司：携程
岗位名称：产品经理
当前进度：三面
平台：官网
base：上海
对应日期：2026-05-25
备注：约了面试
```

字段顺序无关，支持全角 / 半角冒号。`公司` 和 `岗位名称` 必填，其他字段可为空。

## 🚀 快速开始

> AI Agent 正在帮你安装？可以直接跳到 [AI Agent 快速开始](#ai-agent-快速开始)。

### 前置条件

- Node.js ≥ 20（[下载](https://nodejs.org/)）
- 一个飞书账号（个人或企业自建均可）
- 一个飞书自建应用的 `App ID` / `App Secret`

> 本项目使用飞书长连接接收消息，不需要公网域名、服务器或 ngrok。

### 1. 安装模板

点击上方 **一键安装飞书模板**，复制到你自己的飞书空间。模板已配好字段和视图。

### 2. 准备飞书应用

在 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用，然后：

1. 在"凭证与基础信息"复制 `App ID` 和 `App Secret`
2. 在"权限管理"开通 `im:message`、`im:message:send_as_bot`、`bitable:app`、`wiki:node:read`
3. 在"应用功能 → 机器人"启用机器人
4. 在"事件与回调 → 事件配置"里，订阅方式选择"使用长连接接收事件"，并添加事件 `im.message.receive_v1`
5. 在模板副本里点右上角 "**...**" → "**更多**" → "**添加文档应用**"，添加这个机器人应用
6. 在"版本管理与发布"发布应用，然后在飞书里搜索机器人并添加

### 3. 克隆并自动配置

```bash
git clone https://github.com/Jerry-007-cpu/feishu-job-tracker-bot.git
cd feishu-job-tracker-bot
npm install
npm run setup
```

`npm run setup` 会按提示生成 `.env`：可以直接粘贴你的模板副本链接，即使是 `https://xxx.feishu.cn/wiki/xxx?table=xxx` 这种老文档/wiki 链接也可以。脚本会自动解析真实 `BASE_TOKEN`，并自动找到主表 `MAIN_TABLE_ID`。

### 4. 本地启动

```bash
npm test           # 应看到全部测试通过
npm run dev        # 启动飞书长连接
```

看到 `Feishu bot long connection starting...` 后，在飞书里点击机器人菜单，或发送一段小程序复制出的投递信息。能收到回复，就是全通了。

### 5. 配置机器人菜单预设

在飞书开放平台 **应用功能 → 机器人 → 菜单配置** 中，菜单项的"响应动作"选择 **推送事件**，并填写下面的自定义事件 ID：

| 菜单名称 | 自定义事件 ID | 用途 |
| --- | --- | --- |
| 待办 | `preset_agenda` | 查看今天 + 本周安排（本自然周周一到周日） |
| 投递总览 | `preset_overview` | 汇总全部投递、面试中、待跟进和行动建议 |
| 帮助 | `preset_help` | 查看菜单说明 |

历史兼容：`preset_today`、`preset_week` 会返回同一个"待办"视图；`preset_followup` 会返回"投递总览"。

还需要在 **事件与回调 → 事件配置** 中添加事件：

- `im.message.receive_v1`：接收用户消息
- `application.bot.menu_v6`：接收机器人自定义菜单点击
- `drive.file.bitable_record_changed_v1`：外部修改多维表格后刷新缓存（推荐）

菜单配置和事件配置修改后，需要创建应用版本并发布，通常几分钟内生效。

### 6. macOS 开机自启

本项目使用 macOS `launchd` 注册为当前用户的登录自启服务。安装后无需再开终端保持 `npm run dev` 运行，电脑登录后会自动启动机器人，异常退出也会自动拉起。

```bash
npm run launchd:install
```

常用检查命令：

```bash
launchctl print gui/$(id -u)/com.jerry.larkbot
tail -f logs/larkbot.log
tail -f logs/larkbot.error.log
```

如果以后不想自启：

```bash
npm run launchd:uninstall
```

### AI Agent 快速开始

如果你在用 Codex / Claude Code / Cursor 这类 AI Agent，可以先安装本仓库配套 skill：

```bash
npx skills add Jerry-007-cpu/feishu-job-tracker-bot@feishu-job-tracker-bot -g -y
```

然后直接对 Agent 说：

```text
帮我配置 feishu-job-tracker-bot。我已经复制了飞书模板，下面是模板链接和飞书应用 App ID / App Secret。
```

Agent 会按 skill 执行：安装依赖、运行 `npm run setup`、解析 wiki/base 链接、自动生成 `.env`，并确认飞书后台已选择长连接模式。

### 还不能和机器人对话？

- **搜不到机器人**：检查"应用功能 → 机器人"是否已启用，以及"版本管理与发布"是否已经发布到包含你的可见范围。
- **普通聊天没回复**：这是当前设计。机器人只响应菜单事件和小程序结构化粘贴文本。
- **菜单没回复**：检查 `npm run dev` 是否还在运行、事件订阅是否选择"使用长连接接收事件"、是否添加了 `application.bot.menu_v6` 事件。
- **粘贴投递信息没回复**：检查消息里是否同时包含 `公司：` 和 `岗位名称：`。
- **机器人回复写表失败**：检查模板副本里是否已经"添加文档应用"，以及应用权限里是否开了 `bitable:app`。如果 `BASE_TOKEN` 填的是 wiki 链接，还需要 `wiki:node:read`。

## 📦 项目结构

```
src/
├── ws.ts                 # 飞书长连接入口
├── server.ts             # 旧 webhook 入口（通常不用）
├── setup.ts              # 交互式初始化 .env
├── config.ts             # 环境变量加载 + 必填校验
├── types.ts              # 类型 + 字段枚举（要改字段从这里改）
├── lark/
│   ├── client.ts         # 飞书 Open API client（tenant_access_token 缓存）
│   ├── base.ts           # 多维表格 CRUD + 主表缓存入口
│   ├── im.ts             # 消息发送
│   ├── recordCache.ts    # 主表记录内存缓存
│   └── verify.ts         # 事件签名校验 + AES 解密
├── bot/
│   ├── router.ts         # 旧 webhook 路由（通常不用）
│   ├── commands.ts       # 命令分发 + 确认流程
│   ├── menu.ts           # 菜单预设回复
│   ├── parser.ts         # 命令文本解析
│   ├── paste_parser.ts   # 小程序粘贴文本解析
│   ├── push_target.ts    # 每日推送目标记录
│   ├── scheduler.ts      # 每日待办推送
│   └── session.ts        # 待确认状态管理（TTL 10min）
└── utils/
    └── dedupe.ts         # event_id FIFO 去重
tests/
├── parser.test.ts        # 解析器单测
└── recordCache.test.ts   # 缓存单测
```

## 🛠 自定义你自己的场景

想改成别的用途（读书记录、客户跟进等）？只需要改这几处：

1. **`src/types.ts`** — 改 `FieldKey`、`FIELD_NAME_MAP`，加你的字段
2. **`src/bot/paste_parser.ts`** — 加小程序粘贴字段别名
3. **`src/bot/parser.ts`** 的 `buildBitableFields` — 加新字段的写表映射
4. **`src/bot/menu.ts`** — 改菜单预设和帮助文案
5. **`README.md`** —— 改模板和安装说明

`src/lark/*`（飞书 API 封装）和 `src/utils/dedupe.ts` 大概率不用改。

## 🔐 安全清单

- [x] `.env` 在 `.gitignore` 里
- [x] `.env.example` 只放占位符
- [x] 配置 `FEISHU_ENCRYPT_KEY` 后会自动启用 `X-Lark-Signature` 校验
- [x] `event_id` FIFO 去重防止飞书重试导致重复写入
- [ ] 你需要做的：**不要把 `.env` 截图或粘贴到任何对话框、issue、文档**
- [ ] 你需要做的：如果不慎泄露 token，**立即去飞书后台轮换 App Secret、Encrypt Key、Bitable 访问令牌**

## ⚠️ 已知限制 / 路线图

- 当前 dedupe 是**单实例内存**，迁 serverless 多实例需换 Redis/KV
- `/查询` 和 `/更新` 用全表扫描 + 内存过滤，记录量 > 1000 后建议改 Bitable `search` API
- **不支持删除**（这是有意的，需要删请直接到多维表格操作）
- 小程序粘贴日期目前只建议使用 `YYYY-MM-DD`
- 不解析自由聊天文本，避免误触写表

## 🤝 贡献

欢迎 issue 和 PR。提交前请确保：

```bash
npm test          # 测试全过
npm run type-check # 类型检查通过
```

## 📄 License

[MIT](./LICENSE) © 2026 Rui
