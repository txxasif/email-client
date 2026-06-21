export interface Account {
  id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  history_id: string | null;
  picture_url?: string | null;
  avatarBg?: string; // added to match reference UI support if any
  unreadCount?: number; // added to match reference UI support
}

export interface MessageHeader {
  id: string;
  thread_id: string;
  account_id: string;
  sender: string;
  subject: string;
  snippet: string | null;
  labels: string[];
  is_read: boolean;
  timestamp: number;
}

export interface MessageDetail {
  id: string;
  thread_id: string;
  account_id: string;
  sender: string;
  subject: string;
  snippet: string | null;
  body_html: string | null;
  body_text: string | null;
  labels: string[];
  is_read: boolean;
  timestamp: number;
  attachments_meta: string | null;
}

export interface Attachment {
  filename: string;
  mime_type: string;
  content_b64: string;
  size?: number;
}

