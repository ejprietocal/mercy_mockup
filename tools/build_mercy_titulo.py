"""
Mercy Studio — genera assets/fonts/mercy-titulo.woff2

Norwester (gratuita, SIL OFL 1.1) NO trae letras con tilde ni Ñ: el navegador
las tomaba de otra fuente y se veían distintas (retro C9). Este script parte del
archivo oficial de Norwester (paquete npm @fontsource/norwester) y le agrega:

  Á É Í Ó Ú Ü Ñ  á é í ó ú ü ñ  ¿ ¡ ·

La OFL permite modificar la fuente, pero la versión modificada no puede llamarse
"Norwester" (nombre reservado): por eso se publica como "Mercy Titulo".

Uso:
  python3 -m venv .venv && .venv/bin/pip install fonttools brotli
  .venv/bin/python tools/build_mercy_titulo.py ruta/norwester-latin-400-normal.woff2
"""
import math
import sys
from pathlib import Path

from fontTools.otlLib.builder import buildPairPosGlyphsSubtable, buildValue
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts" / "mercy-titulo.woff2"

CAP_H = 1638      # altura de mayúsculas (UPM 2048)
SC_H = 1434       # las minúsculas de Norwester son versalitas
GAP = 90          # aire entre la letra y el acento


def bounds(gs, name):
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    return bp.bounds


def draw_acute(pen, cx, y0):
    """Acento agudo: paralelogramo inclinado, grosor ~2/3 del asta."""
    y1 = y0 + 210
    pen.moveTo((cx - 195, y0))
    pen.lineTo((cx - 35, y1))
    pen.lineTo((cx + 195, y1))
    pen.lineTo((cx + 35, y0))
    pen.closePath()


def draw_tilde(pen, cx, y0, width=620, amp=45, thick=140, steps=28):
    """Virgulilla: onda senoidal con extremos rectos."""
    yc = y0 + amp + thick / 2
    left = cx - width / 2
    pts = [(left + width * i / steps, yc + amp * math.sin(2 * math.pi * i / steps)) for i in range(steps + 1)]
    pen.moveTo((round(pts[0][0]), round(pts[0][1] - thick / 2)))
    for x, y in pts:
        pen.lineTo((round(x), round(y + thick / 2)))
    for x, y in reversed(pts):
        pen.lineTo((round(x), round(y - thick / 2)))
    pen.closePath()


def draw_square(pen, cx, y0, s=200):
    pen.moveTo((cx - s / 2, y0))
    pen.lineTo((cx - s / 2, y0 + s))
    pen.lineTo((cx + s / 2, y0 + s))
    pen.lineTo((cx + s / 2, y0))
    pen.closePath()


def draw_dieresis(pen, cx, y0):
    draw_square(pen, cx - 160, y0)
    draw_square(pen, cx + 160, y0)


