import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../src/lib.js");
const apiOnly = process.argv.includes("--api-only");

const PAGE_URL = "https://access.redhat.com/support/policy/updates/openshift";
const API_URL =
  "https://access.redhat.com/product-life-cycles/api/v1/products?name=OpenShift%20Container%20Platform%204";

const EXPECTED_PHASES = [
  "General availability",
  "Full support",
  "Maintenance support",
  "Extended update support",
  "Extended update support Term 2",
  "Extended update support Term 3",
  "Extended life phase"
];

const LOCALES = [
  {
    cookie: "en",
    expectedLabels: ["general-availability", "full-support", "maintenance-support"]
  },
  {
    cookie: "ja",
    expectedLabels: ["一般提供の開始-(ga)-日", "フルサポート", "メンテナンスサポート"]
  }
];

const errors = [];

function check(cond, message) {
  if (!cond) errors.push(message);
  return cond;
}

async function checkApi() {
  console.log(`[api] fetching ${API_URL}`);
  const res = await fetch(API_URL, {
    headers: { accept: "application/json" }
  });
  if (!check(res.ok, `[api] HTTP ${res.status}`)) return;

  const body = await res.json();
  const product = body?.data?.[0];
  if (!check(!!product, "[api] data[0] is missing")) return;

  const versions = product.versions;
  if (!check(Array.isArray(versions) && versions.length >= 4,
    `[api] expected >= 4 versions, got ${versions?.length}`)) return;

  const phaseNames = (product.all_phases || []).map((p) => p.name);
  for (const expected of EXPECTED_PHASES) {
    check(phaseNames.includes(expected),
      `[api] expected phase "${expected}" not found in all_phases: ${JSON.stringify(phaseNames)}`);
  }

  for (const v of versions.slice(0, 6)) {
    check(typeof v.name === "string" && v.name.length > 0,
      `[api] version with empty name`);
    check(Array.isArray(v.phases) && v.phases.length > 0,
      `[api] version ${v.name} has no phases`);
    for (const p of v.phases || []) {
      if (p.date_format === "date") {
        check(!Number.isNaN(Date.parse(p.date)),
          `[api] version ${v.name} phase "${p.name}" has unparseable date: ${p.date}`);
      }
    }
  }
  console.log(`[api] ok (${versions.length} versions)`);
}

function collectPageData() {
  function collectRoots() {
    var roots = [document];
    var stack = [document];
    while (stack.length > 0) {
      var root = stack.pop();
      var els = root.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        if (els[i].shadowRoot) {
          roots.push(els[i].shadowRoot);
          stack.push(els[i].shadowRoot);
        }
      }
    }
    return roots;
  }
  var headerRows = [];
  var labelCells = [];
  collectRoots().forEach(function (root) {
    root.querySelectorAll("table").forEach(function (t) {
      var headRow = t.querySelector("thead tr") || t.querySelector("tr");
      headerRows.push(
        headRow
          ? Array.from(headRow.children).map(function (c) { return (c.textContent || "").trim(); })
          : []
      );
    });
    root.querySelectorAll("td[data-label], td[headers]").forEach(function (td) {
      labelCells.push({
        label: td.getAttribute("data-label") || td.getAttribute("headers") || "",
        text: (td.textContent || "").trim()
      });
    });
  });
  return { headerRows: headerRows, labelCells: labelCells };
}

async function checkDom(browser, locale) {
  const tag = `[dom:${locale.cookie}]`;
  console.log(`${tag} rendering ${PAGE_URL}`);
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
  });
  try {
    await context.addCookies([
      { name: "rh_locale", value: locale.cookie, domain: ".redhat.com", path: "/" }
    ]);
    const page = await context.newPage();
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page
      .waitForFunction(
        `(${collectPageData.toString()})().labelCells.length > 10`,
        null,
        { timeout: 45000 }
      )
      .catch(() => {});

    const data = await page.evaluate(collectPageData);

    const headerOk = data.headerRows.some((headers) => lib.isLifecycleHeaderSet(headers));
    if (!check(headerOk,
      `${tag} no lifecycle header table found. Header rows seen: ${JSON.stringify(data.headerRows.filter((h) => h.length > 0).slice(0, 10))}`)) {
      return;
    }

    const labels = new Set(data.labelCells.map((c) => c.label));
    for (const expected of locale.expectedLabels) {
      check(labels.has(expected),
        `${tag} expected cell label "${expected}" not found. Labels seen: ${JSON.stringify([...labels])}`);
    }

    let parseable = 0;
    let highlightable = 0;
    for (const cell of data.labelCells) {
      if (lib.parseDateFromText(cell.text)) {
        parseable += 1;
        if (!lib.isExcludedLabel(cell.label)) highlightable += 1;
      }
    }
    check(data.labelCells.length >= 10,
      `${tag} too few labelled cells: ${data.labelCells.length}`);
    check(parseable >= 5,
      `${tag} too few parseable date cells: ${parseable}`);
    check(highlightable >= 3,
      `${tag} too few highlightable cells: ${highlightable}`);

    console.log(
      `${tag} ok (${data.labelCells.length} labelled cells, ${parseable} date cells, ${highlightable} highlightable)`
    );
  } finally {
    await context.close();
  }
}

try {
  await checkApi();
  if (apiOnly) {
    console.log("[dom] skipped (--api-only)");
  } else {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      for (const locale of LOCALES) {
        await checkDom(browser, locale);
      }
    } finally {
      await browser.close();
    }
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
