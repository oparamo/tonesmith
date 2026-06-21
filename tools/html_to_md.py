#!/usr/bin/env python3
"""Convert BOSS GX-1 online HTML manuals to Markdown.

Usage:
    # From the repo root — converts both manuals:
    python3 tools/html_to_md.py

    # Single manual:
    python3 tools/html_to_md.py param   # Parameter Guide only
    python3 tools/html_to_md.py ref     # Reference Manual only

    # Inspect one page (for debugging the HTML structure):
    python3 tools/html_to_md.py inspect <url>

Reads TOC from the locally saved HTML files in docs/, fetches the real
per-section pages from static.roland.com, and writes markdown to docs/gx1/.
"""

import sys
import re
import subprocess
import time
from pathlib import Path
from html.parser import HTMLParser


# ── TOC extraction ────────────────────────────────────────────────────────────

class TocParser(HTMLParser):
    """Extract (level, url, text) tuples from Roland SCHEMA ST4 TOC nav."""

    def __init__(self):
        super().__init__()
        self.entries = []
        self._depth = 0
        self._in_link = False
        self._link_url = None
        self._link_text_parts = []
        self._skip_invisible = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        css = attrs.get("class", "")
        if tag == "ul" and "schema-toc-submenu" in css:
            self._depth += 1
        elif tag == "ul" and "schema-toc-menu" in css:
            self._depth = 0
        elif tag == "a" and "schema-toc-link" in css:
            self._in_link = True
            self._link_url = attrs.get("href", "")
            self._link_text_parts = []
        elif tag == "span" and "invisible" in css:
            self._skip_invisible = True

    def handle_endtag(self, tag):
        if tag == "ul":
            if self._depth > 0:
                self._depth -= 1
        elif tag == "a" and self._in_link:
            text = "".join(self._link_text_parts).strip()
            text = re.sub(r"\s+", " ", text)
            if self._link_url and text and text.lower() not in ("top",):
                self.entries.append((self._depth, self._link_url, text))
            self._in_link = False
            self._link_url = None
            self._link_text_parts = []
        elif tag == "span":
            self._skip_invisible = False

    def handle_data(self, data):
        if self._in_link and not self._skip_invisible:
            self._link_text_parts.append(data)

    def handle_entityref(self, name):
        if self._in_link and not self._skip_invisible:
            ENTITIES = {"amp": "&", "lt": "<", "gt": ">", "nbsp": " ",
                        "apos": "'", "quot": '"', "mdash": "—", "ndash": "–"}
            self._link_text_parts.append(ENTITIES.get(name, ""))

    def handle_charref(self, name):
        if self._in_link and not self._skip_invisible:
            try:
                c = chr(int(name[1:], 16) if name.startswith("x") else int(name))
                self._link_text_parts.append(c)
            except (ValueError, OverflowError):
                pass


# ── HTML → Markdown converter ─────────────────────────────────────────────────

