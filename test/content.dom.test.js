"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const CONTENT_JS = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setupPage(url, bodyHtml, stored) {
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
        if (key === "badgeReleasedAgo") return `リリースから${subs[0]}日`;
        return key;
      }
    },
    storage: {
      sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, stored || {})) },
      onChanged: { addListener: () => {} }
    }
  };
  global.OCPLH = require("../src/lib.js");
  // eslint-disable-next-line no-eval
  eval(CONTENT_JS);
  return dom;
}

test("OpenShift page: shadow DOM table is decorated via pfe-datetime end dates", async () => {
  setupPage(
    "https://access.redhat.com/support/policy/updates/openshift",
    `<div id="ph"></div>
     <table><tr><th>Software Classification</th><th>Links</th></tr>
       <tr><td>Operators</td><td>Jan 1, 2020</td></tr></table>`
  );
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  // Mirrors the live plcc-table: single table, human-readable data-labels,
  // start/end pfe-datetime ranges (same contract as the all-products page).
  sr.innerHTML = `
    <table class="product-lifecycle-info__table"><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th><th>Maintenance support</th>
      <th>Extended Update Support Add-On - Term 1</th><th>Extended life phase</th>
    </tr></thead><tbody>
      <tr>
        <td data-label="Version">4.21</td>
        <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2026-02-03T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2026-02-03T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2026-09-09T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Maintenance support"><div class="start-date"><pfe-datetime datetime="2026-09-10T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2099-08-03T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Extended Update Support Add-On - Term 1"><div class="na-text">N/A</div></td>
        <td data-label="Extended life phase"><div class="na-text">N/A</div></td>
      </tr>
      <tr>
        <td data-label="Version">4.14</td>
        <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2023-10-31T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2023-10-31T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2024-05-27T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Maintenance support"><div class="start-date"><pfe-datetime datetime="2024-05-28T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2025-05-01T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Extended Update Support Add-On - Term 1"><div class="start-date"><pfe-datetime datetime="2025-05-02T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2025-10-31T00:00:00.000Z"></pfe-datetime></div></td>
        <td data-label="Extended life phase"><div class="na-text">N/A</div></td>
      </tr>
    </tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const cls = (sel) => [...sr.querySelector(sel).classList].join(" ");
  assert.equal(cls('td[data-label="General availability"]'), "", "GA column must stay undecorated");
  assert.equal(cls('td[data-label="Extended Update Support Add-On - Term 1"]'), "", "N/A cell must stay undecorated");
  assert.match(cls('td[data-label="Maintenance support"]'), /ocp-lh-ok/, "far-future date should be ok");

  const row414 = [...sr.querySelectorAll("tr")].find((tr) =>
    (tr.querySelector('[data-label="Version"]')?.textContent || "").trim() === "4.14"
  );
  const expired = row414.querySelector('[data-label="Full support"]');
  assert.match([...expired.classList].join(" "), /ocp-lh-expired/);
  assert.match([...expired.classList].join(" "), /ocp-lh-strike/);
  assert.match(expired.querySelector(".ocp-lh-badge").textContent, /終了済み\(\d+日前\)/);

  const eus = row414.querySelector('[data-label="Extended Update Support Add-On - Term 1"]');
  assert.match([...eus.classList].join(" "), /ocp-lh-expired/, "4.14 EUS Term 1 should be highlighted");

  assert.ok(sr.querySelector(".ocp-lh-legend"), "legend inserted in shadow root");
  assert.ok(sr.querySelector("style[data-ocp-lh]"), "style injected into shadow root");
  assert.equal(document.querySelector("body > table .ocp-lh-cell"), null, "unrelated table untouched");
});

test("OpenShift Operators page: plain table with day-first dates is decorated", async () => {
  setupPage(
    "https://access.redhat.com/support/policy/updates/openshift_operators",
    `<div id="ph"></div>`
  );
  await sleep(50);

  document.getElementById("ph").innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>Tier</th><th>OpenShift Version</th>
      <th>General availability</th><th>Full support ends</th><th>Maintenance ends</th>
    </tr></thead><tbody><tr>
      <td data-label="Version">4.21</td>
      <td data-label="Tier">Platform Aligned</td>
      <td data-label="OpenShift Version">4.21</td>
      <td data-label="General availability">09 Mar 2026</td>
      <td data-label="Full support ends">4.22GA + 3 Months</td>
      <td data-label="Maintenance ends">23 Aug 2027</td>
    </tr></tbody></table>`;
  await sleep(600);

  const cls = (sel) => [...document.querySelector(sel).classList].join(" ");
  assert.equal(cls('td[data-label="General availability"]'), "", "GA column must stay undecorated");
  assert.equal(cls('td[data-label="Full support ends"]'), "", "relative date must stay undecorated");
  assert.match(cls('td[data-label="Maintenance ends"]'), /ocp-lh-ok/, "day-first date should be ok");
  assert.ok(document.querySelector(".ocp-lh-legend"), "legend inserted");
  assert.ok(document.querySelector("style[data-ocp-lh]"), "style injected");
});

