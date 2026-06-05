// ---------------------------------------------------------------------------
// Declarative target definitions for the structure check.
//
// Adding a page, locale, or product = adding/editing an entry here.
//
// API targets verify only the contract the extension actually depends on:
// the product exists, has a "General availability" phase (used for column
// exclusion), and its dates parse. Phase names beyond GA are intentionally
// NOT checked — the extension is data-driven and renaming a phase must not
// turn the daily check red.
//
// If a page ever needs page-specific verification (e.g. Red Hat redesigns
// one page with a different widget), add an `extraChecks({ data, check, tag, lib })`
// function to that DOM target instead of forking the engine.
// ---------------------------------------------------------------------------

const API_BASE = "https://access.redhat.com/product-life-cycles/api/v1/products?name=";

function apiTarget(productName, minVersions) {
  return {
    name: `api:${productName}`,
    url: API_BASE + encodeURIComponent(productName),
    minVersions
  };
}

// Mirrors the products actually monitored on the all-products DOM target.
export const API_TARGETS = [
  apiTarget("AMQ interconnect", 1),
  apiTarget("Ansible Core", 4),
  apiTarget("Red Hat Ansible Automation Platform", 4),
  apiTarget("Red Hat OpenShift Container Platform", 4)
];

export const DOM_TARGETS = [
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
      encodeURIComponent("AMQ interconnect,Ansible Core,Red Hat Ansible Automation Platform,Red Hat OpenShift Container Platform"),
    locale: "en",
    expectedLabels: ["General availability", "Full support", "Maintenance support"],
    minTables: 4,
    minLabelCells: 20,
    minDeadlineCells: 20,
    minHighlightable: 15
  }
];
