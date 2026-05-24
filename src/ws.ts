import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from './config.js';
import { dispatchCommand } from './bot/commands.js';
import { eventDedupe } from './utils/dedupe.js';
import type { MessageReceiveEvent } from './types.js';

function extractText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    const raw = parsed.text ?? '';
    return raw.replace(/@_user_\d+/g, '').trim();
  } catch {
    return content.trim();
  }
}

async function handleMessageEvent(event: MessageReceiveEvent): Promise<void> {
  const message = event.message;

  if (message.message_type !== 'text') {
    return;
  }

  const text = extractText(message.content);
  if (!text) {
    return;
  }

  const openId = event.sender.sender_id.open_id;
  await dispatchCommand(openId, message.message_id, text);
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
});

console.log('🚀 Feishu bot long connection starting...');
console.log('   Subscription mode: 使用长连接接收事件');
console.log('   Send /帮助 to the bot in Feishu after the connection is ready.');

await wsClient.start({ eventDispatcher });
