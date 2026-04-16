# PawTimer Premium Visual System 2026

This token system establishes a unified, warm-minimal visual language while preserving existing UI behavior.

## Token files

- `tokens/color.tokens.css`: primitive color palette.
- `tokens/semantic.tokens.css`: semantic roles (`--bg`, `--surf`, status roles, focus, brand).
- `tokens/spacing.tokens.css`: spacing and density scales.
- `tokens/typography.tokens.css`: typographic scale and semantic type roles.
- `tokens/radius-shadow-motion.tokens.css`: radius, elevation, and motion tokens.

## Migration notes

- `theme.css` now imports all token files and provides compatibility aliases for existing classes.
- Shared UI primitives in `shared.css` were migrated to use tokenized radius/border/motion sizing where possible.
- No app/business logic was changed.

## Visual direction mapping

- Warm neutral backgrounds and surfaces replace cool-white defaults.
- Calm green remains primary interactive focus color.
- Success / warning / error are handled through semantic status tokens.
- Soft depth is standardized via `--shadow` and `--shadow-lg`.
- Motion is intentionally calm with eased curves and tokenized durations.
