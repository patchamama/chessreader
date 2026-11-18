"""Board diagrams (images) to FEN, learned from the book itself.

Books like Kasparov's print a FEN next to many diagrams. Those pairs are the
training data: each diagram is cut into 64 squares, every square is reduced to
a small grey patch, and a template per (piece, square colour) is the average
patch. A diagram without FEN is then read square by square (nearest template).

Usage:  python scripts/diagram_fen.py <book.epub> [<book.epub> …] --out fens.json
        (needs Pillow and numpy: pip install pillow numpy)

Writes, for every diagram image of the books, the FEN board it reads and
whether it had a printed FEN (and if so, whether it matches): a measurement of
the method, and the boards to check against the moves that follow.
"""
import io
import json
import re
import sys
import zipfile

import numpy as np
from PIL import Image

PATCH = 20
PIECES = "PNBRQKpnbrqk"


def board_rows(fen_board: str):
    rows = []
    for rank in fen_board.split("/"):
        row = []
        for ch in rank:
            row.extend(["."] * int(ch) if ch.isdigit() else [ch])
        rows.append(row)
    return rows


def to_fen_board(rows):
    out = []
    for row in rows:
        s, empty = "", 0
        for c in row:
            if c == ".":
                empty += 1
            else:
                s += (str(empty) if empty else "") + c
                empty = 0
        out.append(s + (str(empty) if empty else ""))
    return "/".join(out)


def crop_board(img: Image.Image) -> Image.Image:
    """The board area: the bounding box of the non-white pixels (diagrams sit on white)."""
    g = np.asarray(img.convert("L"), dtype=np.float32)
    mask = g < 235
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0, y1 - y0)
    return img.crop((x0, y0, x0 + side, y0 + side))


def patches(img: Image.Image):
    """64 grey patches, rank 8 first, file a first."""
    b = crop_board(img).convert("L").resize((PATCH * 8, PATCH * 8))
    a = np.asarray(b, dtype=np.float32) / 255.0
    return [[a[r * PATCH:(r + 1) * PATCH, f * PATCH:(f + 1) * PATCH] for f in range(8)] for r in range(8)]


def pairs_from_epub(path):
    """(image bytes, printed FEN board or None, image name) for every diagram, in reading order."""
    z = zipfile.ZipFile(path)
    names = sorted(n for n in z.namelist() if n.endswith((".xhtml", ".html", ".htm")))
    out = []
    for n in names:
        html = z.read(n).decode("utf8", "ignore")
        base = n.rsplit("/", 1)[0]
        for m in re.finditer(r'(<div class="fen">([^<]+)</div>\s*)?<p[^>]*>\s*<img[^>]*src="([^"]+)"', html):
            src = m.group(3)
            parts = (base + "/" + src).split("/")
            stack = []
            for p in parts:
                if p == "..":
                    stack.pop()
                elif p and p != ".":
                    stack.append(p)
            img_path = "/".join(stack)
            try:
                data = z.read(img_path)
            except KeyError:
                continue
            fen = m.group(2).strip().split(" ")[0] if m.group(2) else None
            out.append((data, fen, img_path))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "fens.json"
    args = [a for a in args if a != out_path]
    diagrams = []
    for book in args:
        for data, fen, name in pairs_from_epub(book):
            try:
                img = Image.open(io.BytesIO(data))
                if min(img.size) < 120:
                    continue  # icons, not boards
                diagrams.append({"book": book, "name": name, "fen": fen, "patches": patches(img)})
            except Exception:
                continue
    labelled = [d for d in diagrams if d["fen"] and len(d["fen"].split("/")) == 8]
    rng = np.random.default_rng(1)
    idx = rng.permutation(len(labelled))
    split = int(len(labelled) * 0.7)
    train, test = [labelled[i] for i in idx[:split]], [labelled[i] for i in idx[split:]]

    def templates(items):
        sums, counts = {}, {}
        for d in items:
            rows = board_rows(d["fen"])
            for r in range(8):
                for f in range(8):
                    key = (rows[r][f], (r + f) % 2)
                    sums[key] = sums.get(key, 0) + d["patches"][r][f]
                    counts[key] = counts.get(key, 0) + 1
        return {k: sums[k] / counts[k] for k in sums}

    def read(d, tpl):
        rows = []
        for r in range(8):
            row = []
            for f in range(8):
                p = d["patches"][r][f]
                cands = [(np.sum((p - t) ** 2), k[0]) for k, t in tpl.items() if k[1] == (r + f) % 2]
                row.append(min(cands)[1] if cands else ".")
            rows.append(row)
        return to_fen_board(rows)

    tpl = templates(train)
    sq_ok = sq_all = exact = 0
    for d in test:
        guess = read(d, tpl)
        a, b = board_rows(guess), board_rows(d["fen"])
        sq_ok += sum(a[r][f] == b[r][f] for r in range(8) for f in range(8))
        sq_all += 64
        exact += guess == d["fen"]
    print(f"diagrams {len(diagrams)}, with printed FEN {len(labelled)} (train {len(train)}, test {len(test)})")
    if test:
        print(f"test: squares right {100 * sq_ok / sq_all:.1f}%, whole boards right {100 * exact / len(test):.1f}%")
    tpl_all = templates(labelled)
    result = [{"book": d["book"].rsplit("/", 1)[-1], "image": d["name"], "printed": d["fen"], "read": read(d, tpl_all)} for d in diagrams]
    with open(out_path, "w") as f:
        json.dump(result, f)
    print(f"wrote {len(result)} boards to {out_path}")


if __name__ == "__main__":
    main()
