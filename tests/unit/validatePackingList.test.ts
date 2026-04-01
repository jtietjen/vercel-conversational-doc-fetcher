import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.mock() factories are hoisted above all imports and variable declarations,
// so any variable used inside the factory must be created with vi.hoisted().
const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    };
  }),
}));

// Import AFTER vi.mock so the mock is in place when the module loads
import { validatePackingList } from '@/lib/gemini';

const DUMMY_BUFFER = Buffer.from('fake-pdf-content');
const PDF_MIME = 'application/pdf';

function makeResponse(text: string) {
  return { response: { text: () => text } };
}

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key-123');
  mockGenerateContent.mockReset();
});

describe('validatePackingList', () => {
  it('returns isPackingList:true for a valid packing list response', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse('{"isPackingList":true,"confidence":0.95,"issues":[],"extractedItems":12}'),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.issues).toEqual([]);
    expect(result.extractedItems).toBe(12);
  });

  it('returns isPackingList:false for a commercial invoice (negative case)', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse(
        '{"isPackingList":false,"confidence":0.88,"issues":["Document is a commercial invoice, not a packing list"],"extractedItems":0}',
      ),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(false);
    expect(result.confidence).toBe(0.88);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/commercial invoice/i);
  });

  it('passes through confidence of exactly 0.8 (threshold boundary)', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse('{"isPackingList":true,"confidence":0.8,"issues":[]}'),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(true);
    expect(result.confidence).toBe(0.8);
  });

  it('passes through confidence of 0.79 (below threshold, enforced by caller)', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse('{"isPackingList":false,"confidence":0.79,"issues":["Low confidence"]}'),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(false);
    expect(result.confidence).toBe(0.79);
  });

  it('returns isPackingList:false for a document with items/quantities but containing prices', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse(
        '{"isPackingList":false,"confidence":0.92,"issues":["Document contains unit prices and monetary totals — this is an invoice, not a packing list"],"extractedItems":0}',
      ),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(false);
    expect(result.confidence).toBe(0.92);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/price|invoice/i);
  });

  it('extracts JSON when Gemini wraps the response in markdown code fences', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse(
        '```json\n{"isPackingList":true,"confidence":0.9,"issues":[],"extractedItems":5}\n```',
      ),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.extractedItems).toBe(5);
  });

  it('returns a safe fallback when the AI returns non-JSON text', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeResponse('Sorry, I cannot analyze this.'));

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.issues).toContain('Could not parse validation response from AI');
  });

  it('returns a safe fallback when the AI returns an empty string', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeResponse(''));

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.issues).toContain('Could not parse validation response from AI');
  });

  it('returns a safe fallback when the Gemini API throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Network error'));

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.isPackingList).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.issues).toContain('Document validation failed — please try again');
  });

  it('returns undefined extractedItems when the field is absent in the response', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeResponse('{"isPackingList":true,"confidence":0.8,"issues":[]}'),
    );

    const result = await validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME });

    expect(result.extractedItems).toBeUndefined();
  });

  it('throws when GEMINI_API_KEY is not set (getModel is outside try/catch)', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    // getModel() throws synchronously before generateContent is called,
    // and it is called outside the try/catch block in validatePackingList,
    // so the error propagates rather than being caught.
    await expect(
      validatePackingList({ buffer: DUMMY_BUFFER, mimeType: PDF_MIME }),
    ).rejects.toThrow('GEMINI_API_KEY is not set');
  });
});
