#!/usr/bin/env python3
"""Fehlende Menü-Icons aus vorhandenen ableiten (gleicher Stil, andere Farbe/Größe/Blickrichtung).
Notbehelf, solange kein eigenes Motiv gezeichnet ist. Aufruf in webgl-3d/:  python3 tools/derive-icons.py
"""
import numpy as np
from PIL import Image, ImageOps

D = 'public/icons/'
def load(n): return Image.open(D + n + '.png').convert('RGBA')
def save(im, n): im.save(D + n + '.png', optimize=True)

def recolor(im, hue, sat=1.0):
    """Rote Flächen (Kabinenlack) auf einen anderen Farbton drehen; alles andere bleibt."""
    a = np.asarray(im).astype(np.float32)
    hsv = np.asarray(Image.fromarray(a[..., :3].astype(np.uint8)).convert('HSV')).astype(np.float32)
    h, s = hsv[..., 0], hsv[..., 1]
    red = ((h < 12) | (h > 240)) & (s > 110)
    hsv[..., 0] = np.where(red, hue, h)
    hsv[..., 1] = np.where(red, np.clip(s * sat, 0, 255), s)
    rgb = np.asarray(Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB'))
    return Image.fromarray(np.dstack([rgb, a[..., 3].astype(np.uint8)]), 'RGBA')

def scaled(im, f, anchor_bottom=True):
    w, h = im.size
    s = im.resize((int(w * f), int(h * f)), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(s, ((w - s.width) // 2, (h - s.height) if anchor_bottom else (h - s.height) // 2))
    return out

def fit(im, pad=4):
    """Motiv auf volle Fläche bringen."""
    box = im.getbbox(); c = im.crop(box)
    w, h = im.size; f = min((w - 2 * pad) / c.width, (h - 2 * pad) / c.height)
    c = c.resize((int(c.width * f), int(c.height * f)), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); out.alpha_composite(c, ((w - c.width) // 2, (h - c.height) // 2))
    return out

save(scaled(recolor(load('lift'), 150), 0.9, False), 'lift4')          # 4er-Gondel: blau, etwas kleiner
save(recolor(load('lift'), 28, 1.05), 'lift8')                          # 8er-Kabine: orange
save(fit(recolor(load('lift'), 196, 0.9)), 'liftmega')                  # 10er XL: violett, formatfüllend
save(fit(recolor(load('tram'), 150)), 'lifttramxl')                     # Jumbo-Pendelbahn: blau
pw = load('piste_w'); save(fit(pw.resize((int(pw.width * 1.22), pw.height), Image.LANCZOS).crop((28, 0, 28 + pw.width, pw.height))), 'piste_xw')
save(scaled(load('hotel_budget'), 0.84), 'hotel_pension')               # Pension: das kleine Haus
save(ImageOps.mirror(load('hotel_mid')), 'hotel')                       # Alpenhotel: gespiegelt
save(fit(ImageOps.mirror(load('hotel_lux'))), 'hotel_resort')
save(fit(ImageOps.mirror(load('reservoir')), 0), 'reservoir_l')         # Stausee: größer
