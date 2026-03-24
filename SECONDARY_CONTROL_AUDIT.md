# Secondary interactive controls audit (current implementation)

## 1) Current families

The current secondary-control system is explicitly implemented through shared utility classes in `src/styles/shared.css`:

- `secondary-control secondary-control--inline-text`
- `secondary-control secondary-control--compact-button`
- `secondary-control secondary-control--icon`
- `secondary-control secondary-control--toggle`
- `secondary-control secondary-control--modal`

These families normalize hit area, padding, typography, radius, and interaction behavior through shared secondary tokens.

## 2) Old audit references → current mapping

- `clear-btn` → **still present**, now explicitly tagged as `secondary-control--inline-text`.
- `pat-edit-btn` → **still present**, now explicitly tagged as `secondary-control--icon`.
- `settings-collapsible-toggle` → **still present**, now explicitly tagged as `secondary-control--toggle`.
- `notif-toggle` → **still present**, now explicitly tagged as `secondary-control--toggle`.
- `modal-close-btn` → **still present** (via `ModalCloseButton`), now explicitly tagged as `secondary-control--icon`.
- `ring-sub-btn` → **still present**, now explicitly tagged as `secondary-control--inline-text`.
- `diag-run-btn` → **still present**, now explicitly tagged as `secondary-control--compact-button`.

No referenced control family was removed; the previous audit gap came from inconsistent discoverability rather than deletion.

## 3) Family membership examples (non-exhaustive)

- Inline text: `clear-btn`, `ring-sub-btn`
- Compact utility button: `copy-btn`, `settings-inline-btn`, `diag-run-btn`
- Icon-only button: `modal-close-btn`, `h-action-btn`, `pat-edit-btn`, `pat-edit-reset`
- Toggle/disclosure: `notif-toggle`, `settings-collapsible-toggle`
- Secondary modal action: `walk-cancel-btn`, `session-cancel-btn`, `history-delete-confirm`, `btn-cancel`

## 4) Verification checklist

- Search for `secondary-control--inline-text` etc. to list each family usage.
- Search for legacy classes above to confirm each one is assigned to exactly one secondary family.
- Confirm tokenized family definitions live centrally in `src/styles/shared.css`.

