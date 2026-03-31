import crypto from 'crypto';

const BASE = 'https://api.twilio.com/2010-04-01';
const MAX_MEDIA_BYTES = 20 * 1024 * 1024; // 20 MB

function accountSid(): string {
  const v = process.env.TWILIO_ACCOUNT_SID;
  if (!v) throw new Error('TWILIO_ACCOUNT_SID is not set');
  return v;
}

function authToken(): string {
  const v = process.env.TWILIO_AUTH_TOKEN;
  if (!v) throw new Error('TWILIO_AUTH_TOKEN is not set');
  return v;
}

function fromNumber(): string {
  const v = process.env.TWILIO_WHATSAPP_FROM;
  if (!v) throw new Error('TWILIO_WHATSAPP_FROM is not set');
  return v; // e.g. 'whatsapp:+14155238886'
}

function basicAuth(): string {
  return (
    'Basic ' +
    Buffer.from(`${accountSid()}:${authToken()}`).toString('base64')
  );
}

/** Format any phone string to Twilio's 'whatsapp:+49...' format */
function toWhatsApp(phone: string): string {
  const digits = phone.replace(/^whatsapp:\+?/, '').replace(/^\+/, '');
  return `whatsapp:+${digits}`;
}

/**
 * Send a plain-text WhatsApp message via Twilio.
 * @param to  Phone digits without '+', e.g. '491727071518'
 */
export async function sendTextMessage(to: string, body: string): Promise<void> {
  const params = new URLSearchParams({
    To: toWhatsApp(to),
    From: fromNumber(),
    Body: body,
  });

  const res = await fetch(
    `${BASE}/Accounts/${accountSid()}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Twilio sendTextMessage failed (${res.status}): ${detail}`);
  }
}

/**
 * Download a media file from a Twilio media URL.
 * The URL comes directly from the webhook payload (MediaUrl0, etc.).
 */
export async function downloadMedia(
  mediaUrl: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: basicAuth() },
  });

  if (!res.ok) {
    throw new Error(`Twilio media download failed (${res.status}): ${mediaUrl}`);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_MEDIA_BYTES) {
    throw new Error(
      `Media too large: ${contentLength} bytes (max ${MAX_MEDIA_BYTES})`,
    );
  }

  const mimeType =
    res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream';
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

/**
 * Verify Twilio's X-Twilio-Signature header.
 * @param url    Full webhook URL, e.g. 'https://yourapp.vercel.app/api/webhook'
 * @param params Parsed form body as key-value object
 * @param sig    Value of X-Twilio-Signature header
 */
export function verifyWebhookSignature(
  url: string,
  params: Record<string, string>,
  sig: string,
): boolean {
  // Twilio: HMAC-SHA1 of URL + alphabetically sorted param key-value pairs
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');

  const expected = crypto
    .createHmac('sha1', authToken())
    .update(url + sorted)
    .digest('base64');

  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
