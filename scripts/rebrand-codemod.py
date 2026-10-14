#!/usr/bin/env python3
"""One-shot brand migration: old violet/indigo/emerald + near-black palette -> EVIV navy & lime.

Run from the repo root:  python3 scripts/rebrand-codemod.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TARGETS = []
for pattern in ("app/**/*.js", "app/**/*.jsx", "components/**/*.jsx", "components/**/*.js"):
    TARGETS += list(ROOT.glob(pattern))
TARGETS = sorted({p for p in TARGETS if p.is_file() and not p.name.endswith(".test.js")})

# Order matters: longest / most specific first.
RULES = [
    # --- surfaces: near-black -> deep navy -----------------------------------
    ("#040405", "#060e1e"),
    ("#050508", "#0a1226"),
    ("#060609", "#0b132b"),
    ("#08080c", "#0d1730"),
    ("#0b0b10", "#0a1226"),
    ("#0d0d12", "#101c38"),
    ("#0e0c15", "#101d3a"),
    ("#09090b", "#0a192f"),
    ("#18181b", "#112240"),
    ("#27272a", "#1e3a5f"),
    # --- accents: violet / indigo / emerald -> lime --------------------------
    ("#8b5cf6", "#32CD32"),
    ("#a78bfa", "#8bf58b"),
    ("#9b7dff", "#6ee06e"),
    ("#7c3aed", "#26a526"),
    ("#6d28d9", "#1f8c1f"),
    ("#6366f1", "#32CD32"),
    ("#4f46e5", "#2bb92b"),
    ("#5b5bd6", "#2bb92b"),
    ("#4338ca", "#268c26"),
    ("#3b0f7a", "#134d13"),
    ("#10b981", "#32CD32"),
    # rgba() glows
    ("rgba(124,58,237,", "rgba(50,205,50,"),
    ("rgba(139,92,246,", "rgba(50,205,50,"),
]

# Tailwind class families.
CLASS_RULES = [
    (r"\b(violet|indigo)-(\d{2,3})\b", r"lime-\2"),
    (r"\bemerald-(\d{2,3})\b", r"lime-\1"),
    # Dark surfaces / borders -> navy scale.
    (r"\bdark:bg-zinc-950\b", "dark:bg-navy-950"),
    (r"\bdark:bg-zinc-900\b", "dark:bg-navy-900"),
    (r"\bdark:border-zinc-950\b", "dark:border-navy-950"),
    (r"\bdark:border-zinc-900\b", "dark:border-navy-800"),
    (r"\bdark:border-zinc-850\b", "dark:border-navy-800"),
    (r"\bdark:border-zinc-800\b", "dark:border-navy-750"),
    (r"\bdark:divide-zinc-900\b", "dark:divide-navy-800"),
    (r"\bbg-zinc-950\b", "bg-navy-950"),
    (r"\bbg-zinc-900\b", "bg-navy-900"),
    (r"\bbg-zinc-850\b", "bg-navy-800"),
    (r"\bborder-zinc-800\b", "border-navy-750"),
    (r"\bborder-zinc-850\b", "border-navy-800"),
    (r"\bbg-\[\#0d1730\]", "bg-navy-850"),
]

# Custom brand shades we introduce in globals.css.
NEW_SHADES = {150, 250, 350, 450, 550, 650, 750, 850, 950}


def convert(text: str) -> str:
    for old, new in RULES:
        text = text.replace(old, new)
    for pattern, repl in CLASS_RULES:
        text = re.sub(pattern, repl, text)
    return text


def main() -> int:
    changed = []
    for path in TARGETS:
        original = path.read_text(encoding="utf-8")
        updated = convert(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(path.relative_to(ROOT))
    print(f"Rewrote {len(changed)} files")
    for c in changed:
        print("  -", c)
    return 0


if __name__ == "__main__":
    sys.exit(main())
