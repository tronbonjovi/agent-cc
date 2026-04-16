import { describe, it, expect } from 'vitest';
import {
  SOURCE_METADATA,
  getSourceMetadata,
  getWiredSources,
  getPlannedSources,
} from './source-metadata';
import { ALL_INTERACTION_SOURCES, type InteractionSource } from './types';

describe('source-metadata', () => {
  it('has metadata for every InteractionSource variant', () => {
    // Every variant in ALL_INTERACTION_SOURCES must have a matching SOURCE_METADATA entry.
    for (const source of ALL_INTERACTION_SOURCES) {
      const meta = getSourceMetadata(source);
      expect(meta).toBeDefined();
      expect(meta.id).toBe(source);
      expect(meta.displayName.length).toBeGreaterThan(0);
    }
    // And SOURCE_METADATA must not have any extra keys beyond the enum.
    const metaKeys = Object.keys(SOURCE_METADATA) as InteractionSource[];
    expect(metaKeys.sort()).toEqual([...ALL_INTERACTION_SOURCES].sort());
  });

  it('getWiredSources returns only wired entries', () => {
    const wired = getWiredSources();
    expect(wired.length).toBeGreaterThan(0);
    for (const meta of wired) {
      expect(meta.wiringStatus).toBe('wired');
    }
  });

  it('getPlannedSources returns only planned entries', () => {
    const planned = getPlannedSources();
    expect(planned.length).toBeGreaterThan(0);
    for (const meta of planned) {
      expect(meta.wiringStatus).toBe('planned');
    }
  });

  it('all external-category sources are planned (no wired externals yet)', () => {
    for (const meta of Object.values(SOURCE_METADATA)) {
      if (meta.category === 'external') {
        expect(meta.wiringStatus).toBe('planned');
      }
    }
  });

  it('every source has a non-empty icon string', () => {
    for (const meta of Object.values(SOURCE_METADATA)) {
      expect(typeof meta.icon).toBe('string');
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });
});
