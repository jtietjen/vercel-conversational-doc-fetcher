import crypto from 'crypto';

const GRAPH_API = 'https://graph.facebook.com/v20.0';
const MAX_MEDIA_BYTES = 20 * 1024 * 1024; // 20 MB

function token(): string {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error('WHATSAPP_TOKEN is not set');
  return t;
}

function phoneId(): string {
  const id = process.env.WHATSAPP_PHONE_ID;
  if (!id) throw new Error('WHATSAPP_PHONE_ID is not set');
  return id;
}

function appSecret(): string {
  const s = process.env.WHATSAPP_APP_SECRET;
  if (!s) throw new Error('WHATSAPP_APP_SECRET is not set');
  return s;
}

/**
 * Send a plain-text WhatsApp message to a recipient.
 * @param to  Phone number WITHOUT leading '+', e.g. '4917612345678'
 * @param body Message text (max ~4096 chars for WhatsApp)
 */
export async function sendTextMessage(to: string, body: string): Promise<void> {
  const url = `${GRAPH_API}/${phoneId()}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `WhatsApp sendTextMessage failed (${res.status}): ${detail}`,
    );
  }
}

/**
 * Download a media file by its WhatsApp media ID.
 * Returns the binary buffer and MIME type.
 */
export async function downloadMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Step 1: get media metadata (URL + size)
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!metaRes.ok) {
    const detail = await metaRes.text();
    throw new Error(
      `WhatsApp media metadata failed (${metaRes.status}): ${detail}`,
    );
  }

  const meta = (await metaRes.json()) as {
    url: string;
    mime_type: string;
    file_size?: number;
  };

  if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) {
    throw new Error(
      `Media file too large: ${meta.file_size} bytes (max ${MAX_MEDIA_BYTES})`,
    );
  }

  // Step 2: download the binary — must include Authorization header
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!fileRes.ok) {
    const detail = await fileRes.text();
    throw new Error(
      `WhatsApp media download failed (${fileRes.status}): ${detail}`,
    );
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mime_type,
  };
}

/**
 * Verify the X-Hub-Signature-256 HMAC header from Meta's webhook.
 * @param rawBody   Raw request body as a string (before JSON parsing)
 * @param signature Full header value, e.g. 'sha256=abc123...'
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const expectedHex = crypto
    .createHmac('sha256', appSecret())
    .update(rawBody)
    .digest('hex');

  const actual = signature.replace(/^sha256=/, '');

  // Both buffers must be the same length for timingSafeEqual
  if (actual.length !== expectedHex.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(actual, 'hex'),
    Buffer.from(expectedHex, 'hex'),
  );
}
