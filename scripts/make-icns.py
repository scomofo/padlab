"""Generate PadLab.icns: a 4x4 pad grid in the app's own palette.

No imaging libraries available, so PNGs are encoded by hand (zlib + CRC) and
packed into the ICNS container format.
"""
import struct, zlib, math

BG = (0x0b, 0x0e, 0x1a)
PANEL = (0x17, 0x1d, 0x31)
PADS = [
    (0xff, 0x5d, 0x73), (0xff, 0xb8, 0x4d), (0xff, 0xd1, 0x66), (0xc3, 0xf3, 0x6e),
    (0x3e, 0xf0, 0xc8), (0x4d, 0xd4, 0xff), (0x6e, 0xa8, 0xff), (0x8f, 0x7b, 0xff),
    (0xc7, 0x7b, 0xff), (0xff, 0x7b, 0xd5), (0xff, 0x8f, 0xa3), (0xff, 0xc7, 0x8f),
    (0xa7, 0xf0, 0x70), (0x70, 0xe8, 0xb0), (0x7b, 0xc4, 0xff), (0xb3, 0x9d, 0xff),
]


def rounded_alpha(x, y, x0, y0, x1, y1, r, ss=3):
    """Coverage of a rounded rect at a pixel, supersampled for smooth edges."""
    hits = 0
    for sy in range(ss):
        for sx in range(ss):
            px = x + (sx + 0.5) / ss
            py = y + (sy + 0.5) / ss
            if px < x0 or px > x1 or py < y0 or py > y1:
                continue
            cx = min(max(px, x0 + r), x1 - r)
            cy = min(max(py, y0 + r), y1 - r)
            if math.hypot(px - cx, py - cy) <= r:
                hits += 1
    return hits / (ss * ss)


def blend(dst, src, a):
    return tuple(round(d + (s - d) * a) for d, s in zip(dst, src))


def render(size):
    px = [[BG for _ in range(size)] for _ in range(size)]
    s = size / 1024.0

    # Outer rounded panel inset from the edge.
    inset, radius = 96 * s, 180 * s
    for y in range(size):
        for x in range(size):
            a = rounded_alpha(x, y, inset, inset, size - inset, size - inset, radius)
            if a:
                px[y][x] = blend(px[y][x], PANEL, a)

    # 4x4 pad grid.
    margin, gap = 176 * s, 34 * s
    cell = (size - 2 * margin - 3 * gap) / 4
    pr = cell * 0.26
    for row in range(4):
        for col in range(4):
            # Bottom-left is pad 1, matching the hardware layout.
            color = PADS[(3 - row) * 4 + col]
            x0 = margin + col * (cell + gap)
            y0 = margin + row * (cell + gap)
            for y in range(int(y0) - 2, int(y0 + cell) + 3):
                if not 0 <= y < size:
                    continue
                for x in range(int(x0) - 2, int(x0 + cell) + 3):
                    if not 0 <= x < size:
                        continue
                    a = rounded_alpha(x, y, x0, y0, x0 + cell, y0 + cell, pr)
                    if a:
                        px[y][x] = blend(px[y][x], color, a)

    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            r, g, b = px[y][x]
            rows += bytes((r, g, b, 255))
    return bytes(rows)


def png(size):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(render(size), 9))
            + chunk(b'IEND', b''))


# ICNS type -> pixel size
TYPES = [
    (b'ic11', 32), (b'ic12', 64), (b'ic07', 128),
    (b'ic13', 256), (b'ic08', 256), (b'ic14', 512), (b'ic09', 512), (b'ic10', 1024),
]

cache = {}
body = bytearray()
for tag, size in TYPES:
    if size not in cache:
        cache[size] = png(size)
        print(f'  rendered {size}x{size}')
    data = cache[size]
    body += tag + struct.pack('>I', len(data) + 8) + data

out = b'icns' + struct.pack('>I', len(body) + 8) + bytes(body)
open('/tmp/build/PadLab.icns', 'wb').write(out)
print(f'PadLab.icns: {len(out)} bytes, {len(TYPES)} entries')
