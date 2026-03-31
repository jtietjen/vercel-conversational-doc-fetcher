import { NextRequest, NextResponse } from 'next/server';
import type { ConversationState, TriggerRequestBody } from '@/types';
import {
  getConversation,
  setConversation,
  setTrackingIndex,
  deleteConversation,
  deleteTrackingIndex,
} from '@/lib/kv';
import { generateInitialMessage } from '@/lib/gemini';
import { sendTextMessage } from '@/lib/whatsapp';

function normalisePhone(phone: string): string {
  // Ensure E.164 with '+' for storage, but we store in KV without '+'
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Partial<TriggerRequestBody>;
  try {
    body = (await req.json()) as Partial<TriggerRequestBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { phone, orderId, trackingNumber, customerName, language = 'en' } =
    body;

  // Validate required fields
  const missing: string[] = [];
  if (!phone) missing.push('phone');
  if (!orderId) missing.push('orderId');
  if (!trackingNumber) missing.push('trackingNumber');
  if (!customerName) missing.push('customerName');
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  const normalisedPhone = normalisePhone(phone!);

  // Check for existing active conversation
  const existing = await getConversation(normalisedPhone);
  if (existing?.status === 'PENDING_DOCUMENT') {
    return NextResponse.json(
      {
        error: 'An active conversation already exists for this phone number',
        status: existing.status,
        trackingNumber: existing.trackingNumber,
      },
      { status: 409 },
    );
  }

  // Write initial state to KV
  const state: ConversationState = {
    status: 'PENDING_DOCUMENT',
    trackingNumber: trackingNumber!,
    orderId: orderId!,
    customerName: customerName!,
    language,
    attempts: 0,
    triggeredAt: new Date().toISOString(),
    messages: [],
  };

  await setConversation(normalisedPhone, state);
  await setTrackingIndex(trackingNumber!, normalisedPhone);

  // Generate and send initial message
  let initialMessage: string;
  try {
    initialMessage = await generateInitialMessage({
      customerName: customerName!,
      orderId: orderId!,
      language,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Gemini generateInitialMessage failed:', err);
    await deleteConversation(normalisedPhone);
    await deleteTrackingIndex(trackingNumber!);
    return NextResponse.json(
      { error: 'Failed to generate message.', detail: msg },
      { status: 502 },
    );
  }

  try {
    // WhatsApp 'to' is without '+'
    const waPhone = normalisedPhone.replace(/^\+/, '');
    await sendTextMessage(waPhone, initialMessage);
  } catch (err) {
    console.error('WhatsApp sendTextMessage failed:', err);
    await deleteConversation(normalisedPhone);
    await deleteTrackingIndex(trackingNumber!);
    return NextResponse.json(
      { error: 'Failed to send WhatsApp message. Please try again.' },
      { status: 502 },
    );
  }

  // Append the sent message to the conversation log
  const updatedState: ConversationState = {
    ...state,
    messages: [
      {
        role: 'system',
        content: initialMessage,
        timestamp: new Date().toISOString(),
      },
    ],
    lastMessageAt: new Date().toISOString(),
  };
  await setConversation(normalisedPhone, updatedState);

  return NextResponse.json({
    success: true,
    phone: normalisedPhone,
    orderId: orderId!,
    trackingNumber: trackingNumber!,
  });
}
