import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../../src/lib.js");

// Transient SPA/CDN blips on access.redhat.com should not open structure-check
// issues. Real page-contract regressions still fail after retries.
const MAX_ATTEMPTS = 3;

export async function runDomChecks(targets) {
  const errors = [];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const target of targets) {
      errors.push(...await checkDomTarget(browser, target));
    }
  } finally {
    await browser.close();
  }
  return errors;
}

function makeCheck(errors) {
  return function check(cond, message) {
    if (!cond) errors.push(message);
    return cond;
  };
}

// Runs inside the page; must be self-contained (no imports).
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

function evaluateTarget(data, target, tag, pageUrl) {
  const errors = [];
  const check = makeCheck(errors);
  const urlNote = pageUrl ? ` (url: ${pageUrl})` : "";

  const lifecycleTables = data.headerRows.filter((h) => lib.isLifecycleHeaderSet(h));
  check(lifecycleTables.length >= target.minTables,
    `${tag} expected >= ${target.minTables} lifecycle tables, found ${lifecycleTables.length}. Header rows: ${JSON.stringify(data.headerRows.filter((h) => h.length > 0).slice(0, 10))}${urlNote}`);

  const labels = new Set(data.labelCells.map((c) => c.label));
  for (const expected of target.expectedLabels) {
    check(labels.has(expected),
      `${tag} expected cell label "${expected}" not found. Labels seen: ${JSON.stringify([...labels].slice(0, 20))}${urlNote}`);
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
    `${tag} too few labelled cells: ${data.labelCells.length}${urlNote}`);
  check(deadlineCells >= target.minDeadlineCells,
    `${tag} too few cells with extractable deadlines: ${deadlineCells}${urlNote}`);
  check(highlightable >= target.minHighlightable,
    `${tag} too few highlightable cells: ${highlightable}${urlNote}`);

  return { errors, lifecycleTables, deadlineCells, highlightable, labelCount: data.labelCells.length };
}

async function attemptDomTarget(browser, target) {
  const tag = `[${target.name}]`;
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

    // Wait for lifecycle-specific labels, not merely any labelled cells.
    // Unrelated portal tables (e.g. support contact hours) also use
    // data-label/headers and used to satisfy a cell-count-only wait.
    // Pass an expression string so Playwright evaluates it without needing
    // new Function (portal CSP can block that).
    const expectedLabelsJson = JSON.stringify(target.expectedLabels);
    await page
      .waitForFunction(
        `(function () {
          var data = (${collectPageData.toString()})();
          if (data.labelCells.length < ${target.minLabelCells}) return false;
          var labels = {};
          data.labelCells.forEach(function (c) { labels[c.label] = true; });
          return ${expectedLabelsJson}.every(function (l) { return labels[l]; });
        })()`,
        null,
        { timeout: 45000 }
      )
      .catch(() => {});

    const data = await page.evaluate(collectPageData);
    const pageUrl = page.url();
    const result = evaluateTarget(data, target, tag, pageUrl);

    if (typeof target.extraChecks === "function") {
      const check = makeCheck(result.errors);
      await target.extraChecks({ data, check, tag, lib, pageUrl });
    }

    return result;
  } finally {
    await context.close();
  }
}

async function checkDomTarget(browser, target) {
  const tag = `[${target.name}]`;
  console.log(`${tag} rendering ${target.url}`);

  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await attemptDomTarget(browser, target);
    if (last.errors.length === 0) {
      console.log(
        `${tag} ok (${last.lifecycleTables.length} tables, ${last.labelCount} labelled cells, ${last.deadlineCells} deadline cells, ${last.highlightable} highlightable)`
      );
      return [];
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(`${tag} attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying…`);
      console.log(last.errors.map((e) => `  - ${e}`).join("\n"));
    }
  }

  console.log(`${tag} failed after ${MAX_ATTEMPTS} attempts`);
  return last.errors;
}