class ContentConverter(HTMLParser):
    """Convert Roland manual page HTML to clean Markdown."""

    # Tags whose content we skip entirely
    SKIP_TAGS = frozenset({"script", "style", "nav", "header", "footer",
                            "noscript", "iframe", "button", "form"})
    # Tags that end a paragraph/inline run
    BLOCK_END_TAGS = frozenset({"p", "div", "section", "article", "main",
                                 "h1","h2","h3","h4","h5","h6",
                                 "blockquote", "pre", "figure", "figcaption"})

    def __init__(self):
        super().__init__()
        self._skip_depth = 0   # > 0 while inside a SKIP_TAG subtree
        self._lines = []       # completed output lines
        self._inline = []      # current inline text buffer

        # Table state
        self._in_table = False
        self._table_rows = []         # list of (cells_list, is_header)
        self._current_row = None
        self._current_cell = None
        self._row_is_header = False

        # List state
        self._list_depth = 0
        self._in_li = False
        self._li_buf = []

        # Pre state
        self._in_pre = False

    # ── helpers ──────────────────────────────────────────────────────────────

    def _flush_inline(self):
        text = "".join(self._inline).strip()
        self._inline = []
        if text:
            self._lines.append(text)
            self._lines.append("")

    def _text(self, data):
        """Route text to wherever it currently belongs."""
        if self._in_pre:
            self._lines.append(data)
        elif self._in_table and self._current_cell is not None:
            self._current_cell.append(data)
        elif self._in_li:
            self._li_buf.append(data)
        else:
            self._inline.append(data)

    # ── tag handlers ─────────────────────────────────────────────────────────

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        css = attrs.get("class", "")

        if self._skip_depth > 0:
            if tag in self.SKIP_TAGS:
                self._skip_depth += 1
            return

        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return

        if tag == "table":
            self._flush_inline()
            self._in_table = True
            self._table_rows = []
            self._current_row = None
            self._current_cell = None

        elif tag in ("thead", "tbody", "tfoot"):
            self._row_is_header = (tag == "thead")

        elif tag == "tr":
            self._current_row = []

        elif tag in ("th", "td"):
            self._row_is_header = self._row_is_header or (tag == "th")
            self._current_cell = []

        elif tag in ("ul", "ol"):
            self._list_depth += 1

        elif tag == "li":
            self._flush_inline()
            self._in_li = True
            self._li_buf = []

        elif tag in ("strong", "b"):
            self._text("**")

        elif tag in ("em", "i"):
            self._text("*")

        elif tag == "br":
            self._flush_inline()

        elif tag == "pre":
            self._flush_inline()
            self._in_pre = True
            self._lines.append("```")

        elif tag in ("h1","h2","h3","h4","h5","h6"):
            self._flush_inline()
            level = int(tag[1]) + 2   # h1→####, etc. (## is reserved for TOC sections)
            self._inline.append("#" * min(level, 6) + " ")

        elif tag == "a":
            pass  # ignore links, just collect their text

    def handle_endtag(self, tag):
        if self._skip_depth > 0:
            if tag in self.SKIP_TAGS:
                self._skip_depth -= 1
            return

        if tag == "table":
            self._flush_inline()
            self._flush_table()
            self._in_table = False

        elif tag == "tr":
            if self._current_row is not None:
                if self._current_cell is not None:
                    self._flush_cell()
                self._table_rows.append((list(self._current_row), self._row_is_header))
                self._current_row = None
            self._row_is_header = False

        elif tag in ("th", "td"):
            if self._current_cell is not None:
                self._flush_cell()

        elif tag in ("ul", "ol"):
            if self._list_depth > 0:
                self._list_depth -= 1

        elif tag == "li":
            text = " ".join("".join(self._li_buf).split()).strip()
            if text:
                indent = "  " * max(self._list_depth - 1, 0)
                self._lines.append(f"{indent}- {text}")
            self._in_li = False
            self._li_buf = []

        elif tag in ("strong", "b"):
            self._text("**")

        elif tag in ("em", "i"):
            self._text("*")

        elif tag == "pre":
            self._lines.append("```")
            self._in_pre = False

        elif tag in self.BLOCK_END_TAGS:
            self._flush_inline()

    def handle_data(self, data):
        if self._skip_depth > 0:
            return
        if self._in_pre:
            self._lines.append(data)
            return
        # Normalise whitespace for non-pre text
        data = re.sub(r"[ \t]+", " ", data)
        if data.strip():
            self._text(data)

    def handle_entityref(self, name):
        ENTITIES = {
            "amp": "&", "lt": "<", "gt": ">", "nbsp": " ",
            "apos": "'", "quot": '"', "copy": "©", "reg": "®",
            "mdash": "—", "ndash": "–",
            "ldquo": "“", "rdquo": "”",
            "lsquo": "‘", "rsquo": "’",
        }
        ch = ENTITIES.get(name)
        if ch:
            self.handle_data(ch)

    def handle_charref(self, name):
        try:
            c = chr(int(name[1:], 16) if name.startswith("x") else int(name))
            self.handle_data(c)
        except (ValueError, OverflowError):
            pass

    # ── table flushing ────────────────────────────────────────────────────────

    def _flush_cell(self):
        text = " ".join("".join(self._current_cell).split()).strip()
        # Strip markdown bold markers that ended up in a cell
        self._current_row.append(text)
        self._current_cell = None

    def _flush_table(self):
        if not self._table_rows:
            return
        max_cols = max((len(r) for r, _ in self._table_rows), default=0)
        if max_cols == 0:
            return

        def pad(row):
            row = [c.replace("|", "\\|") for c in row]
            while len(row) < max_cols:
                row.append("")
            return row

        # Determine header row
        has_explicit_header = any(is_hdr for _, is_hdr in self._table_rows)
        rows_data = [(pad(r), is_hdr) for r, is_hdr in self._table_rows]

        if has_explicit_header:
            header_rows = [r for r, h in rows_data if h]
            body_rows   = [r for r, h in rows_data if not h]
            header = header_rows[0] if header_rows else [""] * max_cols
        else:
            header = rows_data[0][0] if rows_data else [""] * max_cols
            body_rows = [r for r, _ in rows_data[1:]]

        self._lines.append("| " + " | ".join(header) + " |")
        self._lines.append("| " + " | ".join(["---"] * max_cols) + " |")
        for row in body_rows:
            self._lines.append("| " + " | ".join(row) + " |")
        self._lines.append("")

    # ── result ────────────────────────────────────────────────────────────────

    def result(self):
        self._flush_inline()
        # Collapse runs of more than 2 blank lines
        out = []
        blanks = 0
        for line in self._lines:
            if line == "":
                blanks += 1
                if blanks <= 1:
                    out.append(line)
            else:
                blanks = 0
                out.append(line)
        return "\n".join(out).strip()


