import os
import re

app_css_path = "/home/aleksandr/Projects/Pawtimer-/src/styles/app.css"

with open(app_css_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace small padding in cards with var(--space-card-padding)
content = content.replace("padding:var(--space-field-padding-default);", "padding:var(--space-card-padding);") # this is used in alone-card, ctx
content = content.replace("padding:var(--space-card-row-gap);", "padding:var(--space-card-padding);") # used in pat-reminder

# stats padding clamps
content = re.sub(r'padding:\s*clamp\(16px,\s*3\.5vw,\s*22px\);', 'padding:var(--space-card-padding);', content)
content = re.sub(r'padding:\s*clamp\(14px,\s*3vw,\s*20px\);', 'padding:var(--space-card-padding);', content)

# gaps
content = re.sub(r'gap:\s*clamp\(14px,\s*3\.2vh,\s*26px\);', 'gap:var(--space-card-row-gap);', content)
content = re.sub(r'gap:\s*clamp\(12px,\s*2\.4vw,\s*18px\);', 'gap:var(--space-card-row-gap);', content)

# also replace 'padding:10px 12px;' with 'var(--space-card-padding)' in standalone cards but wait, 10px 12px might be inputs. Let's not do globally.

with open(app_css_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Padding and gaps audited and fixed.")