def main(src):
    font = TTFont(src)
    gs = font.getGlyphSet()
    glyf, hmtx, cmap = font["glyf"], font["hmtx"], font.getBestCmap()
    order = font.getGlyphOrder()
    new = {}   # nombre -> (glifo, avance, base para el kerning, unicode)

    def add(name, uni, base, marks=None, transform=None, adv=None):
        pen = TTGlyphPen(gs)
        if transform:
            gs[base].draw(TransformPen(pen, transform))
        else:
            gs[base].draw(pen)
        if marks:
            xmin, _, xmax, _ = bounds(gs, base)
            marks(pen, round((xmin + xmax) / 2))
        new[name] = (pen.glyph(), adv or hmtx[base][0], base, uni)

    for base, h in (("A", CAP_H), ("E", CAP_H), ("I", CAP_H), ("O", CAP_H), ("U", CAP_H),
                    ("a", SC_H), ("e", SC_H), ("i", SC_H), ("o", SC_H), ("u", SC_H)):
        y0 = h + GAP
        add(base + "acute", ord(base.translate(str.maketrans("AEIOUaeiou", "ÁÉÍÓÚáéíóú"))), base,
            lambda pen, cx, y0=y0: draw_acute(pen, cx, y0))
    add("Udieresis", ord("Ü"), "U", lambda pen, cx: draw_dieresis(pen, cx, CAP_H + GAP))
    add("udieresis", ord("ü"), "u", lambda pen, cx: draw_dieresis(pen, cx, SC_H + GAP))
    add("Ntilde", ord("Ñ"), "N", lambda pen, cx: draw_tilde(pen, cx, CAP_H + GAP))
    add("ntilde", ord("ñ"), "n", lambda pen, cx: draw_tilde(pen, cx, SC_H + GAP))

    # ¿ ¡ = ? ! girados 180° dentro de la altura de mayúsculas; · = punto a media altura
    qx0, _, qx1, _ = bounds(gs, "question")
    add("questiondown", ord("¿"), "question", transform=(-1, 0, 0, -1, qx0 + qx1, CAP_H))
    ex0, _, ex1, _ = bounds(gs, "exclam")
    add("exclamdown", ord("¡"), "exclam", transform=(-1, 0, 0, -1, ex0 + ex1, CAP_H))
    add("periodcentered", ord("·"), "period", transform=(1, 0, 0, 1, 0, CAP_H // 2 - 135))

    for name, (g, adv, base, uni) in new.items():
        glyf[name] = g
        g.recalcBounds(glyf)
        hmtx[name] = (adv, g.xMin)
        if name not in order:
            order.append(name)
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    font["maxp"].numGlyphs = len(order)
    for table in font["cmap"].tables:
        if table.isUnicode():
            for name, (_, _, _, uni) in new.items():
                if table.format != 4 or uni <= 0xFFFF:
                    table.cmap[uni] = name
    font["GDEF"].table.GlyphClassDef.classDefs.update({n: 1 for n in new})

    # Kerning: cada letra acentuada hereda los pares de su letra base
    variants = {}
    for name, (_, _, base, _) in new.items():
        if base[0].isalpha():
            variants.setdefault(base, []).append(name)
    lookup = font["GPOS"].table.LookupList.Lookup[0]
    pairs = {}
    for st in lookup.SubTable:
        for first, ps in zip(st.Coverage.glyphs, st.PairSet):
            for rec in ps.PairValueRecord:
                v = buildValue({"XAdvance": rec.Value1.XAdvance})
                for a in [first] + variants.get(first, []):
                    for b in [rec.SecondGlyph] + variants.get(rec.SecondGlyph, []):
                        pairs.setdefault((a, b), (v, None))
    lookup.SubTable = [buildPairPosGlyphsSubtable(pairs, font.getReverseGlyphMap())]
    lookup.SubTableCount = 1

    # Nombre nuevo (OFL: la versión modificada no usa el nombre reservado "Norwester")
    name_t = font["name"]
    original_copyright = name_t.getDebugName(0)
    for rec in list(name_t.names):
        name_t.removeNames(nameID=rec.nameID)
    for nid, val in {
        0: original_copyright + " Modificada en 2026 para Mercy Studio: se agregan letras acentuadas (Á É Í Ó Ú Ü Ñ ¿ ¡).",
        1: "Mercy Titulo",
        2: "Regular",
        3: "1.002;MERCY;MercyTitulo-Regular",
        4: "Mercy Titulo Regular",
        5: "Version 1.002; derivada de Norwester 1.002",
        6: "MercyTitulo-Regular",
        9: "Jamie Wilson (diseño original)",
        13: "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
        14: "https://openfontlicense.org",
    }.items():
        name_t.setName(val, nid, 3, 1, 0x409)
        name_t.setName(val, nid, 1, 0, 0)
    font["post"].formatType = 2.0   # conserva los nombres de los glifos nuevos

    font.flavor = "woff2"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUT)
    print("OK", OUT, OUT.stat().st_size, "bytes ·", len(new), "glifos nuevos")


if __name__ == "__main__":
    main(sys.argv[1])
