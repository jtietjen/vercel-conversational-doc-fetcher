import { Redis } from '@upstash/redis';

const kv = new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
  token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
});
import type { ConversationMessage, ConversationState } from '@/types';

// KV TTL: 7 days in seconds
const TTL_SECONDS = 60 * 60 * 24 * 7;

// Normalise phone: strip '+' to match WhatsApp's 'from' field format
function normalise(phone: string): string {
  return phone.replace(/^\+/, '');
}

function convKey(phone: string): string {
  return `conv:${normalise(phone)}`;
}

function trackKey(trackingNumber: string): string {
  return `track:${trackingNumber}`;
}

// ---- Primary conversation record ----

export async function getConversation(
  phone: string,
): Promise<ConversationState | null> {
  return kv.get<ConversationState>(convKey(phone));
}

export async function setConversation(
  phone: string,
  state: ConversationState,
): Promise<void> {
  await kv.set(convKey(phone), state, { ex: TTL_SECONDS });
}

export async function deleteConversation(phone: string): Promise<void> {
  await kv.del(convKey(phone));
}

// ---- Secondary index: trackingNumber → phone ----

export async function setTrackingIndex(
  trackingNumber: string,
  phone: string,
): Promise<void> {
  await kv.set(trackKey(trackingNumber), normalise(phone), {
    ex: TTL_SECONDS,
  });
}

export async function getPhoneByTrackingNumber(
  trackingNumber: string,
): Promise<string | null> {
  return kv.get<string>(trackKey(trackingNumber));
}

export async function deleteTrackingIndex(
  trackingNumber: string,
): Promise<void> {
  await kv.del(trackKey(trackingNumber));
}

// ---- Conversation state mutations ----

export async function appendMessage(
  phone: string,
  state: ConversationState,
  message: ConversationMessage,
): Promise<ConversationState> {
  const updated: ConversationState = {
    ...state,
    messages: [...state.messages, message],
    lastMessageAt: message.timestamp,
  };
  await setConversation(phone, updated);
  return updated;
}

export async function incrementAttempts(
  phone: string,
  state: ConversationState,
): Promise<ConversationState> {
  const updated: ConversationState = {
    ...state,
    attempts: state.attempts + 1,
    lastMessageAt: new Date().toISOString(),
  };
  await setConversation(phone, updated);
  return updated;
}

export async function markCompleted(
  phone: string,
  state: ConversationState,
  blobUrl: string,
): Promise<ConversationState> {
  const updated: ConversationState = {
    ...state,
    status: 'COMPLETED',
    blobUrl,
    lastMessageAt: new Date().toISOString(),
  };
  await setConversation(phone, updated);
  return updated;
}

export async function markFailed(
  phone: string,
  state: ConversationState,
): Promise<ConversationState> {
  const updated: ConversationState = {
    ...state,
    status: 'FAILED',
    lastMessageAt: new Date().toISOString(),
  };
  await setConversation(phone, updated);
  return updated;
}
