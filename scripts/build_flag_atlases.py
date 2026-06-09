"""
Generate 12 flag atlas images (1024x1024) for the World Cup prediction game.
Each atlas contains 4 flags arranged in a 2x2 grid, organized by group.

Layout:
  [pos 0 | pos 1]
  [pos 2 | pos 3]

Run from the repo root:  python scripts/build_flag_atlases.py
"""

from PIL import Image
import os
import shutil

FLAGS_DIR = 'images/flags'
ATLAS_SIZE = 1024
CELL = ATLAS_SIZE // 2  # 512

GROUPS = [
    ('a', ['mx', 'za', 'kr', 'cz']),
    ('b', ['ca', 'ba', 'qa', 'ch']),
    ('c', ['br', 'ma', 'ht', 'gb-sct']),
    ('d', ['us', 'py', 'au', 'tr']),
    ('e', ['de', 'cw', 'ci', 'ec']),
    ('f', ['nl', 'jp', 'se', 'tn']),
    ('g', ['be', 'eg', 'ir', 'nz']),
    ('h', ['es', 'cv', 'sa', 'uy']),
    ('i', ['fr', 'sn', 'iq', 'no']),
    ('j', ['ar', 'dz', 'at', 'jo']),
    ('k', ['pt', 'cd', 'uz', 'co']),
    ('l', ['gb-eng', 'hr', 'gh', 'pa']),
]

USED_CODES = {code for _, codes in GROUPS for code in codes}

# Cell positions: (col, row) where col/row are 0 or 1
CELL_POS = [(0, 0), (1, 0), (0, 1), (1, 1)]


def fill_cell(img: Image.Image, cell_px: int) -> Image.Image:
    """Stretch img to fill cell_px x cell_px exactly — no padding, no letterbox."""
    return img.resize((cell_px, cell_px), Image.LANCZOS)


def build_atlases():
    for letter, codes in GROUPS:
        atlas = Image.new('RGBA', (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
        for i, code in enumerate(codes):
            src = os.path.join(FLAGS_DIR, f'{code}.png')
            flag = Image.open(src).convert('RGBA')
            cell_img = fill_cell(flag, CELL)
            col, row = CELL_POS[i]
            atlas.paste(cell_img, (col * CELL, row * CELL))
        out = os.path.join(FLAGS_DIR, f'atlas_{letter}.png')
        atlas.save(out, optimize=True)
        print(f'  Created {out}')


def delete_unused():
    deleted = 0
    for fname in os.listdir(FLAGS_DIR):
        if not fname.endswith('.png'):
            continue
        if fname.startswith('atlas_'):
            continue
        code = fname[:-4]  # strip .png
        if code not in USED_CODES:
            os.remove(os.path.join(FLAGS_DIR, fname))
            deleted += 1
    print(f'  Deleted {deleted} unused flag files')


def delete_source_flags():
    """Remove the individual flag PNGs that are now baked into atlases."""
    deleted = 0
    for code in USED_CODES:
        path = os.path.join(FLAGS_DIR, f'{code}.png')
        if os.path.exists(path):
            os.remove(path)
            deleted += 1
    print(f'  Deleted {deleted} source flag files')


if __name__ == '__main__':
    print('Building atlases...')
    build_atlases()
    print('Removing unused flags...')
    delete_unused()
    print('Removing source flags baked into atlases...')
    delete_source_flags()
    print('Done.')
