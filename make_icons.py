#!/usr/bin/env python3
"""暖色版图标：陶土橙渐变"""
from PIL import Image, ImageDraw
import math

def make_icon(size):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(s):
        t = y / s
        r = int(168 + (221 - 168) * t)
        g = int(70 + (138 - 70) * t)
        b = int(46 + (78 - 46) * t)
        d.line([(0, y), (s, y)], fill=(r, g, b, 255))
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s, s], radius=int(s * 0.22), fill=255)
    img.putalpha(mask)
    d = ImageDraw.Draw(img)
    lw = max(3, int(s * 0.055))
    pts = [(s * (0.22 + 0.6 * i / 40), s * (0.72 - 0.42 * math.sin(i / 40 * math.pi))) for i in range(41)]
    d.line(pts, fill=(255, 252, 245, 255), width=lw, joint='curve')
    r1 = max(4, int(s * 0.05))
    d.ellipse([pts[0][0] - r1, pts[0][1] - r1, pts[0][0] + r1, pts[0][1] + r1], fill=(255, 252, 245, 255))
    px, py = pts[-1]
    pin_h, pw = s * 0.30, s * 0.115
    d.polygon([(px, py + pin_h * 0.62), (px - pw, py - pin_h * 0.18), (px - pw * 0.75, py - pin_h * 0.52),
               (px + pw * 0.75, py - pin_h * 0.52), (px + pw, py - pin_h * 0.18)], fill=(255, 252, 245, 255))
    cr, cy = pw * 0.42, py - pin_h * 0.18
    d.ellipse([px - cr, cy - cr, px + cr, cy + cr], fill=(196, 86, 58, 255))
    return img

if __name__ == '__main__':
    for sz in (192, 512):
        make_icon(sz).save(f'icons/icon-{sz}.png')
        print(f'warm icon-{sz}.png saved')
