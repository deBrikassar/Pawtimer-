"""Validate the canonical PNG app logo path used across iOS/Android/Chrome."""

from pathlib import Path

APP_LOGO_PATH = Path("public/icons/app-logo.png")


def main() -> None:
    if not APP_LOGO_PATH.exists():
        raise FileNotFoundError(f"missing {APP_LOGO_PATH}")
    print(f"found {APP_LOGO_PATH}")


if __name__ == "__main__":
    main()
