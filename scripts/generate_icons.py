"""Validate the canonical icon source file used by web/PWA metadata."""

from pathlib import Path

CANONICAL = Path("public/icons/paw.png")


def main() -> None:
    if not CANONICAL.exists():
        raise FileNotFoundError(f"missing icon source: {CANONICAL}")
    print(f"icon source ready: {CANONICAL}")


if __name__ == "__main__":
    main()
