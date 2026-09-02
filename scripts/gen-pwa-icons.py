"""
One-shot generator for the PWA / Web Push icons under public/, sourced from
the Altus Corp logo at the repo root.

Outputs:
  public/icon-192.png    192x192 — logo on white, maskable-safe (~78% safe zone)
  public/icon-512.png    512x512 — same, higher resolution
  public/icon-badge.png   96x96  — logo on transparent (for Android notifications)
  app/icon.png            32x32  — Next.js favicon

Run:   python scripts/gen-pwa-icons.py
Requires: pip install Pillow
"""

from PIL import Image
import os

HERE = os.path.dirname(__file__)
PROJECT_ROOT = os.path.join(HERE, "..")
SOURCE_LOGO = os.path.join(PROJECT_ROOT, "Altus_Corp_logo.png")
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")
APP_DIR = os.path.join(PROJECT_ROOT, "app")

WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def _fit_logo(canvas_size: int, safe_zone: float, background: tuple[int, int, int, int]) -> Image.Image:
    """Render the logo centered on a canvas, scaled to fit within `safe_zone`
    fraction of the canvas (1.0 = no margin). Preserves aspect ratio."""
    src = Image.open(SOURCE_LOGO).convert("RGBA")
    src_w, src_h = src.size
    max_w = int(canvas_size * safe_zone)
    max_h = int(canvas_size * safe_zone)
    scale = min(max_w / src_w, max_h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    resized = src.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)
    canvas.paste(resized, ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2), resized)
    return canvas


def main() -> None:
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    if not os.path.exists(SOURCE_LOGO):
        raise SystemExit(f"Source logo not found at {SOURCE_LOGO}")

    # 512 + 192 — maskable-safe: inner 78% holds the glyph so OS-level
    # circular/squircle masks don't crop the wordmark.
    _fit_logo(512, safe_zone=0.78, background=WHITE).save(
        os.path.join(PUBLIC_DIR, "icon-512.png"), "PNG", optimize=True
    )
    _fit_logo(192, safe_zone=0.78, background=WHITE).save(
        os.path.join(PUBLIC_DIR, "icon-192.png"), "PNG", optimize=True
    )

    # Badge — transparent background, tighter safe zone (90% — badges are
    # rendered small and need to read as a glyph, not a logo lockup).
    _fit_logo(96, safe_zone=0.90, background=TRANSPARENT).save(
        os.path.join(PUBLIC_DIR, "icon-badge.png"), "PNG", optimize=True
    )

    # Next.js favicon
    _fit_logo(32, safe_zone=0.90, background=WHITE).save(
        os.path.join(APP_DIR, "icon.png"), "PNG", optimize=True
    )

    print("Wrote: public/icon-{192,512,badge}.png and app/icon.png")


if __name__ == "__main__":
    main()
