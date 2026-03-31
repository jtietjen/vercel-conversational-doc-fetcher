import { put } from '@vercel/blob';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

function extFromMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? 'bin';
}

/**
 * Upload a document buffer to Vercel Blob.
 * Returns the public blob URL.
 *
 * Path format: packing-lists/{orderId}/{phone}-{timestamp}.{ext}
 * This keeps all documents for an order grouped, and the timestamp
 * suffix avoids collisions across retries.
 */
export async function uploadDocument(params: {
  buffer: Buffer;
  mimeType: string;
  orderId: string;
  phone: string;
  filename?: string;
}): Promise<string> {
  const { buffer, mimeType, orderId, phone, filename } = params;
  const ext = extFromMime(mimeType);
  const timestamp = Date.now();

  // Use original filename stem if available, otherwise phone-timestamp
  const stem = filename
    ? filename.replace(/\.[^.]+$/, '') // strip extension
    : `${phone}-${timestamp}`;

  const pathname = `packing-lists/${orderId}/${stem}-${timestamp}.${ext}`;

  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return blob.url;
}
