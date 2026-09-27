import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useEditorState,
  useEditorStore,
  useLabels,
  useStickerLibraryUrl,
  useStickers,
} from '../../context';
import { IconButton } from '../../components/IconButton';
import { useRovingFocus } from '../../hooks/useRovingFocus';
import { Popover } from '../../controls/Popover';
import { PresetStrip } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { IconDuplicate, IconOpacity, IconTrash, IconUpload } from '../../icons/Icon';
import { shapeActions } from '../annotate/actions';
import { referenceSize, useAnnotateState } from '../annotate/state';
import { fileToAsset } from '../assets';
import { BUILTIN_STICKERS, stickerDataUrl } from './builtins';
import {
  EMOJI_GROUPS,
  filterEmoji,
  loadEmoji,
  stickerUrl,
  type EmojiEntry,
  type EmojiGroup,
} from './emojiData';
import { placeSticker, rasterizeEmoji, rasterizeUrl, urlAsset } from './place';
import { undoStep } from '../../controls/undoStep';

type Tab = 'stickers' | 'emoji';
type Category = 'basic' | EmojiGroup;

/**
 * Sticker ControlBar (UI_VISION §5b). Row 1: Stickers · Emoji, search, Upload (+ opacity /
 * duplicate / delete for a selected sticker). Row 2: categories — Stickers starts with "Basic"
 * (the app's stickers + ours), then the 3D library. Row 3: the tiles. A tap places the sticker in
 * the middle of the photo, selected.
 */
