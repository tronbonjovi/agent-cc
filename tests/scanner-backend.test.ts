/**
 * Scanner backend interface tests.
 *
 * Guards the store-only backend:
 *   1. `getScannerBackend()` returns the store implementation (task008 deleted
 *      the legacy backend and the `SCANNER_BACKEND` env var after the task007
 *      parity gate signed off on known gaps).
 *   2. Shape — the store backend exposes every key listed in
 *      `SCANNER_BACKEND_METHODS`. Runtime guard against the interface and
 *      implementation drifting apart (TS catches most drift at compile time,
 *      but only if the caller imports the right type; this test fails loud
 *      regardless of how the drift happens).
 */

import { describe, it, expect } from 'vitest';

import {
  getScannerBackend,
  SCANNER_BACKEND_METHODS,
} from '../server/scanner/backend';
import { storeBackend } from '../server/scanner/backend-store';

describe('scanner backend selector', () => {
  describe('getScannerBackend()', () => {
    it('returns the store backend', () => {
      const backend = getScannerBackend();
      expect(backend.name).toBe('store');
      expect(backend).toBe(storeBackend);
    });

    it('ignores any SCANNER_BACKEND env var (removed in task008)', () => {
      // The env var was the dual-path selector through M5 Phase 4.
      // Task008 removed the code path entirely, so setting it must have
      // no effect — not an error, not a fallback, not a warning.
      const original = process.env.SCANNER_BACKEND;
      try {
        process.env.SCANNER_BACKEND = 'legacy';
        expect(getScannerBackend()).toBe(storeBackend);
        process.env.SCANNER_BACKEND = 'nonsense';
        expect(getScannerBackend()).toBe(storeBackend);
      } finally {
        if (original === undefined) {
          delete process.env.SCANNER_BACKEND;
        } else {
          process.env.SCANNER_BACKEND = original;
        }
      }
    });
  });

  describe('IScannerBackend interface completeness', () => {
    it('storeBackend implements every method in SCANNER_BACKEND_METHODS', () => {
      for (const key of SCANNER_BACKEND_METHODS) {
        expect(storeBackend, `storeBackend missing ${String(key)}`).toHaveProperty(key);
        if (key === 'name') {
          expect(typeof storeBackend.name).toBe('string');
        } else {
          expect(typeof storeBackend[key]).toBe('function');
        }
      }
    });

    it('storeBackend reports name "store"', () => {
      expect(storeBackend.name).toBe('store');
    });
  });
});
