import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../../src/lib.js");

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

async function checkDomTarget(browser, target) {
  const errors = [];
  const check = makeCheck(errors);
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

    if (typeof target.extraChecks === "function") {
      await target.extraChecks({ data, check, tag, lib });
    }

    if (errors.length === 0) {
      console.log(
        `${tag} ok (${lifecycleTables.length} tables, ${data.labelCells.length} labelled cells, ${deadlineCells} deadline cells, ${highlightable} highlightable)`
      );
    }
  } finally {
    await context.close();
  }
  return errors;
}
