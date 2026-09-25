import {
  createGeometryState,
  cropForAspect,
  fitCrop,
  flipAnnotations,
  flipGeometry,
  getCropRect,
  getOrientedSize,
  MAX_TILT_DEGREES,
  rotateAnnotations,
  rotateRedactions,
  flipRedactions,
  rotateGeometry,
  rotateResize,
  syncResizeToCrop,
  type EditState,
  type GeometryState,
  type LoadedImage,
} from '@image-ultra/core';
import { useEditorStore } from '../../context';

/** The dial can edit one of these. */
export type AngleKind = 'straighten' | 'tiltVertical' | 'tiltHorizontal';

export type AspectChoice =
  | 'free'
  | 'original'
  | 'circle'
  | '1:1'
  | '4:5'
  | '5:4'
  | '3:4'
  | '4:3'
  | '2:3'
  | '3:2'
  | '9:16'
  | '16:9';

export const RATIO_CHOICES = [
  '1:1',
  '4:5',
  '5:4',
  '3:4',
  '4:3',
  '2:3',
  '3:2',
  '9:16',
  '16:9',
] as const;

export function ratioValue(choice: (typeof RATIO_CHOICES)[number]): number {
  const [w, h] = choice.split(':').map(Number) as [number, number];
  return w / h;
}

/** Reads the dial value (in degrees) for `kind`. */
export function getAngle(geometry: GeometryState, kind: AngleKind): number {
  if (kind === 'straighten') return geometry.straighten;
  const value = kind === 'tiltVertical' ? geometry.perspective.y : geometry.perspective.x;
  return value * MAX_TILT_DEGREES;
}

/** Which aspect chip matches the current geometry. */
export function getAspectChoice(
  image: LoadedImage | null,
  geometry: GeometryState,
): AspectChoice | null {
  if (geometry.cropShape === 'ellipse') return 'circle';
  const aspect = geometry.cropAspect;
  if (aspect === null) return 'free';
  const match = RATIO_CHOICES.find((c) => Math.abs(ratioValue(c) - aspect) < 1e-3);
  if (match) return match;
  if (image) {
    const oriented = getOrientedSize(image, geometry);
    if (Math.abs(oriented.width / oriented.height - aspect) < 1e-3) return 'original';
  }
  return null;
}

/** All Adjust-tool edits. Each call is one undo step (angles: one step per drag). */
export function useAdjust() {
  const store = useEditorStore();

  const apply = (label: string, change: (image: LoadedImage, edit: EditState) => EditState) => {
    const { image, edit, update } = store.getState();
    if (!image) return;
    const next = change(image, edit);
    update(label, () => next);
  };

  return {
    rotateLeft() {
      apply('Rotate', (image, edit) => ({
        ...edit,
        geometry: rotateGeometry(image, edit.geometry, -1),
        annotations: rotateAnnotations(edit.annotations, getOrientedSize(image, edit.geometry), -1),
        redactions: rotateRedactions(edit.redactions, getOrientedSize(image, edit.geometry), -1),
        resize: rotateResize(edit.resize),
      }));
    },

    flip(axis: 'x' | 'y') {
      apply('Flip', (image, edit) => ({
        ...edit,
        geometry: flipGeometry(image, edit.geometry, axis),
        annotations: flipAnnotations(edit.annotations, getOrientedSize(image, edit.geometry), axis),
        redactions: flipRedactions(edit.redactions, getOrientedSize(image, edit.geometry), axis),
      }));
    },

    /**
     * Sets straighten/tilt (degrees) and shrinks the crop so no empty corners appear. While a drag
     * is open (`beginChange`), the crop from the start of the drag is the reference, so it grows
     * back when the angle returns.
     */
    setAngle(kind: AngleKind, degrees: number) {
      const label = kind === 'straighten' ? 'Straighten' : 'Perspective';
      apply(label, (image, edit) => {
        const base = store.getState().pendingChange?.base ?? edit;
        const geometry: GeometryState = { ...edit.geometry };
        if (kind === 'straighten') geometry.straighten = degrees;
        else {
          const value = degrees / MAX_TILT_DEGREES;
          geometry.perspective =
            kind === 'tiltVertical'
              ? { ...geometry.perspective, y: value }
              : { ...geometry.perspective, x: value };
        }
        geometry.crop = fitCrop(image, geometry, getCropRect(image, base.geometry));
        return { ...edit, geometry };
      });
    },

    setAspect(choice: AspectChoice) {
      apply('Aspect ratio', (image, edit) => {
        const g = edit.geometry;
        if (choice === 'free') {
          return { ...edit, geometry: { ...g, cropAspect: null, cropShape: 'rect' } };
        }
        const oriented = getOrientedSize(image, g);
        const aspect =
          choice === 'circle'
            ? 1
            : choice === 'original'
              ? oriented.width / oriented.height
              : ratioValue(choice);
        const crop = cropForAspect(image, g, aspect);
        return {
          ...edit,
          geometry: {
            ...g,
            crop,
            cropAspect: aspect,
            cropShape: choice === 'circle' ? 'ellipse' : 'rect',
          },
          resize: syncResizeToCrop(edit.resize, crop),
        };
      });
    },

    /** Resets rotation, flips, angles and crop. Resize is left alone (it has its own tool). */
    reset() {
      apply('Reset adjustments', (image, edit) => ({
        ...edit,
        geometry: createGeometryState(),
        resize: edit.resize
          ? syncResizeToCrop(edit.resize, getCropRect(image, createGeometryState()))
          : null,
      }));
    },
  };
}

/** `true` when the Adjust tool has nothing to reset. */
export function isDefaultGeometry(geometry: GeometryState): boolean {
  const d = createGeometryState();
  return (
    geometry.rotation === d.rotation &&
    geometry.flipX === d.flipX &&
    geometry.flipY === d.flipY &&
    geometry.straighten === 0 &&
    geometry.perspective.x === 0 &&
    geometry.perspective.y === 0 &&
    geometry.crop === null &&
    geometry.cropAspect === null &&
    geometry.cropShape === 'rect'
  );
}
