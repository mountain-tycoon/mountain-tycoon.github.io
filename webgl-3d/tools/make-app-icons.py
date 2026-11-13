import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
logo = Image.open(src).convert('RGBA')
# Bergmotiv mit Skibrille (ohne Schriftzug)
motif = logo.crop((80, 30, 820, 356))

def background(S):
    top, bot = (16, 34, 62), (5, 8, 15)
    bg = Image.new('RGB', (S, S))
    px = bg.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(S):
            px[x, y] = c
    return bg

def make(S, fill):
    """fill = Anteil der Kantenlänge, den das Motiv in der Breite einnimmt."""
    big = 1024
    bg = background(big).convert('RGBA')
    w = round(big * fill)
    h = round(motif.height * w / motif.width)
    m = motif.resize((w, h), Image.LANCZOS)
    bg.alpha_composite(m, ((big - w) // 2, (big - h) // 2 - round(big * 0.01)))
    return bg.convert('RGB').resize((S, S), Image.LANCZOS)

make(180, 0.90).save(f'{out}/apple-touch-icon.png', optimize=True)
make(192, 0.90).save(f'{out}/icon-192.png', optimize=True)
make(512, 0.90).save(f'{out}/icon-512.png', optimize=True)
make(512, 0.68).save(f'{out}/icon-maskable-512.png', optimize=True)   # Motiv in der sicheren Zone
print('ok')
