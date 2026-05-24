---
name: feishu-job-tracker-bot
description: Use when setting up or troubleshooting the Feishu job tracker bot repository. Helps install dependencies, run npm setup, resolve Feishu wiki/base template links, generate .env, configure long connection event subscription, and debug bot replies.
---

# Feishu Job Tracker Bot

Use this skill when the user wants to install, configure, simplify, or debug `Jerry-007-cpu/feishu-job-tracker-bot`.

## Goal

Get the user from a copied Feishu template to a working long-connection bot with the fewest manual steps. Keep the user-facing explanation short. Do not ask users to configure public HTTPS, webhook URLs, ngrok, or domains.

## Human Setup Path

Tell human users to run:

```bash
git clone https://github.com/Jerry-007-cpu/feishu-job-tracker-bot.git
cd feishu-job-tracker-bot
npm install
npm run setup
npm run dev
```

`npm run setup` prompts for:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- the copied template URL or real Base token

The setup script writes `.env`, resolves wiki links to real Base tokens, and auto-picks the main table.

## Agent Setup Path

When acting as an AI Agent:

1. Inspect `package.json` and confirm `setup` exists.
2. Ask the user only for missing secrets or links. Do not ask them to manually extract `BASE_TOKEN` or `MAIN_TABLE_ID`.
3. Run `npm install` if dependencies are missing.
4. Run `npm run setup` and provide the requested values interactively.
5. If setup fails, map the error to one of these checks:
   - App ID/Secret is wrong.
   - The app lacks `bitable:app`.
   - The template link is a wiki link and the app lacks `wiki:node:read`.
   - The copied template has not added the app as a document app.
6. Confirm the Feishu developer console uses "使用长连接接收事件" and subscribes to `im.message.receive_v1`.
7. Run `npm run dev`; tell the user to keep the process running while using the bot.
8. Run `npm test` and `npm run type-check` after code changes.

## Required Feishu Setup

The user needs a Feishu self-built app with:

- `im:message`
- `im:message:send_as_bot`
- `bitable:app`
- `wiki:node:read` if the template link is `/wiki/...`
- Bot capability enabled
- Event subscription mode set to "使用长连接接收事件"
- Event `im.message.receive_v1` added
- The app added to the copied template via "添加文档应用"

## Long Connection Rule

Be precise:

- No public domain, public IP, webhook URL, ngrok, or localtunnel is required.
- The user's machine must be able to access the public internet.
- The bot only receives messages while `npm run dev` is running.
- If multiple long-connection clients run for the same app, Feishu may deliver an event to only one random client.

## README Style

Keep README short:

- Human quick start first.
- AI Agent quick start second.
- Long connection as the only recommended receive mode.
- Troubleshooting as three bullets: cannot find bot, bot does not reply, bot cannot write table.
