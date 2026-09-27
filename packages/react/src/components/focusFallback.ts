/** Things keyboard focus can land on. */
const FOCUSABLE = 'button, input, [tabindex]:not([tabindex="-1"]), [role="slider"]';

const canFocus = (el: HTMLElement) =>
  !(el as HTMLButtonElement).disabled &&
  el.tabIndex >= 0 &&
  el.getClientRects().length > 0 &&
  !el.closest('[inert], [aria-hidden="true"]');

/** The nearest regions to search, closest first. */
const REGIONS = ['.iu-topbar__group', '.iu-toolgroup', '.iu-topbar', '.iu-controlbar'];

/**
 * Moves focus off `from` (a control that is about to be disabled or removed) so it never drops to
 * the page: to the next focusable control in the closest region (TopBar group, tool group, TopBar,
 * ControlBar), else the previous one, else the photo.
 */
export function focusNeighbour(from: HTMLElement) {
  for (const selector of REGIONS) {
    const region = from.closest(selector);
    if (!region) continue;
    const all = [...region.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el === from || canFocus(el),
    );
    const index = all.indexOf(from);
    if (index < 0) continue;
    const next = all[index + 1] ?? all[index - 1];
    if (next) {
      next.focus({ preventScroll: true });
      return;
    }
  }
  from
    .closest('.iu-root')
    ?.querySelector<HTMLElement>('.iu-annotate-layer, .iu-stage')
    ?.focus({ preventScroll: true });
}