export function StickerControls() {
  const store = useEditorStore();
  const labels = useLabels();
  const appStickers = useStickers();
  const libraryUrl = useStickerLibraryUrl();
  // The Sticker tool's own selection (tool state is per tool), shared with its stage overlay.
  const [ui, setUi] = useAnnotateState();
  const shapes = useEditorState((s) => s.edit.annotations);
  const [tab, setTab] = useState<Tab>('stickers');
  const [category, setCategory] = useState<Category>('basic');
  const [query, setQuery] = useState('');
  const stripRef = useRef<HTMLDivElement>(null);
  // The tiles are one Tab stop; arrow keys move between them.
  const roving = useRovingFocus(stripRef, '.iu-stickerstrip__tile', `${tab}/${category}/${query}`);
  const [emoji, setEmoji] = useState<EmojiEntry[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = shapes.find((s) => s.id === ui.selectedId) ?? null;
  const actions = shapeActions(store, labels);

  // The full emoji list loads the first time it's needed (Emoji tab, 3D library, or a search).
  const needsEmoji = tab === 'emoji' || category !== 'basic' || query !== '';
  useEffect(() => {
    if (!needsEmoji || emoji) return;
    let active = true;
    void loadEmoji().then((list) => {
      if (active) setEmoji(list);
    });
    return () => {
      active = false;
    };
  }, [needsEmoji, emoji]);

  const place = async (make: () => Promise<Parameters<typeof placeSticker>[1]>) => {
    const asset = await make();
    const id = placeSticker(store, asset, labels.stickerAdd);
    if (id) setUi((u) => ({ ...u, selectedId: id }));
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setQuery('');
    setCategory(next === 'emoji' ? 'smileys' : 'basic');
  };

  const categories: Category[] =
    tab === 'stickers' ? ['basic', ...(libraryUrl ? EMOJI_GROUPS : [])] : [...EMOJI_GROUPS];

  // Tiles for the current tab / category / search.
  let tiles: ReactNode[];
  if (tab === 'stickers' && category === 'basic' && !query) {
    tiles = [
      ...appStickers.map((sticker) => (
        <Tile
          key={`app-${sticker.id}`}
          label={sticker.label}
          onPick={() => void place(() => urlAsset(sticker.src))}
        >
          <img src={sticker.src} alt="" />
        </Tile>
      )),
      ...BUILTIN_STICKERS.map((sticker) => (
        <Tile
          key={sticker.id}
          label={sticker.label}
          onPick={() => void place(() => rasterizeUrl(stickerDataUrl(sticker), 512, 'sticker'))}
        >
          <img src={stickerDataUrl(sticker)} alt="" />
        </Tile>
      )),
    ];
  } else if (!emoji) {
    tiles = [];
  } else {
    const group = category === 'basic' ? 'smileys' : category;
    const found = filterEmoji(emoji, group, query);
    tiles =
      tab === 'emoji'
        ? found.map((e) => (
            <Tile
              key={e.hex}
              label={e.label}
              emoji
              onPick={() => void place(async () => rasterizeEmoji(e.emoji))}
            >
              {e.emoji}
            </Tile>
          ))
        : found.flatMap((e) => {
            const url = libraryUrl && stickerUrl(e, libraryUrl);
            if (!url) return [];
            return [
              <Tile
                key={e.hex}
                label={e.label}
                onPick={() => void place(() => rasterizeUrl(url, 512, 'sticker/fluent-3d'))}
              >
                <img src={url} alt="" loading="lazy" crossOrigin="anonymous" />
              </Tile>,
            ];
          });
  }

  return (
    <div className="iu-sticker">
      <div className="iu-sticker__row">
        <SegmentedControl
          label={labels.stickers}
          value={tab}
          options={[
            { value: 'stickers', label: labels.stickerTabs.stickers },
            { value: 'emoji', label: labels.stickerTabs.emoji },
          ]}
          onChange={switchTab}
        />
        <label className="iu-field iu-sticker__search">
          <span className="iu-sr-only">{labels.stickerSearch}</span>
          <input
            className="iu-field__input"
            type="search"
            placeholder={labels.stickerSearch}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <IconButton
          label={labels.stickerUpload}
          icon={<IconUpload />}
          onClick={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="iu-sr-only"
          tabIndex={-1}
          // Opened by the visible button next to it: hidden from screen readers.
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void place(async () => {
              const asset = await fileToAsset(file, 'sticker/upload', 1024);
              if (!asset) throw new Error('image-ultra: not an image');
              return asset;
            }).catch(() => undefined);
          }}
        />
        {selected && (
          <div className="iu-toolgroup iu-sticker__actions">
            <Popover
              label={labels.opacity}
              trigger={<IconButton label={labels.opacity} icon={<IconOpacity />} />}
            >
              <RulerSlider
                label={labels.opacity}
                value={Math.round(selected.opacity * 100)}
                min={0}
                max={100}
                unitWidth={2.4}
                tickEvery={5}
                majorEvery={25}
                defaultValue={100}
                format={(v) => `${v}%`}
                {...undoStep(store, labels.opacity)}
                onChange={(v) =>
                  store.getState().update(labels.opacity, (draft) => {
                    const shape = draft.annotations.find((s) => s.id === selected.id);
                    if (shape) shape.opacity = v / 100;
                  })
                }
              />
            </Popover>
            <IconButton
              label={labels.duplicate}
              icon={<IconDuplicate />}
              onClick={() => {
                const { image, edit } = store.getState();
                const offset = image ? referenceSize(image, edit) * 0.03 : 0;
                const id = actions.duplicate(selected, offset);
                setUi((u) => ({ ...u, selectedId: id }));
              }}
            />
            <IconButton
              label={labels.deleteShape}
              icon={<IconTrash />}
              onClick={(event) => {
                const root = event.currentTarget.closest('.iu-root');
                actions.remove(selected.id);
                setUi((u) => ({ ...u, selectedId: null }));
                root
                  ?.querySelector<HTMLElement>('.iu-annotate-layer')
                  ?.focus({ preventScroll: true });
              }}
            />
          </div>
        )}
      </div>

      {!query && (
        <PresetStrip
          label={labels.stickerCategories}
          value={category}
          onSelect={setCategory}
          presets={categories.map((c) => ({
            value: c,
            label: c === 'basic' ? labels.stickerBasic : labels.emojiGroups[c],
          }))}
        />
      )}

      <div
        ref={stripRef}
        className="iu-stickerstrip"
        role="group"
        aria-label={labels.stickers}
        onFocus={roving.onFocus}
        onKeyDown={roving.onKeyDown}
      >
        {tiles.length > 0 ? (
          tiles
        ) : (
          <p className="iu-controlbar__hint">
            {emoji || !needsEmoji ? labels.stickerNoResults : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  emoji = false,
  onPick,
  children,
}: {
  label: string;
  emoji?: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={['iu-stickerstrip__tile', emoji && 'iu-stickerstrip__emoji']
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      data-tooltip={label}
      onClick={onPick}
    >
      {children}
    </button>
  );
}
