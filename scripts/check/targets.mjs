// ---------------------------------------------------------------------------
// Declarative target definitions for the structure check.
//
// Adding a page, locale, or product = adding/editing an entry here.
// The check verifies exactly what the extension consumes: the rendered DOM.
// (The pages are fed by Red Hat's lifecycle API; we deliberately do not
// monitor it separately — any change that matters surfaces in the DOM.)
//
// If a page ever needs page-specific verification (e.g. Red Hat redesigns
// one page with a different widget), add an `extraChecks({ data, check, tag, lib })`
// function to that DOM target instead of forking the engine.
// ---------------------------------------------------------------------------

export const DOM_TARGETS = [
  {
    name: "ocp:en",
    url: "https://access.redhat.com/support/policy/updates/openshift",
    locale: "en",
    expectedLabels: ["General availability", "Full support", "Maintenance support"],
    minTables: 1,
    minLabelCells: 10,
    minDeadlineCells: 5,
    minHighlightable: 3
  },
  {
    name: "ocp:ja",
    url: "https://access.redhat.com/support/policy/updates/openshift",
    locale: "ja",
    expectedLabels: ["一般提供の開始 (GA) 日", "フルサポート", "メンテナンスサポート"],
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
  },
  {
    name: "operators:en",
    url: "https://access.redhat.com/support/policy/updates/openshift_operators",
    locale: "en",
    expectedLabels: ["General availability", "Full support ends", "Maintenance ends"],
    minTables: 1,
    minLabelCells: 500,
    minDeadlineCells: 500,
    minHighlightable: 500
  },
  {
    name: "operators:ja",
    url: "https://access.redhat.com/support/policy/updates/openshift_operators",
    locale: "ja",
    expectedLabels: ["General availability", "Full support ends", "Maintenance ends"],
    minTables: 1,
    minLabelCells: 500,
    minDeadlineCells: 500,
    minHighlightable: 500
  }
];
