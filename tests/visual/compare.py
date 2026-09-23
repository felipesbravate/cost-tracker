"""Compare two screenshot sets made by capture.py.

Run:  python3 tests/visual/compare.py <reference_dir> <candidate_dir> [diff_dir]

A pixel counts as changed when any channel differs by more than TOL (default 16). A shot passes
when at most MAX_PX (default 40) pixels changed: this absorbs sub-pixel antialiasing on the edge of
the slide-over panels, which is not stable between runs even on the same code. For every failing
shot a diff image is written (changed pixels in red over a faded copy of the reference).
"""
import glob, os, sys
from PIL import Image, ImageChops

TOL = int(os.environ.get('TOL', '16'))
MAX_PX = int(os.environ.get('MAX_PX', '40'))

def changed(a, b):
    d = ImageChops.difference(a, b).convert('RGB')
    mask = Image.eval(d, lambda v: 255 if v > TOL else 0).convert('L')
    mask = mask.point(lambda v: 255 if v else 0)
    return mask, mask.histogram()[255]

def main(ref, cand, out=None):
    fails, missing = [], []
    refs = sorted(glob.glob(os.path.join(ref, '*', '*.png')))
    for r in refs:
        rel = os.path.relpath(r, ref); c = os.path.join(cand, rel)
        if not os.path.exists(c): missing.append(rel); continue
        A, B = Image.open(r).convert('RGB'), Image.open(c).convert('RGB')
        if A.size != B.size:
            fails.append((rel, f'size {A.size} -> {B.size}')); continue
        mask, n = changed(A, B)
        if n > MAX_PX:
            fails.append((rel, f'{n} px changed in {mask.getbbox()}'))
            if out:
                os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
                base = Image.blend(A, Image.new('RGB', A.size, 'white'), 0.7)
                base.paste(Image.new('RGB', A.size, (230, 0, 0)), mask=mask)
                base.save(os.path.join(out, rel))
    print(f'{len(refs) - len(fails) - len(missing)}/{len(refs)} match')
    for rel, why in fails: print('DIFF   ', rel, why)
    for rel in missing: print('MISSING', rel)
    return 0 if not fails and not missing else 1

if __name__ == '__main__':
    if len(sys.argv) < 3: print(__doc__); sys.exit(2)
    sys.exit(main(*sys.argv[1:4]))
