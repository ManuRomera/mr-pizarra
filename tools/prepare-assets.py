#!/usr/bin/env python3
"""Limpia las imágenes del zip del generador y las deja en assets/ como WebP.

Uso: python3 tools/prepare-assets.py <carpeta-origen/assets>

 - fondos: ver el comentario del bloque (el generador los dejó reflejados en espejo).
 - bordes y fotos: se queda con la forma principal (descarta fragmentos sueltos); los bordes pasan a máscara blanca.
 - manchas: reconstruye la transparencia a partir de la distancia al color de fondo.
 - el resto: conversión directa.
"""
import json
import sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

src = Path(sys.argv[1])
dst = Path(__file__).resolve().parent.parent / "assets"


def save(im, folder, name, q=86, **extra):
    out = dst / folder
    out.mkdir(parents=True, exist_ok=True)
    im.save(out / f"{Path(name).stem}.webp", "WEBP", quality=q, method=6)
    manifest[f"{folder}/{Path(name).stem}"] = {"w": im.width, "h": im.height, **extra}


manifest = {}


def crop_alpha(im, thr=40):
    box = im.getchannel("A").point(lambda v: 255 if v > thr else 0).getbbox()
    return im.crop(box) if box else im


def hole(im):
    """Hueco transparente central de un marco, en % (arriba, derecha, abajo, izquierda)."""
    a = np.array(im.getchannel("A"))
    h, w = a.shape
    cy, cx = h // 2, w // 2
    t = b = cy
    l = r = cx
    while t > 0 and a[t, cx] < 40: t -= 1
    while b < h - 1 and a[b, cx] < 40: b += 1
    while l > 0 and a[cy, l] < 40: l -= 1
    while r < w - 1 and a[cy, r] < 40: r += 1
    return [round(t / h * 100, 1), round((w - r) / w * 100, 1), round((h - b) / h * 100, 1), round(l / w * 100, 1)]


def largest_component(alpha, thr=24):
    """Máscara booleana de la mayor zona conectada (calculada en baja resolución y ampliada)."""
    small = np.array(Image.fromarray(alpha).resize((alpha.shape[1] // 4, alpha.shape[0] // 4), Image.BILINEAR)) > thr
    h, w = small.shape
    seen = np.zeros_like(small, bool)
    best = []
    for y in range(h):
        for x in range(w):
            if small[y, x] and not seen[y, x]:
                comp, q = [], deque([(y, x)])
                seen[y, x] = True
                while q:
                    cy, cx = q.popleft()
                    comp.append((cy, cx))
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1), (cy + 1, cx + 1), (cy - 1, cx - 1), (cy + 1, cx - 1), (cy - 1, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                if len(comp) > len(best):
                    best = comp
    keep = np.zeros((h, w), np.uint8)
    for y, x in best:
        keep[y, x] = 255
    keep = Image.fromarray(keep).resize((alpha.shape[1], alpha.shape[0]), Image.NEAREST)
    # engorda 2 bloques para no morder el borde real
    from PIL import ImageFilter
    keep = keep.filter(ImageFilter.MaxFilter(9))
    return np.array(keep) > 0


# El generador hizo los fondos «sin costuras» reflejándolos (simetría especular): solo el cuarto superior izquierdo es textura real.
# Texturas finas: mosaico de 1024 px con bordes mezclados. Rasgos grandes: ese cuarto extendido en una sola pieza.
TILED = {"corcho-claro", "corcho-noir", "lienzo-yute", "moqueta-anos-80", "carton-archivo-policial", "pizarra-escolar-tiza"}


def seamless(im):
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    ys = np.abs(np.linspace(-1, 1, h))[:, None]
    xs = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip((1 - np.maximum(ys, xs)) ** 0.6 * 1.6, 0, 1)[..., None]
    return Image.fromarray((a * m + rolled * (1 - m)).astype(np.uint8))


for f in sorted((src / "fondos").glob("*.jpg")):
    im = Image.open(f).convert("RGB")
    m = 28
    quarter = im.crop((m, m, im.width // 2, im.height // 2)).resize((1024, 1024), Image.LANCZOS)
    tiled = f.stem in TILED
    save(seamless(quarter) if tiled else quarter, "fondos", f.name, 82, tile=tiled)
    print("fondo", f.name, "mosaico" if tiled else "pieza")

for f in sorted((src / "recortes").glob("*.jpg")):
    save(Image.open(f).convert("RGB"), "recortes", f.name, 86)

for f in sorted((src / "bordes").glob("*.png")):
    alpha = np.array(Image.open(f).convert("RGBA").getchannel("A"))
    keep = largest_component(alpha)
    alpha = np.where(keep, alpha, 0).astype(np.uint8)
    white = Image.new("RGBA", alpha.shape[::-1], (255, 255, 255, 0))
    white.putalpha(Image.fromarray(alpha))
    save(white, "bordes", f.name, 90)

for f in sorted((src / "fotos").glob("*.png")):
    im = Image.open(f).convert("RGBA")
    alpha = np.array(im.getchannel("A"))
    keep = largest_component(alpha)
    im.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8)))
    im = crop_alpha(im)
    save(im, "fotos", f.name, 90, hole=hole(im))

for f in sorted((src / "adornos").glob("*.png")):
    save(crop_alpha(Image.open(f).convert("RGBA")), "adornos", f.name, 90)

for f in sorted((src / "sellos").glob("*.png")):
    save(crop_alpha(Image.open(f).convert("RGBA"), 24), "sellos", f.name, 90)

for f in sorted((src / "manchas").glob("*.png")):
    im = Image.open(f).convert("RGBA")
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    border = np.concatenate([rgb[:12].reshape(-1, 3), rgb[-12:].reshape(-1, 3), rgb[:, :12].reshape(-1, 3), rgb[:, -12:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    alpha = np.clip((dist - 6) * 5.0, 0, 255).astype(np.uint8)
    out = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    out.putalpha(Image.fromarray(alpha))
    save(crop_alpha(out, 12), "manchas", f.name, 88)

for f in sorted((src / "ui").glob("*")):
    if f.suffix.lower() in (".png", ".jpg"):
        save(Image.open(f).convert("RGBA" if f.suffix == ".png" else "RGB"), "ui", f.name, 88)
(dst / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False, sort_keys=True))
print("listo", len(manifest))
