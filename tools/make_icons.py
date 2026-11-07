# -*- coding: utf-8 -*-
"""生成扩展图标（纯标准库，不依赖 Pillow）。

    python tools/make_icons.py

输出 extension/icons/icon16.png、icon48.png、icon128.png
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"

C1 = (37, 99, 235)    # #2563EB
C2 = (124, 58, 237)   # #7C3AED


def _round_rect(u: float, v: float, m: float = 0.015, r: float = 0.235) -> bool:
    x = min(u - m, 1 - m - u)
    y = min(v - m, 1 - m - v)
    if x < 0 or y < 0:
        return False
    if x >= r or y >= r:
        return True
    return (r - x) ** 2 + (r - y) ** 2 <= r * r


def _arrow_R(u: float, v: float) -> bool:
    """向右箭头"""
    if 0.17 <= u <= 0.60 and 0.392 <= v <= 0.470:
        return True
    if 0.575 <= u <= 0.795:
        t = (0.795 - u) / (0.795 - 0.575)
        return abs(v - 0.431) <= 0.132 * t
    return False


def _arrow_L(u: float, v: float) -> bool:
    """向左箭头"""
    if 0.40 <= u <= 0.83 and 0.530 <= v <= 0.608:
        return True
    if 0.205 <= u <= 0.425:
        t = (u - 0.205) / (0.425 - 0.205)
        return abs(v - 0.569) <= 0.132 * t
    return False


def render(size: int, ss: int = 4) -> bytearray:
    buf = bytearray(size * size * 4)
    step = 1.0 / (size * ss)
    for py in range(size):
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    u = (px * ss + sx + 0.5) * step
                    v = (py * ss + sy + 0.5) * step
                    if not _round_rect(u, v):
                        continue
                    # 背景渐变（左上 -> 右下）
                    k = (u + v) / 2
                    br = C1[0] + (C2[0] - C1[0]) * k
                    bg = C1[1] + (C2[1] - C1[1]) * k
                    bb = C1[2] + (C2[2] - C1[2]) * k
                    if _arrow_R(u, v) or _arrow_L(u, v):
                        br = bg = bb = 255.0
                    r += br
                    g += bg
                    b += bb
                    a += 255.0
            total = ss * ss
            if a <= 0:
                continue
            # 预乘还原
            cover = a / 255.0
            i = (py * size + px) * 4
            buf[i] = int(min(255, round(r / cover)))
            buf[i + 1] = int(min(255, round(g / cover)))
            buf[i + 2] = int(min(255, round(b / cover)))
            buf[i + 3] = int(min(255, round(a / total)))
    return buf


def write_png(path: Path, size: int, rgba: bytearray) -> None:
    raw = b"".join(b"\x00" + bytes(rgba[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for s in (16, 48, 128):
        write_png(OUT / f"icon{s}.png", s, render(s))
        print("wrote", OUT / f"icon{s}.png")


if __name__ == "__main__":
    main()
