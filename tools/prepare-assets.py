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


def safe_rect(alpha, thr=128):
    """Mayor rectángulo con ejes alineados contenido en la forma, como márgenes % (arriba, derecha, abajo, izquierda)."""
    small = np.array(Image.fromarray(alpha).resize((128, 160), Image.BILINEAR)) > thr
    h, w = small.shape
    heights = np.zeros(w, int)
    best = (0, 0, 0, 0, 0)
    for y in range(h):
        heights = np.where(small[y], heights + 1, 0)
        stack = []
        for x in range(w + 1):
            cur = heights[x] if x < w else 0
            start = x
            while stack and stack[-1][1] >= cur:
                sx, sh = stack.pop()
                area = sh * (x - sx)
                if area > best[0]:
                    best = (area, sx, y - sh + 1, x - 1, y)
                start = sx
            stack.append((start, cur))
    _, x1, y1, x2, y2 = best
    return [round(y1 / h * 100, 1), round((w - 1 - x2) / w * 100, 1), round((h - 1 - y2) / h * 100, 1), round(x1 / w * 100, 1)]


def edge_profiles(alpha, bins=24, thr=128):
    """Dónde empieza y acaba el papel en cada tramo: arriba/abajo (% desde arriba) e izquierda/derecha (% desde la izquierda)."""
    small = np.array(Image.fromarray(alpha).resize((192, 240), Image.BILINEAR)) > thr
    h, w = small.shape
    out = {"top": [], "bottom": [], "left": [], "right": []}
    for chunk in np.array_split(np.arange(w), bins):
        rows = np.where(small[:, chunk].any(1))[0]
        out["top"].append(round(float(rows[0]) / h * 100, 1) if len(rows) else 0.0)
        out["bottom"].append(round(float(rows[-1] + 1) / h * 100, 1) if len(rows) else 100.0)
    for chunk in np.array_split(np.arange(h), bins):
        cols = np.where(small[chunk, :].any(0))[0]
        out["left"].append(round(float(cols[0]) / w * 100, 1) if len(cols) else 0.0)
        out["right"].append(round(float(cols[-1] + 1) / w * 100, 1) if len(cols) else 100.0)
    return out


def top_edge(alpha, bins=24, thr=128):
    """Altura (% desde arriba) a la que empieza el papel en cada tramo horizontal: el borde superior no es recto."""
    small = np.array(Image.fromarray(alpha).resize((192, 240), Image.BILINEAR)) > thr
    out = []
    for chunk in np.array_split(np.arange(small.shape[1]), bins):
        rows = np.where(small[:, chunk].any(1))[0]
        out.append(round(float(rows[0]) / small.shape[0] * 100, 1) if len(rows) else 0.0)
    return out


def head_only(im):
    """Chincheta de perfil → solo la cabeza (la aguja desaparece: de frente se ve la cabeza)."""
    a = np.array(im.getchannel("A")) > 40
    widths = a.sum(1)
    top = int(np.argmax(widths > 0))
    peak = int(np.argmax(widths))
    cut = peak
    while cut < len(widths) and widths[cut] > widths[peak] * 0.5:
        cut += 1
    return im.crop((0, top, im.width, min(im.height, cut + 4)))


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


# El generador hizo los fondos «sin costuras» reflejándolos (simetría especular), así que el original completo ya es
# un mosaico válido (aunque con ejes de simetría) y solo su cuarto superior izquierdo es textura sin reflejar.
#  - blend:  texturas finas → cuarto real, bordes mezclados (1024 px).
#  - cover:  mapas → cuarto real, extendido en una pieza.
#  - mirror: el resto → imagen completa reflejada (1536 px), se repite sin costuras a menor escala.
BLEND = {"corcho-claro", "corcho-noir", "lienzo-yute", "moqueta-anos-80", "carton-archivo-policial", "pizarra-escolar-tiza"}
COVER = set()  # estirar un cuarto ×3 sale borroso: todo lo que no es textura fina va con la imagen completa (mirror)


def periodic_noise(rng, size, sigma):
    """Ruido que se repite sin costuras (desenfoque gaussiano en el dominio de Fourier)."""
    f = np.fft.fft2(rng.standard_normal((size, size)))
    ky = np.fft.fftfreq(size)[:, None]
    kx = np.fft.fftfreq(size)[None, :]
    out = np.real(np.fft.ifft2(f * np.exp(-2 * (np.pi * sigma) ** 2 * (kx**2 + ky**2))))
    return (out - out.mean()) / (out.std() + 1e-9)


