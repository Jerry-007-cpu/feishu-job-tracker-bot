import type { Context } from 'hono';
import { config } from '../config.js';
import { verifySignature, decryptEvent } from '../lark/verify.js';
import { eventDedupe } from '../utils/dedupe.js';
import { dispatchCommand } from './commands.js';
import type {
  WebhookBody,
  LarkEventV2,
  MessageReceiveEvent,
  EncryptedPayload,
  UrlVerificationPayload,
} from '../types.js';

/** 从消息 content（JSON 字符串）里抽出纯文本，并清掉 at_user mention 占位 */
function extractText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    const raw = parsed.text ?? '';
    // 群聊里 @机器人 时，飞书会插入 @_user_1 之类占位，统一去掉
    return raw.replace(/@_user_\d+/g, '').trim();
  } catch {
    return content.trim();
  }
}

/** 处理飞书消息事件 */
async function handleMessageEvent(event: MessageReceiveEvent): Promise<void> {
  const message = event.message;

  // 只处理文本消息
  if (message.message_type !== 'text') return;

  const text = extractText(message.content);
  if (!text) return;

  const openId = event.sender.sender_id.open_id;
  await dispatchCommand(openId, message.message_id, text);
}

/**
 * POST /webhook/lark
 *
 * 流程：
 *  1. 读 raw body
 *  2. 若配置了 encryptKey 且请求带签名 header → 校验签名
 *  3. 解析 JSON
 *  4. 若 body 是 {encrypt: "..."}，解密后得到真实 payload
 *  5. URL verification 直接返回 challenge
 *  6. 普通事件：去重 → 路由 → 异步处理 → 立即 200
 *
 * 注意：飞书要求 webhook 在 3 秒内返回 200，所以业务处理必须异步 fire-and-forget。
 */
export async function handleWebhook(c: Context): Promise<Response> {
  // ---- 1. 读取原始 body（签名校验需要） ----
  const rawBody = await c.req.text();

  // ---- 2. 签名校验（仅当配置了 encryptKey 时启用） ----
  const encryptKey = config.feishu.encryptKey;
  if (encryptKey) {
    const timestamp = c.req.header('X-Lark-Request-Timestamp') ?? '';
    const nonce = c.req.header('X-Lark-Request-Nonce') ?? '';
    const signature = c.req.header('X-Lark-Signature') ?? '';

    if (signature && !verifySignature(rawBody, timestamp, nonce, signature, encryptKey)) {
      console.warn('[webhook] signature mismatch, rejecting');
      return c.json({ error: 'invalid signature' }, 401);
    }
    // 没带签名 header（飞书 URL verification 阶段可能不带），暂不拒绝
  }

  // ---- 3. parse JSON ----
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch (err) {
    console.warn('[webhook] invalid JSON:', (err as Error).message);
    return c.json({ error: 'invalid json' }, 400);
  }

  // ---- 4. 若是加密包，解密后重新解析 ----
  if ('encrypt' in body && typeof (body as EncryptedPayload).encrypt === 'string') {
    if (!encryptKey) {
      console.warn('[webhook] received encrypted payload but FEISHU_ENCRYPT_KEY missing');
      return c.json({ error: 'encryption not configured' }, 500);
    }
    try {
      const plaintext = decryptEvent((body as EncryptedPayload).encrypt, encryptKey);
      body = JSON.parse(plaintext) as WebhookBody;
    } catch (err) {
      console.error('[webhook] decrypt failed:', (err as Error).message);
      return c.json({ error: 'decrypt failed' }, 400);
    }
  }

  // ---- 5. URL verification ----
  if ('type' in body && (body as UrlVerificationPayload).type === 'url_verification') {
    return c.json({ challenge: (body as UrlVerificationPayload).challenge });
  }

  // ---- 6. Schema 2.0 事件 ----
  const eventBody = body as LarkEventV2;
  if (eventBody.schema !== '2.0' || !eventBody.header) {
    console.warn('[webhook] unknown schema, body:', JSON.stringify(body).slice(0, 200));
    return c.json({});
  }

  const { header, event } = eventBody;

  // 事件去重
  if (!eventDedupe.checkAndMark(header.event_id)) {
    return c.json({});
  }

  switch (header.event_type) {
    case 'im.message.receive_v1': {
      // fire-and-forget：先返回 200 给飞书，业务异步执行
      handleMessageEvent(event as unknown as MessageReceiveEvent).catch((err) => {
        console.error('[webhook] handleMessageEvent failed:', err);
      });
      return c.json({});
    }

    default:
      // 未知事件类型，照常返回 200
      return c.json({});
  }
}
