import { NextRequest, NextResponse } from 'next/server';
import type {
  WhatsAppWebhookPayload,
  WhatsAppMessage,
  ConversationMessage,
} from '@/types';
import {
  getConversation,
  appendMessage,
  incrementAttempts,
  markCompleted,
  markFailed,
} from '@/lib/kv';
import {
  verifyWebhookSignature,
  downloadMedia,
  sendTextMessage,
} from '@/lib/whatsapp';
import {
  validatePackingList,
  generateRetryMessage,
  generateSuccessMessage,
  generateFailureMessage,
  generateTextGuideMessage,
} from '@/lib/gemini';
import { uploadDocument } from '@/lib/storage';

// ---- GET: WhatsApp webhook verification ----

export async function GET(req: NextRequest): Promise<NextResponse> {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('WHATSAPP_VERIFY_TOKEN is not set');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    // Return challenge as plain text — Meta rejects JSON
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// ---- POST: Incoming WhatsApp messages ----

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body once — needed for both HMAC verification and JSON parsing
  const rawBody = await req.text();

  // Verify webhook signature
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    // Always return 200 to Meta — malformed body is not worth retrying
    console.error('Failed to parse webhook JSON');
    return new NextResponse('OK', { status: 200 });
  }

  const messages =
    payload.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

  if (messages.length === 0) {
    // Status update (delivered, read, etc.) — nothing to process
    return new NextResponse('OK', { status: 200 });
  }

  // Process each message independently; never let one failure block others
  for (const message of messages) {
    try {
      await processMessage(message.from, message.type, message);
    } catch (err) {
      console.error(`Error processing message from ${message.from}:`, err);
    }
  }

  // ALWAYS return 200 — non-2xx causes Meta to retry for up to 7 days
  return new NextResponse('OK', { status: 200 });
}

// ---- Message processing ----

async function processMessage(
  from: string, // WhatsApp phone without '+'
  type: string,
  message: WhatsAppMessage,
): Promise<void> {
  const state = await getConversation(from);

  if (!state) {
    // No active conversation for this number — ignore
    return;
  }

  if (state.status !== 'PENDING_DOCUMENT') {
    // Conversation already resolved (COMPLETED or FAILED) — ignore
    return;
  }

  const { orderId, customerName, language } = state;
  const now = new Date().toISOString();

  // ---- Branch on message type ----

  if (type === 'image' || type === 'document') {
    const mediaId = message.image?.id ?? message.document?.id;
    const mimeType = message.image?.mime_type ?? message.document?.mime_type;
    const filename = message.document?.filename;

    if (!mediaId || !mimeType) {
      console.error('Missing mediaId or mimeType in message', message);
      return;
    }

    // Log the customer's document submission
    const customerMsg: ConversationMessage = {
      role: 'customer',
      content: '[document received]',
      timestamp: now,
      mediaType: mimeType,
    };
    const stateAfterCustomerMsg = await appendMessage(from, state, customerMsg);

    // Download and validate
    let buffer: Buffer;
    let resolvedMimeType: string;
    try {
      const media = await downloadMedia(mediaId);
      buffer = media.buffer;
      resolvedMimeType = media.mimeType || mimeType;
    } catch (err) {
      console.error('Failed to download media:', err);
      await sendTextMessage(
        from,
        "We couldn't download your document. Please try sending it again.",
      );
      return;
    }

    const validation = await validatePackingList({
      buffer,
      mimeType: resolvedMimeType,
    });

    if (validation.isPackingList && validation.confidence >= 0.7) {
      // Valid packing list — upload to Blob
      const blobUrl = await uploadDocument({
        buffer,
        mimeType: resolvedMimeType,
        orderId,
        phone: from,
        filename,
      });

      const successMsg = await generateSuccessMessage({
        customerName,
        orderId,
        language,
      });

      await sendTextMessage(from, successMsg);

      const systemMsg: ConversationMessage = {
        role: 'system',
        content: successMsg,
        timestamp: new Date().toISOString(),
      };
      const stateWithSysMsg = await appendMessage(
        from,
        stateAfterCustomerMsg,
        systemMsg,
      );
      await markCompleted(from, stateWithSysMsg, blobUrl);
    } else {
      // Invalid document — increment attempts
      const stateWithAttempt = await incrementAttempts(
        from,
        stateAfterCustomerMsg,
      );
      const newAttempts = stateWithAttempt.attempts;

      if (newAttempts >= 3) {
        const failMsg = await generateFailureMessage({
          customerName,
          orderId,
          language,
        });
        await sendTextMessage(from, failMsg);

        const systemMsg: ConversationMessage = {
          role: 'system',
          content: failMsg,
          timestamp: new Date().toISOString(),
        };
        const stateWithSysMsg = await appendMessage(
          from,
          stateWithAttempt,
          systemMsg,
        );
        await markFailed(from, stateWithSysMsg);
      } else {
        const retryMsg = await generateRetryMessage({
          customerName,
          orderId,
          language,
          attemptNumber: newAttempts,
          issues: validation.issues,
        });
        await sendTextMessage(from, retryMsg);

        const systemMsg: ConversationMessage = {
          role: 'system',
          content: retryMsg,
          timestamp: new Date().toISOString(),
        };
        await appendMessage(from, stateWithAttempt, systemMsg);
      }
    }
  } else if (type === 'text') {
    const textBody = message.text?.body ?? '';

    // Log customer text (don't increment attempts — text is not a doc submission)
    const customerMsg: ConversationMessage = {
      role: 'customer',
      content: textBody,
      timestamp: now,
    };
    const stateAfterCustomerMsg = await appendMessage(from, state, customerMsg);

    const guideMsg = await generateTextGuideMessage({ customerName, language });
    await sendTextMessage(from, guideMsg);

    const systemMsg: ConversationMessage = {
      role: 'system',
      content: guideMsg,
      timestamp: new Date().toISOString(),
    };
    await appendMessage(from, stateAfterCustomerMsg, systemMsg);
  } else {
    // Unsupported message type (audio, video, sticker, etc.)
    const staticMsg =
      language === 'de'
        ? 'Bitte senden Sie ein Foto oder PDF Ihrer Packliste.'
        : 'Please send a photo or PDF of your packing list.';

    await sendTextMessage(from, staticMsg);

    const systemMsg: ConversationMessage = {
      role: 'system',
      content: staticMsg,
      timestamp: now,
    };
    await appendMessage(from, state, systemMsg);
  }

}
