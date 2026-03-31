import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiValidationResult } from '@/types';

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenerativeAI(key).getGenerativeModel({
    model: 'gemini-1.5-flash',
  });
}

/**
 * Generate the initial WhatsApp message asking the customer for their packing list.
 */
export async function generateInitialMessage(params: {
  customerName: string;
  orderId: string;
  language: string;
}): Promise<string> {
  const { customerName, orderId, language } = params;
  const model = getModel();

  const prompt =
    `You are a helpful logistics assistant. Generate a friendly, concise WhatsApp message ` +
    `(maximum 200 characters) in the language with BCP-47 code "${language}". ` +
    `Ask customer "${customerName}" to send a photo or PDF of their packing list for order "${orderId}". ` +
    `Use plain text only — no markdown, no asterisks, no bullet points.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Generate a retry message after an invalid document submission.
 */
export async function generateRetryMessage(params: {
  customerName: string;
  orderId: string;
  language: string;
  attemptNumber: number; // 1-based
  issues: string[];
}): Promise<string> {
  const { customerName, orderId, language, attemptNumber, issues } = params;
  const model = getModel();

  const issueList = issues.length > 0 ? issues.join('; ') : 'unclear content';
  const prompt =
    `You are a helpful logistics assistant. The customer "${customerName}" sent a document for order "${orderId}" ` +
    `but it was not a valid packing list (attempt ${attemptNumber} of 3). Issues: "${issueList}". ` +
    `Write a short, friendly WhatsApp message in BCP-47 language "${language}" asking them to resend a clearer photo or PDF of their packing list. ` +
    `Mention what a packing list should include (items, quantities, weights). ` +
    `Plain text only, max 300 characters.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Generate a success message after a valid packing list is accepted.
 */
export async function generateSuccessMessage(params: {
  customerName: string;
  orderId: string;
  language: string;
}): Promise<string> {
  const { customerName, orderId, language } = params;
  const model = getModel();

  const prompt =
    `You are a helpful logistics assistant. Customer "${customerName}" successfully submitted their packing list for order "${orderId}". ` +
    `Write a short, friendly confirmation WhatsApp message in BCP-47 language "${language}". ` +
    `Tell them the document has been received and processed. Plain text only, max 200 characters.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Generate a failure message after all retry attempts are exhausted.
 */
export async function generateFailureMessage(params: {
  customerName: string;
  orderId: string;
  language: string;
}): Promise<string> {
  const { customerName, orderId, language } = params;
  const model = getModel();

  const prompt =
    `You are a helpful logistics assistant. Customer "${customerName}" failed to submit a valid packing list for order "${orderId}" after 3 attempts. ` +
    `Write a short, empathetic WhatsApp message in BCP-47 language "${language}" letting them know we could not process their submission and that they should contact support. ` +
    `Plain text only, max 250 characters.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Generate a helpful guide message when the customer sends plain text instead of a document.
 */
export async function generateTextGuideMessage(params: {
  customerName: string;
  language: string;
}): Promise<string> {
  const { customerName, language } = params;
  const model = getModel();

  const prompt =
    `You are a helpful logistics assistant. Customer "${customerName}" sent a text message instead of a document. ` +
    `Write a short WhatsApp message in BCP-47 language "${language}" asking them to send a photo or PDF of their packing list instead. ` +
    `Plain text only, max 150 characters.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

const VALIDATION_PROMPT =
  'Analyze this document image or PDF. Determine if it is a packing list. ' +
  'A valid packing list should contain: an itemized list of goods, quantities, and ideally weights or dimensions. ' +
  'Return ONLY valid JSON with no markdown fencing: ' +
  '{ "isPackingList": boolean, "confidence": number, "issues": string[], "extractedItems": number }';

/**
 * Validate a document using Gemini Vision.
 * Supports image/* and application/pdf MIME types.
 */
export async function validatePackingList(params: {
  buffer: Buffer;
  mimeType: string;
}): Promise<GeminiValidationResult> {
  const model = getModel();

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mimeType: params.mimeType as any,
          data: params.buffer.toString('base64'),
        },
      },
      VALIDATION_PROMPT,
    ]);

    const text = result.response.text();

    // Extract JSON — Gemini may wrap it in markdown fences
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        isPackingList: false,
        confidence: 0,
        issues: ['Could not parse validation response from AI'],
      };
    }

    const parsed = JSON.parse(match[0]) as GeminiValidationResult;
    return {
      isPackingList: Boolean(parsed.isPackingList),
      confidence: Number(parsed.confidence ?? 0),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      extractedItems: parsed.extractedItems,
    };
  } catch {
    return {
      isPackingList: false,
      confidence: 0,
      issues: ['Document validation failed — please try again'],
    };
  }
}
