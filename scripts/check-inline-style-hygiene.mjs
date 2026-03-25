import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const INLINE_STYLE_PATTERNS = [
  /style=\{\{/g,
  /\.style\./g,
  /setAttribute\(\s*["']style["']/g,
  /\.cssText\s*=/g,
];

const TECHNICAL_EXCEPTIONS = [
  // Keep this list tiny and explicit. Runtime-only fallback copy nodes are acceptable.
  "INLINE_STYLE_TECHNICAL_EXCEPTION",
];

const collectSourceFiles = (rootDir) => {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }

  return files;
};

const files = collectSourceFiles("src");
const violations = [];

for (const filePath of files) {
  const source = readFileSync(filePath, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    const hasInlineStyle = INLINE_STYLE_PATTERNS.some((pattern) => pattern.test(line));
    if (!hasInlineStyle) return;
    const isAllowed = TECHNICAL_EXCEPTIONS.some((marker) => line.includes(marker));
    if (!isAllowed) violations.push(`${filePath}:${index + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error("Inline-style hygiene check failed:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log("Inline-style hygiene check passed.");
