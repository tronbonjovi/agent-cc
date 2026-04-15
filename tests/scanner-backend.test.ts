/**
 * Scanner backend interface tests (M5 scanner-ingester task003 + task008).
 *
 * Guards the dual-path refactor:
 *   1. Default — with no env var, `getScannerBackend()` returns the
 *      store implementation (task008 flipped the default after task007's
 *      parity gate closed).
 *   2. Legacy rollback — `SCANNER_BACKEND=legacy` still returns the legacy
 *      backend for one release cycle and logs a deprecation warning.
 *   3. Shape — both implementations expose every key listed in
 *      `SCANNER_BACKEND_METHODS`. Runtime guard against one side-drifting
 *      the interface (TS alone can catch most of this but only if the
 *      caller imports the right type; tests here fail loud either way).
 *
 * Explicitly out of scope: parity between legacy and store return shapes.
 * That's task007 — do NOT add value-level equality checks here.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import {
  getScannerBackend,
  SCANNER_BACKEND_METHODS,
  type IScannerBackend,
} from '../server/scanner/backend';
import { legacyBackend } from '../server/scanner/backend-legacy';
import { storeBackend } from '../server/scanner/backend-store';

describe('scanner backend selector (task003)', () => {
  const originalEnv = process.env.SCANNER_BACKEND;

  beforeEach(() => {
    delete process.env.SCANNER_BACKEND;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SCANNER_BACKEND;
    } else {
      process.env.SCANNER_BACKEND = originalEnv;
    }
  });

  describe('getScannerBackend()', () => {
    it('defaults to the store backend when SCANNER_BACKEND is unset', () => {
      const backend = getScannerBackend();
      expect(backend.name).toBe('store');
      expect(backend).toBe(storeBackend);
    });

    it('defaults to store for unknown values (typo tolerance)', () => {
      // Unknown values fall through to the default store backend rather
      // than silently flipping to legacy.
      process.env.SCANNER_BACKEND = 'nonsense';
      expect(getScannerBackend().name).toBe('store');
    });

    it('returns the store backend when SCANNER_BACKEND=store', () => {
      process.env.SCANNER_BACKEND = 'store';
      const backend = getScannerBackend();
      expect(backend.name).toBe('store');
      expect(backend).toBe(storeBackend);
    });

    it('case-insensitive and whitespace-tolerant for store', () => {
      process.env.SCANNER_BACKEND = '  STORE ';
      expect(getScannerBackend().name).toBe('store');
    });

    it('treats SCANNER_BACKEND=legacy explicitly (rollback escape hatch)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        process.env.SCANNER_BACKEND = 'legacy';
        const backend = getScannerBackend();
        expect(backend.name).toBe('legacy');
        expect(backend).toBe(legacyBackend);
      } finally {
        warn.mockRestore();
      }
    });

    it('logs a deprecation warning when SCANNER_BACKEND=legacy is used', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        process.env.SCANNER_BACKEND = 'legacy';
        getScannerBackend();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('SCANNER_BACKEND=legacy');
        expect(warn.mock.calls[0][0]).toContain('deprecated');
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('IScannerBackend interface completeness', () => {
    // Both backends must expose every method in `SCANNER_BACKEND_METHODS`.
    // This runtime guard is the belt to TS's suspenders — if someone adds
    // a new method to the interface but forgets to implement it on the
    // store backend, TypeScript catches it at compile time; if someone
    // accidentally names a method mismatching the interface, this test
    // catches it at runtime. (One of those can regress without the
    // other.)
    const cases: Array<[string, IScannerBackend]> = [
      ['legacyBackend', legacyBackend],
      ['storeBackend', storeBackend],
    ];

    for (const [label, backend] of cases) {
      it(`${label} implements every method in SCANNER_BACKEND_METHODS`, () => {
        for (const key of SCANNER_BACKEND_METHODS) {
          expect(backend, `${label} missing ${String(key)}`).toHaveProperty(
            key
          );
          // `name` is a string; the rest are functions.
          if (key === 'name') {
            expect(typeof backend.name).toBe('string');
          } else {
            expect(typeof backend[key]).toBe('function');
          }
        }
      });
    }

    it('backends report distinct names', () => {
      expect(legacyBackend.name).toBe('legacy');
      expect(storeBackend.name).toBe('store');
    });
  });
});
