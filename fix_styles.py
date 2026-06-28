import os
import re

css_dir = "/home/aleksandr/Projects/Pawtimer-/src"

# Rules for replacing shadows
# We find box-shadow that doesn't use var(--
shadow_re = re.compile(r'box-shadow\s*:\s*([^;]+);')

# Hex colors replacing
hex_re = re.compile(r'#(?:[0-9a-fA-F]{3}){1,2}\b')

bad_hex_map = {
    '#000': 'var(--color-text)',
    '#000000': 'var(--color-text)',
    '#111': 'var(--color-text)',
    '#111111': 'var(--color-text)',
    '#222': 'var(--color-text)',
    '#333': 'var(--color-text-muted)',
    '#444': 'var(--color-text-muted)',
    '#555': 'var(--color-text-muted)',
    '#666': 'var(--color-text-subtle)',
    '#777': 'var(--color-text-subtle)',
    '#888': 'var(--color-text-subtle)',
    '#999': 'var(--color-border-strong)',
    '#aaa': 'var(--color-border)',
    '#ccc': 'var(--color-border)',
    '#ddd': 'var(--color-border)',
    '#eee': 'var(--color-bg-subtle)',
    '#0f0': 'var(--color-primary-600)',
    '#00ff00': 'var(--color-primary-600)',
    '#ff0': 'var(--color-cozy-500)',
    '#ffff00': 'var(--color-cozy-500)'
}

def fix_shadow(match):
    val = match.group(1).strip()
    if 'var(' in val or 'none' in val:
        return match.group(0)

    # If it's inset, maybe use --neu-shadow-in
    if 'inset' in val:
        return 'box-shadow: var(--neu-shadow-in);'
    return 'box-shadow: var(--neu-shadow-out);'

def fix_hex(match):
    val = match.group(0).lower()
    if val in bad_hex_map:
        return bad_hex_map[val]
    return match.group(0)

# Check padding for 20-24px
padding_re = re.compile(r'padding\s*:\s*([^;]+);')
def fix_padding(match):
    val = match.group(1).strip()
    # Check if padding is 10px, 12px, 16px etc on cards
    # This is a bit too generic, maybe we should only target .card or similar.
    # We will do this carefully.
    return match.group(0)

modified_files = []

for root, _, files in os.walk(css_dir):
    for f in files:
        if f.endswith('.css') or f.endswith('.jsx'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                original = file.read()

            content = original

            # 1. Replace shadows
            if f.endswith('.css'):
                content = shadow_re.sub(fix_shadow, content)

            # 2. Replace hex colors
            content = hex_re.sub(fix_hex, content)

            # 3. Add backdrop-filter: blur(12px) if missing on things that have neu-shadow
            # Maybe too risky with regex, we can just replace specific strings.

            if content != original:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(content)
                modified_files.append(f)

print("Modified files:", modified_files)
