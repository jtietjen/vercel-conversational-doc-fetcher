import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env.local before the module is imported so GEMINI_API_KEY is available
config({ path: resolve(process.cwd(), '.env.local') });

import { validatePackingList } from '@/lib/gemini';

describe('validatePackingList — integration (real Gemini API)', () => {
  beforeAll(() => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        'GEMINI_API_KEY must be set to run integration tests. ' +
          'Add it to .env.local or export it before running npm run test:integration',
      );
    }
  });

  it(
    'correctly identifies the DHL Commercial Invoice fixture as NOT a packing list',
    async () => {
      // The fixture (tests/fixtures/package-list.pdf) is a DHL Commercial Invoice.
      // gemini-2.5-flash correctly rejects it despite having items/quantities/weights,
      // because it reads the document title and recognises financial fields (unit value etc.)
      // that are not present on a packing list.
      const buffer = readFileSync(resolve(process.cwd(), 'tests/fixtures/package-list.pdf'));

      const result = await validatePackingList({
        buffer,
        mimeType: 'application/pdf',
      });

      expect(result.isPackingList).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.issues.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
