"""Generate the canonical SVG app logo used across iOS/Android/Chrome.

This repository keeps icons text-only to avoid binary files in pull requests.
"""

from pathlib import Path

APP_LOGO_PATH = Path("public/icons/app-logo.svg")

APP_LOGO_SVG = """<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\" role=\"img\" aria-label=\"PawTimer logo\">\n  <defs>\n    <linearGradient id=\"pawGradient\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#93C998\"/>\n      <stop offset=\"100%\" stop-color=\"#067B78\"/>\n    </linearGradient>\n  </defs>\n\n  <path d=\"M912 352\n           A420 420 0 1 0 902 670\"\n        fill=\"none\"\n        stroke=\"url(#pawGradient)\"\n        stroke-width=\"42\"\n        stroke-linecap=\"butt\"/>\n\n  <ellipse cx=\"446\" cy=\"394\" rx=\"58\" ry=\"90\" fill=\"url(#pawGradient)\"/>\n  <ellipse cx=\"606\" cy=\"394\" rx=\"58\" ry=\"90\" fill=\"url(#pawGradient)\"/>\n  <ellipse cx=\"298\" cy=\"510\" rx=\"70\" ry=\"86\" transform=\"rotate(-28 298 510)\" fill=\"url(#pawGradient)\"/>\n  <ellipse cx=\"754\" cy=\"510\" rx=\"70\" ry=\"86\" transform=\"rotate(28 754 510)\" fill=\"url(#pawGradient)\"/>\n\n  <path d=\"M512 550\n           C454 550 401 596 357 648\n           C304 710 289 775 326 821\n           C367 872 449 866 512 843\n           C575 866 657 872 698 821\n           C735 775 720 710 667 648\n           C623 596 570 550 512 550Z\"\n        fill=\"url(#pawGradient)\"/>\n</svg>\n"""


def main() -> None:
    APP_LOGO_PATH.write_text(APP_LOGO_SVG, encoding="utf-8")
    print(f"wrote {APP_LOGO_PATH}")


if __name__ == "__main__":
    main()
