import argparse
import base64
import os
from pathlib import Path

from openai import OpenAI


ROOT = Path(__file__).resolve().parents[1]
SECURE_ENV_PATH = ROOT / "_SECURE_KEYS" / "openaiad.env"
ICON_DIR = ROOT / "assets" / "icons" / "site"
SECURE_KEY_GLOB = "sk-proj*.txt"


STYLE_PROMPT = (
    "Create a single centered navigation icon on a transparent background. "
    "The icon should be crisp vector-style line art with dark-cyan glow and a subtle violet accent. "
    "One icon only. No border. No frame. No tile. No square container. No black background. "
    "No crop. Generous padding on all sides so it reads cleanly at 32px. "
    "High contrast, perfectly centered, visually balanced, elegant and premium. "
    "Designed to sit inside a separate glass button. "
    "Avoid text, letters, words, watermarks, multiple objects, mockups, screenshots, or UI chrome."
)


ICON_PROMPTS = {
    "home": "A minimal modern home outline with a roof peak and centered doorway.",
    "globe": "A refined globe with latitude and longitude arcs and a subtle orbital sweep.",
    "news": "A clean document/news sheet with a title line and two smaller content lines.",
    "compass": "A premium compass rose with a sharp directional needle and clean circular geometry.",
    "list": "A structured knowledge list with three aligned horizontal rows and small bullet markers.",
    "map-pin": "A sleek location pin with a hollow center and clean geometric proportions.",
    "info": "A thin information symbol inside a precise circular ring, elegant and minimal.",
}


def load_secure_env() -> None:
    if os.getenv("OPENAI_API_KEY"):
        return

    if SECURE_ENV_PATH.exists():
        secure_env_text = SECURE_ENV_PATH.read_text(encoding="utf-8").strip()
        if secure_env_text and "=" not in secure_env_text and secure_env_text.startswith("sk-"):
            os.environ["OPENAI_API_KEY"] = secure_env_text
            return

        for raw_line in secure_env_text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value

    if os.getenv("OPENAI_API_KEY"):
        return

    secure_key_files = sorted((ROOT / "_SECURE_KEYS").glob(SECURE_KEY_GLOB))
    if not secure_key_files:
        return

    candidate_key = secure_key_files[0].read_text(encoding="utf-8").strip()
    if candidate_key:
        os.environ["OPENAI_API_KEY"] = candidate_key


def build_prompt(icon_name: str) -> str:
    return f"{STYLE_PROMPT} {ICON_PROMPTS[icon_name]}"


def generate_icon(icon_name: str) -> Path:
    load_secure_env()
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not available in the terminal session or secure env file.")

    client = OpenAI()
    prompt = build_prompt(icon_name)

    try:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            size="1024x1024",
            background="transparent",
        )
    except TypeError:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            size="1024x1024",
        )

    output_path = ICON_DIR / f"nav-{icon_name}.png"
    output_path.write_bytes(base64.b64decode(result.data[0].b64_json))
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate one GlobalDeets nav icon.")
    parser.add_argument("icon", choices=sorted(ICON_PROMPTS))
    args = parser.parse_args()

    output_path = generate_icon(args.icon)
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