def html_to_markdown(html_text):
    converter = ContentConverter()
    converter.feed(html_text)
    return converter.result()


# ── Network ───────────────────────────────────────────────────────────────────

def fetch_url(url, delay=0.4):
    """Download a URL via curl and return the HTML as a string."""
    result = subprocess.run(
        ["curl", "-s", "-L", "--max-time", "20",
         "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
         "-H", "Accept: text/html,application/xhtml+xml",
         url],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    time.sleep(delay)
    if result.returncode != 0:
        print(f"    curl error {result.returncode}: {result.stderr.strip()}")
    return result.stdout


# ── TOC ───────────────────────────────────────────────────────────────────────

def extract_toc(toc_html_path):
    """Return list of (level, url, text) from a saved Roland TOC HTML file."""
    content = Path(toc_html_path).read_text(encoding="utf-8", errors="replace")
    parser = TocParser()
    parser.feed(content)
    # Deduplicate URLs (Roland sometimes includes the same page in multiple spots)
    seen = set()
    unique = []
    for entry in parser.entries:
        if entry[1] not in seen:
            seen.add(entry[1])
            unique.append(entry)
    return unique


# ── Conversion pipeline ───────────────────────────────────────────────────────

def convert_manual(toc_html_path, output_path, title):
    """Fetch all pages for a manual and write a single Markdown file."""
    print(f"\n{'='*60}")
    print(f"Converting: {title}")
    print(f"TOC source: {toc_html_path}")
    toc = extract_toc(toc_html_path)
    print(f"Pages found in TOC: {len(toc)}")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sections = []
    total = len(toc)
    failed = []

    for i, (level, url, text) in enumerate(toc, 1):
        print(f"  [{i:3}/{total}] {'  ' * level}{text}", end="  ", flush=True)
        html = fetch_url(url)
        if not html.strip():
            print("EMPTY")
            failed.append((url, text))
            continue
        md = html_to_markdown(html)
        if not md.strip():
            print("NO TEXT")
            failed.append((url, text))
            continue
        # Section heading: level 0 → ##, 1 → ###, 2 → ####
        hashes = "#" * (level + 2)
        sections.append(f"{hashes} {text}\n\n{md}")
        print(f"✓ ({len(md)} chars)")

    combined = f"# {title}\n\n" + "\n\n---\n\n".join(sections) + "\n"
    output_path.write_text(combined, encoding="utf-8")

    print(f"\nWrote: {output_path}")
    print(f"  Sections: {len(sections)}/{total}")
    print(f"  Size:     {len(combined):,} chars")
    if failed:
        print(f"  Failed ({len(failed)}):")
        for url, text in failed:
            print(f"    {text} — {url}")

    return len(sections), len(failed)


# ── inspect mode ──────────────────────────────────────────────────────────────

def inspect_page(url):
    """Download a page and print its raw HTML (first 5000 chars) for debugging."""
    print(f"Fetching: {url}")
    html = fetch_url(url, delay=0)
    if not html:
        print("Empty response.")
        return
    print(f"\n--- RAW HTML (first 5000 chars) ---\n")
    print(html[:5000])
    print(f"\n--- CONVERTED MARKDOWN ---\n")
    md = html_to_markdown(html)
    print(md[:3000] if len(md) > 3000 else md)


# ── Main ──────────────────────────────────────────────────────────────────────

DOCS = Path(__file__).parent.parent / "docs"

MANUALS = {
    "param": (
        DOCS / "GX-1 Parameter Guide _ Sound List.html",
        DOCS / "gx1" / "gx1_parameter_guide.md",
        "GX-1 Parameter Guide / Sound List",
    ),
    "ref": (
        DOCS / "GX-1 Reference Manual.html",
        DOCS / "gx1" / "gx1_reference_manual.md",
        "GX-1 Reference Manual",
    ),
}

if __name__ == "__main__":
    args = sys.argv[1:]

    if args and args[0] == "inspect":
        if len(args) < 2:
            print("Usage: python3 tools/html_to_md.py inspect <url>")
            sys.exit(1)
        inspect_page(args[1])
        sys.exit(0)

    targets = list(MANUALS.keys()) if not args else [a for a in args if a in MANUALS]
    if not targets:
        print(__doc__)
        sys.exit(1)

    total_ok = total_fail = 0
    for key in targets:
        toc_path, out_path, title = MANUALS[key]
        if not toc_path.exists():
            print(f"TOC file not found: {toc_path}")
            continue
        ok, fail = convert_manual(toc_path, out_path, title)
        total_ok += ok; total_fail += fail

    print(f"\nDone. {total_ok} sections converted, {total_fail} failed.")
