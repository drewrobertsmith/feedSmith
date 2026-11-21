"""Draws feedSmith's mark: Article cards fanned behind a cream front card with a gold bookmark.

Usage: uvx --with pillow==11.3.0 python -I scripts/draw-icon.py assets/images
"""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
MIDNIGHT = (0x1D, 0x25, 0x32, 255)
FOREST = (0x2D, 0x42, 0x3E, 255)
SAGE = (0x50, 0x71, 0x6C, 255)
CREAM = (0xF3, 0xEC, 0xDD, 255)
GOLD = (0xCB, 0xB0, 0x7B, 255)
SLATE = (0x4A, 0x54, 0x68, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling


def mark(size, mono=False, background=None, scale=1.0):
    s = size * SS
    img = Image.new('RGBA', (s, s), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = s / 1024 * scale
    off = (s - 1024 * k) / 2

    def box(x0, y0, x1, y1):
        return [off + x0 * k, off + y0 * k, off + x1 * k, off + y1 * k]

    r = 40 * k
    clear = (0, 0, 0, 0)
    gap = 16
    cards = [  # back to front: same-size pages fanned up and right, a stream arriving at the page you read
        ((402, 292, 702, 652), FOREST),
        ((362, 332, 662, 692), SAGE),
        ((322, 372, 622, 732), CREAM),
    ]
    for i, ((x0, y0, x1, y1), colour) in enumerate(cards):
        if i:
            # A Midnight (or, in monochrome, transparent) gap keeps each page distinct.
            d.rounded_rectangle(box(x0 - gap, y0 - gap, x1 + gap, y1 + gap), radius=r + gap * k, fill=clear if mono else MIDNIGHT)
        d.rounded_rectangle(box(x0, y0, x1, y1), radius=r, fill=WHITE if mono else colour)

    ink = (0, 0, 0, 0) if mono else SLATE
    # Title and two text lines on the front card.
    d.rounded_rectangle(box(358, 440, 520, 466), radius=13 * k, fill=ink)
    d.rounded_rectangle(box(358, 510, 586, 526), radius=8 * k, fill=ink)
    d.rounded_rectangle(box(358, 556, 560, 572), radius=8 * k, fill=ink)

    # Gold bookmark ribbon hanging from the front card's top edge.
    rib = (0, 0, 0, 0) if mono else GOLD
    x0, x1, y0, y1, notch = 548, 594, 372, 488, 22
    d.polygon(
        [(off + x * k, off + y * k) for x, y in [(x0, y0), (x1, y0), (x1, y1), ((x0 + x1) / 2, y1 - notch), (x0, y1)]],
        fill=rib,
    )
    return img.resize((size, size), Image.LANCZOS)


mark(1024).save(f'{OUT}/android-icon-foreground.png')
mark(1024, mono=True).save(f'{OUT}/android-icon-monochrome.png')
mark(1024, background=MIDNIGHT, scale=1.45).save(f'{OUT}/icon.png')
mark(1024, scale=1.6).save(f'{OUT}/splash-icon.png')
mark(48, background=MIDNIGHT, scale=1.6).save(f'{OUT}/favicon.png')
Image.new('RGBA', (1024, 1024), MIDNIGHT).save(f'{OUT}/android-icon-background.png')
print('ok')
