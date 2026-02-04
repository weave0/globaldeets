import base64
import os
from pathlib import Path

from openai import OpenAI


def main() -> int:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set in the environment for this terminal session."
        )

    out_dir = Path("assets") / "dalle_candidates"
    out_dir.mkdir(parents=True, exist_ok=True)

    prompts: list[tuple[str, str]] = [
        (
            "coin_gd_master",
            "Design a premium app icon that looks like a refined minted coin. "
            "Centered on a dark matte coin face inside a rounded-square app icon background. "
            "The coin has a subtle rim and inner rim, minimal lighting (no neon glow). "
            "In the center, an engraved monogram that implies the letters G and D without using any font or text: "
            "the shapes are carved grooves derived from one perfect circle (shared radius), "
            "like a single continuous circular form with carefully cut gaps and an inner stroke so it reads as ‘GD’. "
            "The engraving should look like precise mint etching: crisp geometry, balanced spacing, "
            "no cartoon style, no playful shapes. High contrast, legible at 72px. "
            "Minimal, elegant, modern-luxury. No readable text, no typography. "
            "Output: clean icon composition, centered, with generous safe margins for maskable icons. "
            "Avoid: cartoon, playful, cute, emoji, bubbly shapes, thick toy-like outlines, neon glow, sci-fi, "
            "futuristic gradients, any readable letters, any typography, busy textures, clutter.",
        ),
        (
            "coin_gd_minimal",
            "Create a minimal monochrome app icon: dark navy rounded-square background, "
            "centered circular coin outline, and a single engraved monogram groove that reads as ‘GD’ "
            "using only geometric circular arcs and one vertical stroke (no font, no text). "
            "Extremely simple, perfect symmetry, strong silhouette, looks like an embossed/engraved stamp. "
            "No gradients, no glow, no illustration style. "
            "Avoid: cartoon, playful, cute, emoji, neon, sci-fi, readable letters, typography, clutter.",
        ),
    ]

    client = OpenAI()

    for stem, prompt in prompts:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            size="1024x1024",
        )

        b64 = result.data[0].b64_json
        img_bytes = base64.b64decode(b64)

        out_path = out_dir / f"{stem}.png"
        out_path.write_bytes(img_bytes)
        print(out_path.as_posix())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
