// ===== 飞书事件 =====

export interface UrlVerificationPayload {
  type: 'url_verification';
  challenge: string;
  token: string;
}

export interface LarkEventV2 {
  schema: '2.0';
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  event: Record<string, unknown>;
}

export interface EncryptedPayload {
  encrypt: string;
}

export type WebhookBody = UrlVerificationPayload | LarkEventV2 | EncryptedPayload;

// ===== 消息事件 =====

export interface MessageReceiveEvent {
  sender: {
    sender_id: {
      user_id: string;
      open_id: string;
      union_id: string;
    };
    sender_type: 'user';
  };
  message: {
    message_id: string;
    root_id: string;
    parent_id: string;
    create_time: string;
    chat_id: string;
    chat_type: 'private' | 'group';
    message_type: 'text';
    content: string; // JSON string
  };
}

export interface BotMenuEvent {
  operator: {
    operator_id: {
      user_id?: string;
      open_id: string;
      union_id?: string;
    };
    operator_name?: string;
  };
  event_key: string;
}

// ===== 多维表格 =====

export interface BitableRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

export interface BitableField {
  field_id: string;
  field_name: string;
  type: number;
  ui_type: string;
  property: Record<string, unknown> | null;
  is_primary: boolean;
}

// ===== 机器人 Session =====

export type CommandType = '创建' | '更新' | '查询' | '帮助';

export interface ParsedCreateCommand {
  company: string;
  position: string;
  fields: Partial<Record<FieldKey, string>>;
}

export interface ParsedUpdateCommand {
  company: string;
  position: string;
  fields: Partial<Record<FieldKey, string>>;
}

export interface ParsedQueryCommand {
  company: string;
  position?: string;
}

export type FieldKey = '公司' | '岗位名称' | '当前进度' | '对应日期' | '平台' | 'base' | '备注';

export const FIELD_NAME_MAP: Record<string, FieldKey> = {
  '当前进度': '当前进度',
  '日期': '对应日期',
  '平台': '平台',
  'base': 'base',
  '备注': '备注',
};

export const FIELD_KEYS_BY_LENGTH = Object.entries(FIELD_NAME_MAP)
  .sort(([a], [b]) => b.length - a.length)
  .map(([key]) => key);

// ===== Session 状态 =====

export interface SessionConfirmCreate {
  kind: 'confirm_create';
  fields: Record<string, unknown>;
}

export interface SessionConfirmUpdate {
  kind: 'confirm_update';
  recordId: string;
  fields: Record<string, unknown>;
  summary: string;
}

export interface SessionSelectForUpdate {
  kind: 'select_for_update';
  records: Array<{ recordId: string; summary: string }>;
  fields: Record<string, unknown>;
}

export interface SessionSelectForQuery {
  kind: 'select_for_query';
  records: Array<{ recordId: string; summary: string }>;
}

export type SessionData =
  | SessionConfirmCreate
  | SessionConfirmUpdate
  | SessionSelectForUpdate
  | SessionSelectForQuery;
