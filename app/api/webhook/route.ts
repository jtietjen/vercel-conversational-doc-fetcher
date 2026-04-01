import { NextRequest, NextResponse } from 'next/server';
import type { WhatsAppMessage, ConversationMessage } from '@/types';
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

// ---- GET: health check ----

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}

// ---- POST: Incoming Twilio WhatsApp messages ----

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Twilio sends application/x-www-form-urlencoded
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;

  // Verify Twilio signature when WEBHOOK_URL is configured
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) {
    const sig = req.headers.get('x-twilio-signature') ?? '';
    if (!sig || !verifyWebhookSignature(webhookUrl, params, sig)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // Extract fields from Twilio payload
  const from = params['From'] ?? '';       // 'whatsapp:+491727071518'
  const body = params['Body'] ?? '';
  const numMedia = parseInt(params['NumMedia'] ?? '0', 10);

  // Normalise phone: 'whatsapp:+491727071518' → '491727071518'
  const phone = from.replace(/^whatsapp:\+?/, '');

  if (!phone) {
    return new NextResponse('OK', { status: 200 });
  }

  // Determine message type and build a compatible message object
  let msgType: WhatsAppMessage['type'];
  let message: WhatsAppMessage;

  if (numMedia > 0) {
    const mediaUrl = params['MediaUrl0'] ?? '';
    const mimeType = params['MediaContentType0'] ?? '';
    const isImage = mimeType.startsWith('image/');

    msgType = isImage ? 'image' : 'document';
    message = {
      from: phone,
      id: params['MessageSid'] ?? '',
      timestamp: String(Date.now()),
      type: msgType,
      ...(isImage
        ? { image: { id: mediaUrl, mime_type: mimeType, sha256: '' } }
        : { document: { id: mediaUrl, mime_type: mimeType, sha256: '', filename: params['MediaFilename'] } }),
    };
  } else {
    msgType = 'text';
    message = {
      from: phone,
      id: params['MessageSid'] ?? '',
      timestamp: String(Date.now()),
      type: 'text',
      text: { body },
    };
  }

  try {
    await processMessage(phone, msgType, message, params);
  } catch (err) {
    console.error(`Error processing message from ${phone}:`, err);
  }

  // Twilio expects a 200 response (empty or TwiML)
  return new NextResponse('', { status: 200 });
}

// ---- Message processing ----

async function processMessage(
  from: string,
  type: string,
  message: WhatsAppMessage,
  params: Record<string, string>,
): Promise<void> {
  const state = await getConversation(from);

  if (!state) return;
  if (state.status !== 'PENDING_DOCUMENT') return;

  const { orderId, customerName, language } = state;
  const now = new Date().toISOString();

  if (type === 'image' || type === 'document') {
    // For Twilio, the media ID field holds the direct URL
    const mediaUrl = message.image?.id ?? message.document?.id ?? '';
    const mimeType = message.image?.mime_type ?? message.document?.mime_type ?? '';
    const filename = message.document?.filename;

    if (!mediaUrl || !mimeType) {
      console.error('Missing mediaUrl or mimeType', params);
      return;
    }

    const customerMsg: ConversationMessage = {
      role: 'customer',
      content: '[document received]',
      timestamp: now,
      mediaType: mimeType,
    };
    const stateAfterCustomerMsg = await appendMessage(from, state, customerMsg);

    let buffer: Buffer;
    let resolvedMimeType: string;
    try {
      const media = await downloadMedia(mediaUrl);
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

    const validation = await validatePackingList({ buffer, mimeType: resolvedMimeType });

    if (validation.isPackingList && validation.confidence >= 0.8) {
      const blobUrl = await uploadDocument({
        buffer,
        mimeType: resolvedMimeType,
        orderId,
        phone: from,
        filename,
      });

      const successMsg = await generateSuccessMessage({ customerName, orderId, language });
      await sendTextMessage(from, successMsg);

      const systemMsg: ConversationMessage = {
        role: 'system',
        content: successMsg,
        timestamp: new Date().toISOString(),
      };
      const stateWithSysMsg = await appendMessage(from, stateAfterCustomerMsg, systemMsg);
      await markCompleted(from, stateWithSysMsg, blobUrl);
    } else {
      const stateWithAttempt = await incrementAttempts(from, stateAfterCustomerMsg);
      const newAttempts = stateWithAttempt.attempts;

      if (newAttempts >= 3) {
        const failMsg = await generateFailureMessage({ customerName, orderId, language });
        await sendTextMessage(from, failMsg);

        const systemMsg: ConversationMessage = {
          role: 'system',
          content: failMsg,
          timestamp: new Date().toISOString(),
        };
        const stateWithSysMsg = await appendMessage(from, stateWithAttempt, systemMsg);
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
