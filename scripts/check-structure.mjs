import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../src/lib.js");
const apiOnly = process.argv.includes("--api-only");

// ---------------------------------------------------------------------------
// Declarative target definitions.
// Adding a page, locale, or product = adding/editing an entry here.
// ---------------------------------------------------------------------------

const API_TARGET = {
  name: "api:ocp",
  url: "https://access.redhat.com/product-life-cycles/api/v1/products?name=OpenShift%20Container%20Platform%204",
  minVersions: 4,
  expectedPhases: [
    "General availability",
    "Full support",
    "Maintenance support",
    "Extended update support",
    "Extended update support Term 2",
    "Extended update support Term 3",
    "Extended life phase"
  ]
};

const DOM_TARGETS = [
  {
    name: "ocp:en",
    url: "https://access.redhat.com/support/policy/updates/openshift",
    locale: "en",
    expectedLabels: ["general-availability", "full-support", "maintenance-support"],
    minTables: 1,
    minLabelCells: 10,
    minDeadlineCells: 5,
    minHighlightable: 3
  },
  {
    name: "ocp:ja",
    url: "https://access.redhat.com/support/policy/updates/openshift",
    locale: "ja",
    expectedLabels: ["一般提供の開始-(ga)-日", "フルサポート", "メンテナンスサポート"],
    minTables: 1,
    minLabelCells: 10,
    minDeadlineCells: 5,
    minHighlightable: 3
  },
  {
    name: "all-products",
    url: "https://access.redhat.com/product-life-cycles?product=" +
      encodeURIComponent("Red Hat Enterprise Linux,Red Hat OpenShift Container Platform,Red Hat OpenShift Serverless Logic Operator,.NET,Ansible Core"),
    locale: "en",
    expectedLabels: ["General availability", "Full support", "Maintenance support"],
    minTables: 4,
    minLabelCells: 20,
    minDeadlineCells: 10,
    minHighlightable: 5
  }
];

// ---------------------------------------------------------------------------
// Verification engine.
// ---------------------------------------------------------------------------

const errors = [];

function check(cond, message) {
  if (!cond) errors.push(message);
  return cond;
}

async function checkApi(target) {
  const tag = `[${target.name}]`;
  console.log(`${tag} fetching ${target.url}`);
  const res = await fetch(target.url, { headers: { accept: "application/json" } });
  if (!check(res.ok, `${tag} HTTP ${res.status}`)) return;

  const body = await res.json();
  const product = body?.data?.[0];
  if (!check(!!product, `${tag} data[0] is missing`)) return;

  const versions = product.versions;
  if (!check(Array.isArray(versions) && versions.length >= target.minVersions,
    `${tag} expected >= ${target.minVersions} versions, got ${versions?.length}`)) return;

  const phaseNames = (product.all_phases || []).map((p) => p.name);
  for (const expected of target.expectedPhases) {
    check(phaseNames.includes(expected),
      `${tag} expected phase "${expected}" not found in all_phases: ${JSON.stringify(phaseNames)}`);
  }

  for (const v of versions.slice(0, 6)) {
    check(typeof v.name === "string" && v.name.length > 0, `${tag} version with empty name`);
    check(Array.isArray(v.phases) && v.phases.length > 0, `${tag} version ${v.name} has no phases`);
    for (const p of v.phases || []) {
      if (p.date_format === "date") {
        check(!Number.isNaN(Date.parse(p.date)),
          `${tag} version ${v.name} phase "${p.name}" has unparseable date: ${p.date}`);
      }
    }
  }
  console.log(`${tag} ok (${versions.length} versions)`);
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
      var endDt = td.querySelector(".end-date pfe-datetime[datetime]");
      var all = td.querySelectorAll("pfe-datetime[datetime]");
      labelCells.push({
        label: td.getAttribute("data-label") || td.getAttribute("headers") || "",
        text: (td.textContent || "").trim(),
        endAttr: endDt
          ? endDt.getAttribute("datetime")
          : (all.length > 0 ? all[all.length - 1].getAttribute("datetime") : null)
      });
    });
  });
  return { headerRows: headerRows, labelCells: labelCells };
}

// Mirrors the extension's cellDeadline(): datetime attribute first, text fallback.
function cellDeadline(cell) {
  if (cell.endAttr) return lib.parseDateTimeAttr(cell.endAttr);
  return lib.parseDeadlineFromText(cell.text);
}

async function checkDomTarget(browser, target) {
  const tag = `[${target.name}]`;
  console.log(`${tag} rendering ${target.url}`);
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
  });
  try {
    await context.addCookies([
      { name: "rh_locale", value: target.locale, domain: ".redhat.com", path: "/" }
    ]);
    const page = await context.newPage();
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page
      .waitForFunction(
        `(${collectPageData.toString()})().labelCells.length >= ${target.minLabelCells}`,
        null,
        { timeout: 45000 }
      )
      .catch(() => {});

    const data = await page.evaluate(collectPageData);

    const lifecycleTables = data.headerRows.filter((h) => lib.isLifecycleHeaderSet(h));
    check(lifecycleTables.length >= target.minTables,
      `${tag} expected >= ${target.minTables} lifecycle tables, found ${lifecycleTables.length}. Header rows: ${JSON.stringify(data.headerRows.filter((h) => h.length > 0).slice(0, 10))}`);

    const labels = new Set(data.labelCells.map((c) => c.label));
    for (const expected of target.expectedLabels) {
      check(labels.has(expected),
        `${tag} expected cell label "${expected}" not found. Labels seen: ${JSON.stringify([...labels].slice(0, 20))}`);
    }

    let deadlineCells = 0;
    let highlightable = 0;
    for (const cell of data.labelCells) {
      if (cellDeadline(cell)) {
        deadlineCells += 1;
        if (!lib.isExcludedLabel(cell.label)) highlightable += 1;
      }
    }
    check(data.labelCells.length >= target.minLabelCells,
      `${tag} too few labelled cells: ${data.labelCells.length}`);
    check(deadlineCells >= target.minDeadlineCells,
      `${tag} too few cells with extractable deadlines: ${deadlineCells}`);
    check(highlightable >= target.minHighlightable,
      `${tag} too few highlightable cells: ${highlightable}`);

    console.log(
      `${tag} ok (${lifecycleTables.length} tables, ${data.labelCells.length} labelled cells, ${deadlineCells} deadline cells, ${highlightable} highlightable)`
    );
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

try {
  await checkApi(API_TARGET);
  if (apiOnly) {
    console.log("[dom] skipped (--api-only)");
  } else {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      for (const target of DOM_TARGETS) {
        await checkDomTarget(browser, target);
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
