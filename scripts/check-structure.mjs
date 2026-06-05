// Entry point: declarative targets live in scripts/check/targets.mjs,
// the verification engine in scripts/check/engine.mjs.
import { DOM_TARGETS } from "./check/targets.mjs";
import { runDomChecks } from "./check/engine.mjs";

const errors = [];

try {
  errors.push(...await runDomChecks(DOM_TARGETS));
} catch (e) {
  errors.push(`unexpected error: ${e.stack || e}`);
}

if (errors.length > 0) {
  console.error("\nSTRUCTURE CHECK FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nStructure check passed.");
