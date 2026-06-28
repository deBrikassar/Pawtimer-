import os
import re

css_dir = "/home/aleksandr/Projects/Pawtimer-/src"

bad_shadows_re = re.compile(r'box-shadow\s*:\s*([^;]+);')
hex_re = re.compile(r'#(?:[0-9a-fA-F]{3}){1,2}\b')

for root, _, files in os.walk(css_dir):
    for f in files:
        if f.endswith('.css') or f.endswith('.jsx'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()

            shadow_matches = bad_shadows_re.findall(content)
            for m in shadow_matches:
                if 'var(' not in m and 'none' not in m and 'inset' not in m:
                    print(f"[{f}] shadow: {m.strip()}")

            hex_matches = hex_re.findall(content)
            for h in hex_matches:
                # check if not in allowed tokens
                print(f"[{f}] hex: {h}")

