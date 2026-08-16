#!/usr/bin/env python3
"""生成自驾路书 PWA 图标（简洁路线+定位针风格）"""
from PIL import Image, ImageDraw
import math

def make_icon(size):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 渐变背景（深蓝→天蓝）
    for y in range(s):
        t = y / s
        r = int(29 + (14 - 29) * t)
        g = int(78 + (165 - 78) * t)
        b = int(216 + (233 - 216) * t)
        d.line([(0, y), (s, y)], fill=(r, g, b, 255))
    # 圆角遮罩
    mask = Image.new('L', (s, s), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, s, s], radius=int(s * 0.22), fill=255)
    img.putalpha(mask)

    d = ImageDraw.Draw(img)
    # 白色路线（贝塞尔近似：多段折线）
    lw = max(3, int(s * 0.055))
    pts = []
    for i in range(41):
        t = i / 40
        x = s * (0.22 + 0.6 * t)
        y = s * (0.72 - 0.42 * math.sin(t * math.pi))
        pts.append((x, y))
    d.line(pts, fill=(255, 255, 255, 255), width=lw, joint='curve')

    # 起点圆点
    r1 = max(4, int(s * 0.05))
    d.ellipse([pts[0][0]-r1, pts[0][1]-r1, pts[0][0]+r1, pts[0][1]+r1], fill=(255, 255, 255, 255))

    # 终点定位针
    px, py = pts[-1]
    pin_h = s * 0.30
    pw = s * 0.115
    d.polygon([(px, py + pin_h*0.62), (px - pw, py - pin_h*0.18), (px - pw*0.75, py - pin_h*0.52),
               (px + pw*0.75, py - pin_h*0.52), (px + pw, py - pin_h*0.18)], fill=(255, 255, 255, 255))
    # 针内圆（主题色）
    cr = pw * 0.42
    cy = py - pin_h * 0.18
    d.ellipse([px-cr, cy-cr, px+cr, cy+cr], fill=(37, 99, 235, 255))
    return img

for sz in (192, 512):
    icon = make_icon(sz)
    icon.save(f'icons/icon-{sz}.png')
    print(f'icon-{sz}.png ok')
