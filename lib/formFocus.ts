/**
 * Scrolls to and focuses the first invalid field on the page after a failed
 * form submission. Most field components (TextField, SelectField,
 * RatingSlider) mark their control aria-invalid, but a few compound fields
 * with no single control to mark (WineStyleField, the blend GrapeMultiSelect)
 * instead render their error message with role="alert" — querying for both
 * and taking whichever comes first in the DOM covers every field type
 * without needing per-field wiring. Call from a useEffect keyed on the
 * relevant error state so the DOM has already committed the new
 * aria-invalid/role="alert" markup by the time this runs.
 */
export function scrollToFirstInvalidField() {
  const target = document.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
}
