/**
 * One-shot codemod: add a `citations: DEFAULT_CITATIONS,` line before every
 * closing `}` of a rule object in src/lib/interactionRules.ts that lacks one.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "../src/lib/interactionRules.ts");

let src = readFileSync(FILE, "utf8");

// For every rule object: confidence: "...", followed by a closing brace, and
// no `citations` between them, insert citations before the closing brace.
src = src.replace(
  /(confidence:\s*"[^"]+",)\s*\n(\s*)(\})/g,
  (match, conf, indent, brace) => {
    // Skip if this block already has a citations field (look back ~120 chars)
    const idx = src.indexOf(match);
    if (idx >= 0) {
      const window = src.slice(Math.max(0, idx - 200), idx + match.length);
      if (window.includes("citations:")) return match;
    }
    return `${conf}\n${indent}citations: DEFAULT_CITATIONS,\n${indent}${brace}`;
  }
);

writeFileSync(FILE, src);
console.log("backfilled citations into interactionRules.ts");
