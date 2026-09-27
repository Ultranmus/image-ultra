import { describe, expect, it } from 'vitest';
import { defaultLabels, formatCount, mergeLabels } from './i18n';

describe('labels', () => {
  it('merges groups key by key, keeping the other defaults', () => {
    const labels = mergeLabels({
      filterNames: { vivid: 'Lebendig' },
      steps: { crop: 'Zuschneiden' },
    });
    expect(labels.filterNames['vivid']).toBe('Lebendig');
    expect(labels.filterNames['noir']).toBe(defaultLabels.filterNames['noir']);
    expect(labels.steps.crop).toBe('Zuschneiden');
    expect(labels.steps.rotate).toBe('Rotate');
    expect(labels.undo).toBe('Undo');
  });

  it('has an English name for every built-in filter, size and sticker', () => {
    expect(Object.keys(defaultLabels.filterNames)).toHaveLength(28);
    expect(Object.values(defaultLabels.sizePresetNames)).toContain('Instagram 1:1');
    expect(defaultLabels.stickerNames['star']).toBe('Star');
  });

  it('fills count labels from a template or a plural function', () => {
    expect(formatCount('{count} selected', 3)).toBe('3 selected');
    const arabic = (n: number) => (n === 2 ? 'عنصران محددان' : `${n} عناصر محددة`);
    expect(formatCount(arabic, 2)).toBe('عنصران محددان');
    expect(formatCount(mergeLabels({ selectedCount: arabic }).selectedCount, 5)).toBe(
      '5 عناصر محددة',
    );
  });
});
