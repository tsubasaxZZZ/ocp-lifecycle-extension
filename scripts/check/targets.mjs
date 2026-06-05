// ---------------------------------------------------------------------------
// Declarative target definitions for the structure check.
//
// Adding a page, locale, or product = adding/editing an entry here.
// If a page ever needs page-specific verification (e.g. Red Hat redesigns
// one page with a different widget), add an `extraChecks({ data, check, tag, lib })`
// function to that target instead of forking the engine.
// ---------------------------------------------------------------------------

export const API_TARGET = {
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
      encodeURIComponent("Red Hat Enterprise Linux,Red Hat OpenShift Container Platform,Red Hat OpenShift Serverless Logic Operator,.NET,Ansible Core"),
    locale: "en",
    expectedLabels: ["General availability", "Full support", "Maintenance support"],
    minTables: 4,
    minLabelCells: 20,
    minDeadlineCells: 10,
    minHighlightable: 5
  }
];
