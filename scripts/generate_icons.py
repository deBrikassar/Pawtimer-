"""Generate PawTimer PNG icons from code (text-only workflow, no binary edits in PRs)."""

import struct
import zlib
from pathlib import Path

BG = (244, 240, 230, 255)
GREEN = (96, 160, 128, 255)


def build_icon(size: int) -> bytes:
    px = [[*BG] * size for _ in range(size)]

    def put(x: int, y: int, c: tuple[int, int, int, int]) -> None:
        if 0 <= x < size and 0 <= y < size:
            px[y][x * 4 : x * 4 + 4] = c

    def ellipse(cx: float, cy: float, rx: float, ry: float) -> None:
        x0, x1 = int(cx - rx - 1), int(cx + rx + 1)
        y0, y1 = int(cy - ry - 1), int(cy + ry + 1)
        for y in range(max(0, y0), min(size, y1 + 1)):
            dy = (y - cy) / ry
            for x in range(max(0, x0), min(size, x1 + 1)):
                dx = (x - cx) / rx
                if dx * dx + dy * dy <= 1:
                    put(x, y, GREEN)

    # closed ring
    cx = cy = size / 2
    r_outer, r_inner = 0.33 * size, 0.297 * size
    for y in range(size):
        dy = y - cy
        for x in range(size):
            dx = x - cx
            d2 = dx * dx + dy * dy
            if r_inner * r_inner <= d2 <= r_outer * r_outer:
                put(x, y, GREEN)

    # toes
    ellipse(0.37 * size, 0.38 * size, 0.055 * size, 0.078 * size)
    ellipse(0.50 * size, 0.36 * size, 0.055 * size, 0.078 * size)
    ellipse(0.63 * size, 0.38 * size, 0.055 * size, 0.078 * size)
    ellipse(0.285 * size, 0.49 * size, 0.053 * size, 0.073 * size)
    ellipse(0.715 * size, 0.49 * size, 0.053 * size, 0.073 * size)

    # pad
    ellipse(0.43 * size, 0.66 * size, 0.16 * size, 0.16 * size)
    ellipse(0.57 * size, 0.66 * size, 0.16 * size, 0.16 * size)
    ellipse(0.50 * size, 0.64 * size, 0.18 * size, 0.11 * size)
    ellipse(0.50 * size, 0.72 * size, 0.19 * size, 0.10 * size)

    raw = b"".join(b"\x00" + bytes(row) for row in px)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    targets = {
        Path("public/icons/icon-180.png"): 180,
        Path("public/icons/icon-192.png"): 192,
        Path("public/icons/icon-512.png"): 512,
        Path("icon-maskable.png"): 512,
    }
    for path, size in targets.items():
        path.write_bytes(build_icon(size))
        print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
