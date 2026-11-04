"""Locate, crop and export original paper figures for guide assets.

Requires a project-local environment (never the system Python):
  python3 -m venv .cache/pyreview && .cache/pyreview/bin/pip install pymupdf pillow
Usage:
  .cache/pyreview/bin/python scripts/content/figure-tools.py locate SOURCE.pdf
  .cache/pyreview/bin/python scripts/content/figure-tools.py text SOURCE.pdf OUT.txt
  .cache/pyreview/bin/python scripts/content/figure-tools.py render SOURCE.pdf PAGE OUT.png [x0,y0,x1,y1] [zoom]
  .cache/pyreview/bin/python scripts/content/figure-tools.py webp IN.png OUT.webp [max_width]
PAGE counts from 1. Coordinates are PDF points as printed by `locate`.
"""
import sys
import pymupdf


def locate(pdf):
    doc = pymupdf.open(pdf)
    for number, page in enumerate(doc, 1):
        images = [tuple(round(v) for v in info["bbox"]) for info in page.get_image_info()]
        drawings = page.get_drawings()
        area = None
        if drawings:
            rect = drawings[0]["rect"]
            for item in drawings[1:]:
                rect = rect | item["rect"]
            area = tuple(round(v) for v in rect)
        captions = [(tuple(round(v) for v in b[:4]), b[4].strip().replace("\n", " ")[:90])
                    for b in page.get_text("blocks") if b[4].lstrip().startswith(("Figure", "Fig.", "Table", "TABLE"))]
        if images or captions:
            print(f"page {number} size {tuple(round(v) for v in page.rect)[2:]}")
            for box in images:
                print(f"  image {box}")
            if area and len(drawings) > 20:
                print(f"  vector drawings ({len(drawings)}) span {area}")
            for box, caption in captions:
                print(f"  caption {box} {caption}")


def text(pdf, out):
    doc = pymupdf.open(pdf)
    with open(out, "w", encoding="utf-8") as handle:
        for number, page in enumerate(doc, 1):
            handle.write(f"=== PAGE {number} ===\n{page.get_text()}\n")
    print(f"{len(doc)} pages -> {out}")


def render(pdf, page, out, clip=None, zoom="3"):
    doc = pymupdf.open(pdf)
    area = pymupdf.Rect(*map(float, clip.split(","))) if clip else None
    doc[int(page) - 1].get_pixmap(matrix=pymupdf.Matrix(float(zoom), float(zoom)), clip=area).save(out)
    print(out)


def webp(source, out, max_width="1400"):
    from PIL import Image
    image = Image.open(source).convert("RGB")
    limit = int(max_width)
    if image.width > limit:
        image = image.resize((limit, round(image.height * limit / image.width)), Image.LANCZOS)
    image.save(out, "WEBP", quality=88, method=6)
    print(f"{out} {image.size}")


if __name__ == "__main__":
    commands = {"locate": locate, "text": text, "render": render, "webp": webp}
    if len(sys.argv) < 3 or sys.argv[1] not in commands:
        print(__doc__)
        sys.exit(1)
    commands[sys.argv[1]](*sys.argv[2:])
