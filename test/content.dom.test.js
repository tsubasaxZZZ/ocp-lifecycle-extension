"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const CONTENT_JS = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setupPage(url, bodyHtml) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, { url });
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  global.self = dom.window;
  global.chrome = {
    i18n: {
      getMessage: (key, subs) => {
        if (key === "badgeDaysLeft") return `あと${subs[0]}日`;
        if (key === "badgeEndedAgo") return `終了済み(${subs[0]}日前)`;
        return key;
      }
    },
    storage: {
      sync: { get: (defaults, cb) => cb(Object.assign({}, defaults)) },
      onChanged: { addListener: () => {} }
    }
  };
  global.OCPLH = require("../src/lib.js");
  // eslint-disable-next-line no-eval
  eval(CONTENT_JS);
  return dom;
}

test("OpenShift page: shadow DOM table is decorated via text dates", async () => {
  setupPage(
    "https://access.redhat.com/support/policy/updates/openshift",
    `<div id="ph"></div>
     <table><tr><th>Software Classification</th><th>Links</th></tr>
       <tr><td>Operators</td><td>Jan 1, 2020</td></tr></table>`
  );
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table class="hdr"><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th><th>Maintenance support</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">4.21</th>
      <td data-label="general-availability">February 3, 2026</td>
      <td data-label="full-support">GA of 4.22 + 3 Months</td>
      <td data-label="maintenance-support">August 3, 2099</td>
    </tr></tbody></table>
    <table><tbody><tr>
      <th data-label="Version">4.17</th>
      <td data-label="general-availability">October 1, 2024</td>
      <td data-label="full-support">May 25, 2025</td>
      <td data-label="maintenance-support">April 1, 2026</td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const cls = (sel) => [...sr.querySelector(sel).classList].join(" ");
  assert.equal(cls('td[data-label="general-availability"]'), "", "GA column must stay undecorated");
  assert.equal(cls('[data-label="full-support"]'), "", "unparseable cell must stay undecorated");
  assert.match(cls('[data-label="maintenance-support"]'), /ocp-lh-ok/, "far-future date should be ok");

  const expired = [...sr.querySelectorAll('[data-label="full-support"]')][1];
  assert.match([...expired.classList].join(" "), /ocp-lh-expired/);
  assert.match([...expired.classList].join(" "), /ocp-lh-strike/);
  assert.match(expired.querySelector(".ocp-lh-badge").textContent, /終了済み\(\d+日前\)/);

  assert.ok(sr.querySelector(".ocp-lh-legend"), "legend inserted in shadow root");
  assert.ok(sr.querySelector("style[data-ocp-lh]"), "style injected into shadow root");
  assert.equal(document.querySelector("body > table .ocp-lh-cell"), null, "unrelated table untouched");
});

test("OpenShift page: decoration is re-applied after a re-render without duplicates", async () => {
  setupPage("https://access.redhat.com/support/policy/updates/openshift", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th><th>Maintenance support</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">4.17</th>
      <td data-label="general-availability">October 1, 2024</td>
      <td data-label="full-support">May 25, 2025</td>
      <td data-label="maintenance-support">April 1, 2026</td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const legendsBefore = sr.querySelectorAll(".ocp-lh-legend").length;
  const cell = sr.querySelector('td[data-label="maintenance-support"]');
  cell.textContent = "April 1, 2099";
  await sleep(600);

  const updated = sr.querySelector('td[data-label="maintenance-support"]');
  assert.match([...updated.classList].join(" "), /ocp-lh-ok/, "re-rendered cell re-decorated");
  assert.equal(updated.querySelectorAll(".ocp-lh-badge").length, 1, "exactly one badge after re-render");
  assert.equal(sr.querySelectorAll(".ocp-lh-legend").length, legendsBefore, "legend not duplicated");
});

test("All-products page: deadlines come from pfe-datetime end-date attributes", async () => {
  setupPage("https://access.redhat.com/product-life-cycles", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th><th>Maintenance support</th>
      <th>Extended life phase</th><th>Final minor release</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">8</th>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2019-05-07T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2019-05-07T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2024-05-31T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Maintenance support"><div class="start-date"><pfe-datetime datetime="2024-06-01T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2099-05-31T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Extended life phase"><div class="start-date"><pfe-datetime datetime="2032-06-01T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date">Ongoing</div></td>
      <td data-label="Final minor release">8.10</td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const cls = (label) => [...sr.querySelector(`td[data-label="${label}"]`).classList].join(" ");
  assert.equal(cls("General availability"), "", "GA excluded");
  assert.match(cls("Full support"), /ocp-lh-expired/, "range ended in 2024 is expired");
  assert.match(cls("Maintenance support"), /ocp-lh-ok/, "range ending 2099 is ok");
  assert.equal(cls("Extended life phase"), "", "Ongoing range skipped");
  assert.equal(cls("Final minor release"), "", "version cell skipped");
  assert.ok(sr.querySelector(".ocp-lh-legend"), "legend inserted");
});
