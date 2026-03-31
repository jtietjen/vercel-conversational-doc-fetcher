// ---- Conversation messages ----

export type MessageRole = 'system' | 'customer';

export interface ConversationMessage {
  role: MessageRole;
  content: string;       // Text content. For customer documents: "[document received]"
  timestamp: string;     // ISO 8601
  mediaType?: string;    // e.g. 'image/jpeg', 'application/pdf' — only on document messages
}

// ---- Conversation state (stored in Vercel KV) ----

export type ConversationStatus = 'PENDING_DOCUMENT' | 'COMPLETED' | 'FAILED';

export interface ConversationState {
  status: ConversationStatus;
  trackingNumber: string;          // Caller-supplied technical ID
  orderId: string;
  customerName: string;
  language: string;                // BCP-47, e.g. 'en', 'de'
  attempts: number;                // 0-based; conversation fails after >= 3
  triggeredAt: string;             // ISO 8601
  blobUrl?: string;                // Set on COMPLETED — Vercel Blob public URL
  lastMessageAt?: string;          // ISO 8601
  messages: ConversationMessage[]; // Full chronological message log
}

// ---- /api/trigger request body ----

export interface TriggerRequestBody {
  phone: string;          // E.164 format, e.g. '+4917612345678'
  orderId: string;
  trackingNumber: string; // Caller's own ID to poll /api/status/:trackingNumber
  customerName: string;
  language?: string;      // Default: 'en'
}

// ---- Gemini validation result ----

export interface GeminiValidationResult {
  isPackingList: boolean;
  confidence: number;     // 0.0 – 1.0
  issues: string[];
  extractedItems?: number;
}

// ---- WhatsApp Cloud API types ----

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: string;
}

export interface WhatsAppChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppMessage {
  from: string;   // Sender phone without '+', e.g. '4917612345678'
  id: string;
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'document'
    | 'audio'
    | 'video'
    | 'sticker'
    | 'location'
    | 'reaction'
    | 'unknown';
  text?: { body: string };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  document?: {
    id: string;
    mime_type: string;
    sha256: string;
    filename?: string;
    caption?: string;
  };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}
