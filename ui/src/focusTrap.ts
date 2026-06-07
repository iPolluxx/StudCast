// Keyboard focus containment for modal dialogs (WCAG 2.4.3).
// Call from a document keydown listener while the dialog is open; it wraps Tab
// between the first and last focusable inside `panel` so focus can't escape to
// the page behind. aria-modal handles screen readers; this handles sighted
// keyboard users.
export function trapTab(e: KeyboardEvent, panel: HTMLElement | null) {
  if (e.key !== 'Tab' || !panel) return;
  const focusables = panel.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || active === panel) { e.preventDefault(); last.focus(); }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}
