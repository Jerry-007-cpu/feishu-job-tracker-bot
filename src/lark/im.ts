import { larkClient } from './client.js';

/**
 * 飞书 IM 消息发送封装
 */
export class IMService {
  /** 回复一条消息 */
  async replyMessage(messageId: string, content: string): Promise<void> {
    await larkClient.post(`/open-apis/im/v1/messages/${messageId}/reply`, {
      content: JSON.stringify({ text: content }),
      msg_type: 'text',
    });
  }

  /** 向用户发送私信 */
  async sendMessage(openId: string, content: string): Promise<void> {
    await larkClient.post('/open-apis/im/v1/messages?receive_id_type=open_id', {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    });
  }
}

export const imService = new IMService();
