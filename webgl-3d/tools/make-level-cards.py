#!/usr/bin/env python3
"""Level-Karten des Hauptmenüs (public/levels/<id>.png) pflegen.

Nummer, Name und Land sind Teil der Grafik. Dieses Skript
  renumber <id>=<nr> …           schreibt die Nummer einer bestehenden Karte neu (nach Umstellen der Kampagne)
  card <id> <nr> <NAME> <LAND> <bild>   baut eine Karte aus einem Bild (z. B. Bildschirmfoto aus dem Spiel)
  loading <id> <bild>            macht aus einem Bild das Ladebild (public/loading/<id>.png, Graustufen)

Aufruf in webgl-3d/:  python3 tools/make-level-cards.py renumber alpen=5 italien=6
Braucht Pillow und die Schrift Inter (Pfad unten anpassen, falls sie woanders liegt).
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps

FONT = '/usr/share/fonts/opentype/inter/Inter-%s.otf'
W, H = 747, 187
BG = (13, 13, 13)

def font(weight, size):
    return ImageFont.truetype(FONT % weight, size)

def spaced(draw, xy, text, fnt, fill, gap):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + gap

def number(draw, nr):
    draw.rectangle([22, 40, 96, 73], fill=BG)
    spaced(draw, (30, 48), '%02d' % nr, font('Medium', 20), (236, 236, 236), 3)

def moody(img, size):
    """Graustufen, dunkel und kontrastreich – wie die übrigen Karten und Ladebilder."""
    im = ImageOps.fit(img.convert('L'), size, Image.LANCZOS, centering=(0.5, 0.42))
    im = ImageEnhance.Contrast(im).enhance(1.35)
    im = ImageEnhance.Brightness(im).enhance(0.5)
    vig = Image.radial_gradient('L').resize(size)                # Mitte dunkel -> außen hell
    return Image.composite(Image.new('L', size, 0), im, vig.point(lambda v: int(max(0, v - 90) * 0.9))).convert('RGB')

def card(lid, nr, name, land, src):
    im = moody(Image.open(src), (W, H))
    # links läuft das Bild ins Dunkle aus – dort steht die Schrift
    grad = Image.linear_gradient('L').rotate(90).resize((W, H)).point(lambda v: int(255 * min(1, max(0, (v / 255 - 0.42) / 0.3))))
    im = Image.composite(im, Image.new('RGB', (W, H), BG), ImageOps.mirror(grad).point(lambda v: 255 - v) if False else grad.transpose(Image.FLIP_LEFT_RIGHT).point(lambda v: 255 - v))
    d = ImageDraw.Draw(im)
    number(d, nr)
    d.rectangle([30, 77, 61, 78], fill=(250, 250, 250))
    d.text((29, 91), name.upper(), font=font('Bold', 27), fill=(250, 250, 250))
    spaced(d, (30, 134), land.upper(), font('Medium', 17), (172, 172, 172), 0.6)
    # abgerundete Ecken auf hellem Grund, wie bei den anderen Karten
    mask = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W * 4 - 1, H * 4 - 1], radius=40, fill=255)
    out = Image.new('RGB', (W, H), (249, 249, 249))
    out.paste(im, (0, 0), mask.resize((W, H), Image.LANCZOS))
    out.save('public/levels/%s.png' % lid, optimize=True)

def main(a):
    if a[:1] == ['renumber']:
        for pair in a[1:]:
            lid, nr = pair.split('=')
            im = Image.open('public/levels/%s.png' % lid).convert('RGB')
            number(ImageDraw.Draw(im), int(nr))
            im.save('public/levels/%s.png' % lid, optimize=True)
    elif a[:1] == ['card'] and len(a) == 6:
        card(a[1], int(a[2]), a[3], a[4], a[5])
    elif a[:1] == ['loading'] and len(a) == 3:
        moody(Image.open(a[2]), (1672, 941)).filter(ImageFilter.GaussianBlur(0.6)).save('public/loading/%s.png' % a[1], optimize=True)
    else:
        sys.exit(__doc__)

if __name__ == '__main__':
    main(sys.argv[1:])
