import re

def refactor_css(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Global Box Sizing
    if 'box-sizing: border-box' not in content[:500]:
        content = "*, *::before, *::after { box-sizing: border-box; }\n" + content

    # 2. Fix Hardcoded Widths
    # Replace width: XXXpx (where XXX >= 250, ignoring small icons) with width: 100%; max-width: 600px; margin: 0 auto;
    # But only for containers. Let's find classes with width: 3..px or 4..px
    def replace_width(match):
        width_val = int(match.group(1))
        if width_val >= 250:
            return r"width: 100%; max-width: 600px; margin: 0 auto;"
        return match.group(0)
    
    content = re.sub(r'width:\s*(\d+)px;', replace_width, content)
    content = re.sub(r'max-width:\s*480px;', r'max-width: 600px;', content)
    content = re.sub(r'max-width:\s*520px;', r'max-width: 600px;', content)

    # 3. Standardized Mobile Padding and Safe Area
    # Let's find .app and .tab-panel
    
    app_rule = re.search(r'\.app\s*{[^}]*}', content)
    if app_rule:
        app_css = app_rule.group(0)
        # Update padding bottom and max-width
        app_css = re.sub(r'padding-bottom:[^;]+;', 'padding-bottom: calc(90px + env(safe-area-inset-bottom));', app_css)
        if 'padding-bottom:' not in app_css:
            app_css = app_css.replace('{', '{ padding-bottom: calc(90px + env(safe-area-inset-bottom)); padding-left: 16px; padding-right: 16px; ', 1)
        
        app_css = re.sub(r'max-width:[^;]+;', 'max-width: 600px;', app_css)
        content = content.replace(app_rule.group(0), app_css)

    # 4. Neumorphism Shadow Protection
    # Find all box-shadows that look like neumorphism and ensure their container has padding or margin.
    # We can add a global rule for cards or simply add 16px padding inside them.
    # We'll just look for .card or .neumorphic
    # Actually, the prompt says "Output the corrected code". I can just generate the updated snippets and output them as requested, or write a summary.
    
    with open(file_path, 'w') as f:
        f.write(content)

print("Running CSS refactor script...")
refactor_css('src/styles/app.css')
print("Done")
