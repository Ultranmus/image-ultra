import {
  DEFAULT_WATERMARK,
  parseWatermark,
  type EditState,
  type WatermarkState,
} from '@image-ultra/core';

/**
 * The `watermark` prop: any watermark fields, plus `logo` (an image URL) for a logo watermark.
 * Missing fields use the defaults (bottom-right, 5 % high, 70 % opacity).
 */
export type WatermarkInput = Partial<Omit<WatermarkState, 'assetId' | 'kind'>> & { logo?: string };

/** Asset id used for the app's logo. */
export const APP_WATERMARK_ASSET = 'app-watermark-logo';

/** Puts the app's watermark (and its logo asset) into `state`. */
export function applyWatermarkInput(state: EditState, input: WatermarkInput): EditState {
  const { logo, ...fields } = input;
  const watermark =
    parseWatermark({
      ...DEFAULT_WATERMARK,
      ...fields,
      ...(logo ? { kind: 'image', assetId: APP_WATERMARK_ASSET } : { kind: 'text' }),
    }) ?? DEFAULT_WATERMARK;
  if (!logo) return { ...state, watermark };
  return {
    ...state,
    watermark,
    assets: {
      ...state.assets,
      // Real size comes from the decoded image; 1×1 keeps the asset valid when re-parsed.
      [APP_WATERMARK_ASSET]: {
        kind: 'raster',
        src: logo,
        width: 1,
        height: 1,
        mimeType: 'image/*',
      },
    },
  };
}
