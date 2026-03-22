import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def _extract_one(pattern: str, text: str, *, label: str) -> tuple[str, str]:
    m = re.search(pattern, text, flags=re.DOTALL | re.IGNORECASE)
    if not m:
        raise SystemExit(f"Could not find {label}.")
    before = text[: m.start()]
    inner = m.group(1)
    after = text[m.end() :]
    return before + after, inner


def _extract_game_script(html_wo_style: str) -> tuple[str, str]:
    """
    Extract the main (large) inline game <script> block.

    The file contains a commented-out <script src="/socket.io/..."> line which
    regex can accidentally match; instead anchor on the known VERSION marker
    inside the real game script.
    """
    marker = "VERSION:"
    idx = html_wo_style.find(marker)
    if idx == -1:
        raise SystemExit("Could not locate VERSION marker inside main script.")

    open_idx = html_wo_style.rfind("<script", 0, idx)
    if open_idx == -1:
        raise SystemExit("Could not find opening <script> for main script.")
    open_end = html_wo_style.find(">", open_idx)
    if open_end == -1:
        raise SystemExit("Could not parse opening <script> tag.")

    close_idx = html_wo_style.find("</script>", idx)
    if close_idx == -1:
        raise SystemExit("Could not find closing </script> for main script.")

    js = html_wo_style[open_end + 1 : close_idx]
    html_without = html_wo_style[:open_idx] + html_wo_style[close_idx + len("</script>") :]
    return html_without, js


def main() -> None:
    inp = ROOT / "wavelength-ui.html"
    html = inp.read_text(encoding="utf-8")

    # Extract the first <style>...</style> block.
    html_wo_style, css = _extract_one(r"<style[^>]*>(.*?)</style>", html, label="<style> block")

    # Extract the main inline game script (avoid commented-out script tags).
    html_wo_style_script, js = _extract_game_script(html_wo_style)

    # Rebuild index.html:
    # - Keep head metadata, title, and external font link(s)
    # - Add <link rel="stylesheet" href="src/styles.css">
    # - Keep body markup as-is
    # - Load extracted JS at end of body
    # - Keep any other scripts that were *not* inline-extracted (e.g., commented socket.io include) in place.
    head_m = re.search(r"^(.*?</head>)", html_wo_style_script, flags=re.DOTALL | re.IGNORECASE)
    body_m = re.search(r"<body[^>]*>(.*)</body>", html_wo_style_script, flags=re.DOTALL | re.IGNORECASE)
    if not head_m or not body_m:
        raise SystemExit("Could not locate <head> or <body> in HTML.")

    head = head_m.group(1)
    body_inner = body_m.group(1)

    # Remove any existing redirecting index.html if present; we'll overwrite via write_text below.
    SRC.mkdir(exist_ok=True)

    (SRC / "styles.css").write_text(css.strip() + "\n", encoding="utf-8")
    (SRC / "legacy.js").write_text(js.strip() + "\n", encoding="utf-8")

    # Inject CSS link before </head> (but after font links etc).
    if re.search(r'href=["\']src/styles\.css["\']', head, flags=re.IGNORECASE):
        new_head = head
    else:
        new_head = re.sub(
            r"</head>",
            '  <link rel="stylesheet" href="src/styles.css" />\n</head>',
            head,
            flags=re.IGNORECASE,
        )

    out = (
        new_head
        + "\n<body>"
        + body_inner
        + '\n  <script src="src/legacy.js"></script>\n</body>\n</html>\n'
    )

    (ROOT / "index.html").write_text(out, encoding="utf-8")

    print("Wrote:")
    print(" - index.html")
    print(" - src/styles.css")
    print(" - src/legacy.js")


if __name__ == "__main__":
    main()

