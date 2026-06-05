// Entry point: declarative targets live in scripts/check/targets.mjs,
// the verification engine in scripts/check/engine.mjs.
import { API_TARGET, DOM_TARGETS } from "./check/targets.mjs";
import { runApiCheck, runDomChecks } from "./check/engine.mjs";

const apiOnly = process.argv.includes("--api-only");
const errors = [];

try {
  errors.push(...await runApiCheck(API_TARGET));
  if (apiOnly) {
    console.log("[dom] skipped (--api-only)");
  } else {
    errors.push(...await runDomChecks(DOM_TARGETS));
  }
} catch (e) {
  errors.push(`unexpected error: ${e.stack || e}`);
}

if (errors.length > 0) {
  console.error("\nSTRUCTURE CHECK FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nStructure check passed.");