def parchment(seed=7, size=1024):
    """Pergamino propio y continuo: grano, fibras, manchas y vetas suaves. Sustituye al del generador, cuyas manchas se repetían."""
    rng = np.random.default_rng(seed)
    tone = periodic_noise(rng, size, 1.2) * 3.5 + periodic_noise(rng, size, 6) * 5 + periodic_noise(rng, size, 40) * 9 + periodic_noise(rng, size, 110) * 10
    blot = np.clip(periodic_noise(rng, size, 55) - 0.9, 0, None) * 22  # manchas de té: pocas y grandes
    fibers = periodic_noise(rng, size, 0.8) * np.abs(periodic_noise(rng, size, 25)) * 3.0
    base = np.array([214, 190, 148], np.float32)[None, None, :]
    img = base + (tone + fibers - blot)[..., None] * np.array([1.0, 0.95, 0.85])[None, None, :]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


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
    if f.stem in BLEND:
        save(seamless(im.crop((m, m, im.width // 2, im.height // 2)).resize((1024, 1024), Image.LANCZOS)), "fondos", f.name, 82, mode="blend")
    elif f.stem == "pergamino-nautico":
        save(parchment(), "fondos", f.name, 82, mode="blend")
    elif f.stem in COVER:
        save(im.crop((m, m, im.width // 2, im.height // 2)).resize((1024, 1024), Image.LANCZOS), "fondos", f.name, 82, mode="cover")
    else:
        save(im.crop((m, m, im.width - m, im.height - m)).resize((1536, 1536), Image.LANCZOS), "fondos", f.name, 80, mode="mirror")
    print("fondo", f.name)

for f in sorted((src / "recortes").glob("*.jpg")):
    save(Image.open(f).convert("RGB"), "recortes", f.name, 86)

def clean_paper(seed, base, stains):
    """Papel de periódico limpio: grano, fibras, manchas suaves y bordes algo más oscuros, sin ningún texto impreso."""
    from PIL import ImageFilter
    rng = np.random.default_rng(seed)
    w, h = 1024, 1280

    def layer(sigma, amp):
        n = Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
        a = np.asarray(n).astype(np.float32)
        return (a - a.mean()) / (a.std() + 1e-6) * amp

    tone = layer(1.2, 2.2) + layer(6, 3.0) + layer(40, stains) + layer(120, stains * 0.8)
    fibers = np.asarray(Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur((0.4, 7)))).astype(np.float32)
    tone += (fibers - fibers.mean()) / (fibers.std() + 1e-6) * 1.6
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) / 110.0
    tone -= (1 - np.clip(edge, 0, 1)) ** 2 * 14
    for pos in (0.5,):  # un doblez suave
        tone -= np.exp(-(((yy / h) - pos) * 160) ** 2) * 5 - np.exp(-(((yy / h) - pos - 0.004) * 160) ** 2) * 3
    img = np.clip(np.array(base, np.float32)[None, None, :] + tone[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(img)


for n, (base, stains) in enumerate([((238, 233, 218), 3), ((228, 212, 170), 5), ((208, 206, 199), 4), ((198, 172, 132), 6)], start=1):
    save(clean_paper(100 + n, base, stains), "recortes", f"periodico-{n}.jpg", 86)

for f in sorted((src / "bordes").glob("*.png")):
    alpha = np.array(Image.open(f).convert("RGBA").getchannel("A"))
    keep = largest_component(alpha)
    alpha = np.where(keep, alpha, 0).astype(np.uint8)
    white = Image.new("RGBA", alpha.shape[::-1], (255, 255, 255, 0))
    white.putalpha(Image.fromarray(alpha))
    save(white, "bordes", f.name, 90, safe=safe_rect(alpha), edge=edge_profiles(alpha))

for f in sorted((src / "fotos").glob("*.png")):
    im = Image.open(f).convert("RGBA")
    alpha = np.array(im.getchannel("A"))
    keep = largest_component(alpha)
    im.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8)))
    im = crop_alpha(im)
    save(im, "fotos", f.name, 90, hole=hole(im))

for f in sorted((src / "adornos").glob("*.png")):
    pin = crop_alpha(Image.open(f).convert("RGBA"))
    if f.stem.startswith("chincheta"):
        pin = crop_alpha(head_only(pin))
    save(pin, "adornos", f.name, 90)

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
