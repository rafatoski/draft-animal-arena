"""Repacks an AI-generated 6-column spritesheet (non-integer cell size) into the game's 256x256 cell grid.
usage: python3 pack-fighter-sheet.py <source.png> <source rows> <out.png> [scale]
Each source cell is a window of the sheet (W/6 x H/rows). Pixels of the sprite components whose centre lies in a window are copied,
so a few pixels of the neighbouring row (feet, tails) never bleed in. Nothing is redrawn or invented; frames are only resampled.
The output has 12 rows x 6 columns of 256x256 cells, the source row r going to output row r."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, rows, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 1.5
im = Image.open(src).convert('RGBA'); a = np.array(im)
H, W = a.shape[:2]; cw, ch = W / 6, H / rows
sheet = Image.new('RGBA', (1536, 256 * 12), (0, 0, 0, 0))
feet = {}
# The generated rows are not exactly H/rows tall: find each row boundary at the emptiest horizontal line near its nominal position.
density = np.convolve((a[:, :, 3] > 40).sum(1).astype(float), np.ones(5) / 5, 'same')
bounds = [0]
for r in range(1, rows):
    nominal = round(r * ch); lo, hi = max(bounds[-1] + 40, nominal - 40), min(H - 40, nominal + 40)
    bounds.append(lo + int(np.argmin(density[lo:hi])))
bounds.append(H)
print('row bounds', bounds)
def clean(win):
    """Drops the few-pixel slivers of a neighbouring row/column that fall inside this window (feet, ears, tails): components that
    touch the window border and are small compared with the window."""
    solid = win[:, :, 3] > 8
    lab, n = ndi.label(solid, structure=np.ones((3, 3)))
    hh, ww = solid.shape
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start; area = (lab[sl] == i).sum()
        edge = sl[0].start == 0 or sl[0].stop == hh or sl[1].start == 0 or sl[1].stop == ww
        if edge and area < .06 * hh * ww and (h < .3 * hh or w < .3 * ww): win[lab == i] = 0
    return win
for r in range(rows):
    for c in range(6):
        x0, y0, x1, y1 = round(c * cw), bounds[r], round((c + 1) * cw), bounds[r + 1]
        win = clean(a[y0:y1, x0:x1].copy())
        if not (win[:, :, 3] > 8).any(): continue
        frame = Image.fromarray(win).resize((round((x1 - x0) * scale), min(256, round((y1 - y0) * scale))), Image.LANCZOS)
        cell = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
        cell.alpha_composite(frame, (max(0, (256 - frame.width) // 2), 256 - frame.height))  # centred, bottom aligned
        sheet.alpha_composite(cell, (c * 256, r * 256))
sheet.save(out, optimize=True)
print(out, sheet.size, feet)