test("OpenShift page: decoration is re-applied after a re-render without duplicates", async () => {
  setupPage("https://access.redhat.com/support/policy/updates/openshift", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th><th>Maintenance support</th>
    </tr></thead><tbody><tr>
      <td data-label="Version">4.17</td>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2024-10-01T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2024-10-01T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2025-05-25T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Maintenance support"><div class="start-date"><pfe-datetime datetime="2025-05-26T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2026-04-01T00:00:00.000Z"></pfe-datetime></div></td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const legendsBefore = sr.querySelectorAll(".ocp-lh-legend").length;
  const cell = sr.querySelector('td[data-label="Maintenance support"]');
  cell.querySelector(".end-date pfe-datetime").setAttribute("datetime", "2099-04-01T00:00:00.000Z");
  // Trigger MutationObserver by replacing the cell contents (Lit-style re-render).
  cell.innerHTML = cell.innerHTML;
  await sleep(600);

  const updated = sr.querySelector('td[data-label="Maintenance support"]');
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

test("All-products page: .NET-style table (no Maintenance support column) is decorated", async () => {
  setupPage("https://access.redhat.com/product-life-cycles", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th><th>End of Life</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">.NET 9.0</th>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2024-11-12T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2024-11-12T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2099-11-10T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="End of Life"><div class="end-date"><pfe-datetime datetime="2099-11-10T00:00:00.000Z"></pfe-datetime></div></td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const cls = (label) => [...sr.querySelector(`td[data-label="${label}"]`).classList].join(" ");
  assert.equal(cls("General availability"), "", "GA excluded");
  assert.match(cls("Full support"), /ocp-lh-ok/, "full support range decorated");
  assert.match(cls("End of Life"), /ocp-lh-ok/, "End of Life column decorated");
  assert.ok(sr.querySelector(".ocp-lh-legend"), "legend inserted");
});

test("All-products page: Ansible Core style table (no Full support column) is decorated", async () => {
  setupPage("https://access.redhat.com/product-life-cycles", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>Control Node Python</th><th>Target Python/Powershell</th>
      <th>General availability</th><th>Maintenance Support 1</th><th>Maintenance support 2</th>
      <th>End of Life</th><th>Extended life cycle support (ELS) add-on</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">ansible-core 2.18</th>
      <td data-label="Control Node Python">Python 3.11 - 3.13</td>
      <td data-label="Target Python/Powershell">Python 3.8 - 3.13 / PowerShell 5.1</td>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2024-11-04T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Maintenance Support 1"><div class="start-date"><pfe-datetime datetime="2024-11-04T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2025-05-19T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Maintenance support 2"><div class="start-date"><pfe-datetime datetime="2025-05-20T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2025-11-03T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="End of Life"><div class="end-date"><pfe-datetime datetime="2099-05-01T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Extended life cycle support (ELS) add-on">N/A</td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const cls = (label) => [...sr.querySelector(`td[data-label="${label}"]`).classList].join(" ");
  assert.equal(cls("Control Node Python"), "", "python range not mistaken for a date");
  assert.equal(cls("Target Python/Powershell"), "", "python/powershell text skipped");
  assert.equal(cls("General availability"), "", "GA excluded from coloring");
  assert.match(cls("Maintenance Support 1"), /ocp-lh-expired/, "expired range decorated");
  assert.match(cls("Maintenance support 2"), /ocp-lh-expired/, "second maintenance range decorated");
  assert.match(cls("End of Life"), /ocp-lh-ok/, "EOL decorated");
  assert.equal(cls("Extended life cycle support (ELS) add-on"), "", "N/A skipped");
  assert.ok(sr.querySelector(".ocp-lh-legend"), "legend inserted");
});

test("GA badge: opt-in setting shows days since release without coloring", async () => {
  setupPage("https://access.redhat.com/product-life-cycles", `<div id="ph"></div>`, { showGaBadge: true });
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>General availability</th><th>Full support</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">9</th>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2022-05-18T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2022-05-18T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2099-05-31T00:00:00.000Z"></pfe-datetime></div></td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  const ga = sr.querySelector('td[data-label="General availability"]');
  const badge = ga.querySelector(".ocp-lh-badge-ga");
  assert.ok(badge, "GA badge present when enabled");
  assert.match(badge.textContent, /リリースから\d+日/);
  assert.equal([...ga.classList].join(" "), "", "GA cell still has no color classes");
});

test("GA badge: absent by default", async () => {
  setupPage("https://access.redhat.com/product-life-cycles", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr><th>Version</th><th>General availability</th><th>Full support</th></tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">9</th>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2022-05-18T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2022-05-18T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date"><pfe-datetime datetime="2099-05-31T00:00:00.000Z"></pfe-datetime></div></td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  assert.equal(
    sr.querySelector('td[data-label="General availability"] .ocp-lh-badge-ga'),
    null,
    "no GA badge by default"
  );
});

test("Customer Portal groups page: plain wiki tables with section header rows are decorated", async () => {
  setupPage(
    "https://access.redhat.com/groups/example",
    `<div id="ph"></div>
     <table><tr><th>Topic</th><th>Notes</th></tr>
       <tr><td>Standup</td><td>Jan 1, 2020</td></tr></table>`
  );
  await sleep(50);

  document.getElementById("ph").innerHTML = `
    <h2>Red Hat Advanced Cluster Management for Kubernetes</h2>
    <table>
      <thead>
        <tr>
          <th>Version</th><th>Tier</th><th>OpenShift Compatibility</th>
          <th>General availability</th><th>Full support</th><th>Maintenance support</th>
          <th>Extended update support</th><th>Extended update support Term 2</th>
          <th>Extended update support Term 3</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><em>Full Support</em></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td>2.17</td><td>Aligned</td><td>4.20, 4.21, 4.22</td>
          <td>June 18, 2026</td><td>January 01, 2099</td><td>December 31, 2099</td>
          <td>June 30, 2099</td><td>June 30, 2099</td><td>N/A</td>
        </tr>
        <tr>
          <td>2.14</td><td>Aligned</td><td>4.17, 4.18, 4.19, 4.20</td>
          <td>August 01, 2025</td><td>January 01, 2020</td><td>February 24, 2099</td>
          <td>N/A</td><td>N/A</td><td>N/A</td>
        </tr>
        <tr>
          <td><em>Maintenance Support</em></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td>2.13</td><td>Aligned</td><td>4.16, 4.17, 4.18, 4.19</td>
          <td>March 20, 2025</td><td>April 17, 2020</td><td>September 18, 2099</td>
          <td>February 12, 2099</td><td>February 13, 2099</td><td>N/A</td>
        </tr>
      </tbody>
    </table>
    <h2>Red Hat OpenShift Container Platform</h2>
    <table>
      <thead>
        <tr>
          <th>Version</th><th>General availability</th><th>Full support</th>
          <th>Maintenance support</th><th>Extended update support</th>
          <th>Extended update support Term 2</th><th>Extended update support Term 3</th>
          <th>Extended life phase</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><em>Full Support</em></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td>4.22</td><td>June 09, 2026</td><td>December 31, 2099</td>
          <td>December 31, 2099</td><td>June 30, 2099</td><td>June 30, 2099</td>
          <td>N/A</td><td>N/A</td>
        </tr>
        <tr>
          <td><em>Maintenance Support</em></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td>4.20</td><td>October 21, 2025</td><td>May 03, 2020</td>
          <td>April 21, 2099</td><td>October 21, 2099</td><td>October 21, 2099</td>
          <td>N/A</td><td>N/A</td>
        </tr>
      </tbody>
    </table>`;
  await sleep(600);

  const acm = document.querySelectorAll("#ph table")[0];
  const ocp = document.querySelectorAll("#ph table")[1];
  const acmRows = [...acm.querySelectorAll("tbody tr")];
  const section = acmRows[0];
  assert.equal(
    [...section.querySelectorAll(".ocp-lh-cell")].length,
    0,
    "Full Support section row must stay undecorated"
  );
  assert.equal(
    [...acmRows[3].querySelectorAll(".ocp-lh-cell")].length,
    0,
    "Maintenance Support section row must stay undecorated"
  );

  const row217 = acmRows[1];
  const cells217 = [...row217.children];
  assert.equal([...cells217[0].classList].join(" "), "", "version cell skipped");
  assert.equal([...cells217[1].classList].join(" "), "", "Tier skipped");
  assert.equal([...cells217[2].classList].join(" "), "", "OpenShift Compatibility skipped");
  assert.equal([...cells217[3].classList].join(" "), "", "GA column skipped");
  assert.match([...cells217[4].classList].join(" "), /ocp-lh-ok/, "2.17 full support far-future");
  assert.equal([...cells217[8].classList].join(" "), "", "N/A skipped");

  const row214 = acmRows[2];
  assert.match([...row214.children[4].classList].join(" "), /ocp-lh-expired/, "2.14 full support expired");
  assert.match([...row214.children[4].classList].join(" "), /ocp-lh-strike/);
  assert.match(row214.children[4].querySelector(".ocp-lh-badge").textContent, /終了済み\(\d+日前\)/);

  const row213 = acmRows[4];
  assert.match([...row213.children[4].classList].join(" "), /ocp-lh-expired/, "2.13 full support expired");
  assert.match([...row213.children[5].classList].join(" "), /ocp-lh-ok/, "2.13 maintenance far-future");

  const ocpRows = [...ocp.querySelectorAll("tbody tr")];
  assert.equal([...ocpRows[0].querySelectorAll(".ocp-lh-cell")].length, 0, "OCP section row skipped");
  assert.match([...ocpRows[1].children[2].classList].join(" "), /ocp-lh-ok/, "4.22 full support decorated");
  assert.match([...ocpRows[3].children[2].classList].join(" "), /ocp-lh-expired/, "4.20 full support expired");

  assert.equal(document.querySelectorAll(".ocp-lh-legend").length, 2, "legend per decorated table");
  assert.ok(acm.previousElementSibling.classList.contains("ocp-lh-legend"));
  assert.ok(ocp.previousElementSibling.classList.contains("ocp-lh-legend"));
  assert.ok(document.querySelector("style[data-ocp-lh]"), "style injected");
  assert.equal(document.querySelector("body > table .ocp-lh-cell"), null, "unrelated table untouched");
});

test("Customer Portal groups page: labelled lifecycle table does not block a sibling plain wiki table", async () => {
  setupPage("https://access.redhat.com/groups/mixed", `<div id="ph"></div>`);
  await sleep(50);

  document.getElementById("ph").innerHTML = `
    <table>
      <thead><tr>
        <th>Version</th><th>General availability</th><th>Full support</th>
      </tr></thead>
      <tbody><tr>
        <td data-label="Version">4.21</td>
        <td data-label="General availability">09 Mar 2026</td>
        <td data-label="Full support">01 Jan 2099</td>
      </tr></tbody>
    </table>
    <table>
      <thead><tr>
        <th>Version</th><th>General availability</th><th>Full support</th>
      </tr></thead>
      <tbody>
        <tr><td><em>Full Support</em></td><td></td><td></td></tr>
        <tr><td>1.0</td><td>August 26, 2024</td><td>January 01, 2099</td></tr>
      </tbody>
    </table>`;
  await sleep(600);

  const tables = document.querySelectorAll("#ph table");
  assert.match(
    [...tables[0].querySelector('td[data-label="Full support"]').classList].join(" "),
    /ocp-lh-ok/,
    "labelled table still decorated"
  );
  const plainRow = tables[1].querySelectorAll("tbody tr")[1];
  assert.match(
    [...plainRow.children[2].classList].join(" "),
    /ocp-lh-ok/,
    "plain wiki table decorated even when a labelled table is present"
  );
  assert.equal(
    [...tables[1].querySelectorAll("tbody tr")[0].querySelectorAll(".ocp-lh-cell")].length,
    0,
    "section header row skipped on the plain table"
  );
});

test("All-products page: table with no parseable deadlines gets no legend", async () => {
  setupPage("https://access.redhat.com/product-life-cycles", `<div id="ph"></div>`);
  await sleep(50);

  const host = document.createElement("plcc-table");
  const sr = host.attachShadow({ mode: "open" });
  sr.innerHTML = `
    <table><thead><tr>
      <th>Version</th><th>Tier</th><th>OpenShift Compatibility</th>
      <th>General availability</th><th>Full support</th><th>Maintenance support</th>
    </tr></thead></table>
    <table><tbody><tr>
      <th data-label="Version">1.37</th>
      <td data-label="Tier">Agnostic</td>
      <td data-label="OpenShift Compatibility">4.20, 4.19, 4.18, 4.17, 4.16</td>
      <td data-label="General availability"><div class="end-date"><pfe-datetime datetime="2025-11-24T00:00:00.000Z"></pfe-datetime></div></td>
      <td data-label="Full support"><div class="start-date"><pfe-datetime datetime="2025-11-24T00:00:00.000Z"></pfe-datetime></div><div class="date-separator">to</div><div class="end-date">Release of Serverless 1.38 + 1 month</div></td>
      <td data-label="Maintenance support"><div class="start-date">Release of Serverless 1.38 + 1 month</div><div class="date-separator">to</div><div class="end-date">Release of Serverless 1.38 + 4 month</div></td>
    </tr></tbody></table>`;
  document.getElementById("ph").appendChild(host);
  await sleep(600);

  assert.equal(sr.querySelectorAll(".ocp-lh-cell").length, 0, "no cells decorated");
  assert.equal(sr.querySelector(".ocp-lh-legend"), null, "no legend when nothing is decorated");
  assert.equal([...sr.querySelector('td[data-label="OpenShift Compatibility"]').classList].join(" "), "", "compatibility versions not mistaken for dates");
});
