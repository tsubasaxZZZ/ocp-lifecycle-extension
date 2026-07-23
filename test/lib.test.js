"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../src/lib.js");

test("parseDateFromText: full English month", () => {
  const d = lib.parseDateFromText("March 17, 2026");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 17);
});

test("parseDateFromText: abbreviated month", () => {
  const d = lib.parseDateFromText("Feb 3, 2026");
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 3);
});

test("parseDateFromText: day-first English month (OpenShift Operators page)", () => {
  const d = lib.parseDateFromText("09 Mar 2026");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 9);
  assert.ok(lib.parseDateFromText("23 Aug 2027"));
});

test("parseDateFromText: abbreviated month with period and Sept", () => {
  assert.ok(lib.parseDateFromText("Sep. 17, 2025"));
  assert.ok(lib.parseDateFromText("Sept 17, 2025"));
});

test("parseDateFromText: ISO format", () => {
  const d = lib.parseDateFromText("2027-08-03");
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 3);
});

test("parseDateFromText: date embedded with footnote marker", () => {
  const d = lib.parseDateFromText("October 21, 2025 [1]");
  assert.equal(d.getDate(), 21);
});

test("parseDateFromText: Japanese format", () => {
  const d = lib.parseDateFromText("2026年2月3日");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 3);
  const d2 = lib.parseDateFromText("2025年10月21日");
  assert.equal(d2.getMonth(), 9);
  assert.equal(d2.getDate(), 21);
});

test("parseDateFromText: Japanese non-dates return null", () => {
  assert.equal(lib.parseDateFromText("該当なし"), null);
  assert.equal(lib.parseDateFromText("GA of 4.22 + 3 Months"), null);
});

test("parseDateFromText: non-dates return null", () => {
  assert.equal(lib.parseDateFromText("N/A"), null);
  assert.equal(lib.parseDateFromText("GA of 4.22 + 3 Months"), null);
  assert.equal(lib.parseDateFromText(""), null);
  assert.equal(lib.parseDateFromText(null), null);
  assert.equal(lib.parseDateFromText("4.20"), null);
});

test("parseDeadlineFromText: takes the last date in a range", () => {
  const d = lib.parseDeadlineFromText("May 20, 2025 to May 31, 2030");
  assert.equal(d.getFullYear(), 2030);
  assert.equal(d.getMonth(), 4);
  assert.equal(d.getDate(), 31);
});

test("parseDeadlineFromText: single date and mixed strings", () => {
  assert.equal(lib.parseDeadlineFromText("March 17, 2026").getFullYear(), 2026);
  assert.equal(lib.parseDeadlineFromText("09 Mar 2026").getDate(), 9);
  const mixed = lib.parseDeadlineFromText("GA of 4.22 + 3 Months to Dec 17, 2026");
  assert.equal(mixed.getFullYear(), 2026);
  assert.equal(mixed.getMonth(), 11);
  assert.equal(lib.parseDeadlineFromText("to Ongoing"), null);
  const ja = lib.parseDeadlineFromText("2025年5月20日 から 2030年5月31日");
  assert.equal(ja.getFullYear(), 2030);
});

test("parseDateTimeAttr: ISO timestamps map to local date of UTC day", () => {
  const d = lib.parseDateTimeAttr("2030-05-31T00:00:00.000Z");
  assert.equal(d.getFullYear(), 2030);
  assert.equal(d.getMonth(), 4);
  assert.equal(d.getDate(), 31);
  assert.equal(lib.parseDateTimeAttr("Ongoing"), null);
  assert.equal(lib.parseDateTimeAttr(""), null);
  assert.equal(lib.parseDateTimeAttr(null), null);
});

test("daysUntil: basic deltas ignore time of day", () => {
  const today = new Date(2026, 5, 5, 23, 59);
  assert.equal(lib.daysUntil(new Date(2026, 5, 5), today), 0);
  assert.equal(lib.daysUntil(new Date(2026, 5, 6), today), 1);
  assert.equal(lib.daysUntil(new Date(2026, 5, 4), today), -1);
  assert.equal(lib.daysUntil(new Date(2027, 5, 5), today), 365);
});

test("classify: boundaries", () => {
  const s = { dangerDays: 90, warnDays: 180 };
  assert.equal(lib.classify(-1, s), "expired");
  assert.equal(lib.classify(0, s), "danger");
  assert.equal(lib.classify(90, s), "danger");
  assert.equal(lib.classify(91, s), "warn");
  assert.equal(lib.classify(180, s), "warn");
  assert.equal(lib.classify(181, s), "ok");
});

test("isLifecycleHeaderSet: matches the real page headers", () => {
  const headers = [
    "Version",
    "General availability",
    "Full support",
    "Maintenance support",
    "Extended Update Support Add-On - Term 1",
    "Extended Update Support Add-On - Term 2",
    "Extended Update Support Add-On - Term 3",
    "Extended life phase"
  ];
  assert.ok(lib.isLifecycleHeaderSet(headers));
});

test("isLifecycleHeaderSet: matches the Japanese page headers", () => {
  const headers = [
    "バージョン",
    "一般提供の開始 (GA) 日",
    "フルサポート",
    "メンテナンスサポート",
    "Extended Update Support Add-On - Term 1",
    "Extended Update Support Add-On - Term 2",
    "Extended Update Support Add-On - Term 3",
    "延長ライフフェーズ"
  ];
  assert.ok(lib.isLifecycleHeaderSet(headers));
});

test("isLifecycleHeaderSet: matches tables without Maintenance support (.NET style)", () => {
  assert.ok(lib.isLifecycleHeaderSet(
    ["Version", "General availability", "Full support", "End of Life"]
  ));
  assert.ok(lib.isLifecycleHeaderSet(
    ["Version", "Tier", "OpenShift Compatibility", "General availability", "Full support", "Maintenance support"]
  ));
});

test("isLifecycleHeaderSet: matches tables without Full support (Ansible Core style)", () => {
  assert.ok(lib.isLifecycleHeaderSet([
    "Version", "Control Node Python", "Target Python/Powershell",
    "General availability", "Maintenance Support 1", "Maintenance support 2",
    "End of Life", "Extended life cycle support (ELS) add-on"
  ]));
});

test("isGaLabel: matches GA headers and labels in both languages", () => {
  assert.ok(lib.isGaLabel("General availability"));
  assert.ok(lib.isGaLabel("general-availability"));
  assert.ok(lib.isGaLabel("一般提供の開始 (GA) 日"));
  assert.equal(lib.isGaLabel("Full support"), false);
  assert.equal(lib.isGaLabel("End of Life"), false);
});

test("isLifecycleHeaderSet: rejects unrelated tables", () => {
  assert.equal(lib.isLifecycleHeaderSet(["Software Classification", "Provided Tools"]), false);
  assert.equal(lib.isLifecycleHeaderSet([]), false);
});

test("isExcludedLabel: GA and version labels excluded", () => {
  assert.ok(lib.isExcludedLabel("general-availability"));
  assert.ok(lib.isExcludedLabel("General availability"));
  assert.ok(lib.isExcludedLabel("Version"));
  assert.equal(lib.isExcludedLabel("full-support"), false);
  assert.equal(lib.isExcludedLabel("Full support"), false);
  assert.equal(lib.isExcludedLabel("maintenance-support"), false);
  assert.equal(lib.isExcludedLabel("Maintenance support"), false);
  assert.equal(lib.isExcludedLabel("Extended Update Support Add-On - Term 1"), false);
  assert.equal(lib.isExcludedLabel("Extended life phase"), false);
});

test("isExcludedColumn: GA and version columns excluded", () => {
  assert.ok(lib.isExcludedColumn("General availability"));
  assert.ok(lib.isExcludedColumn("Version"));
  assert.equal(lib.isExcludedColumn("Full support"), false);
  assert.equal(lib.isExcludedColumn("Maintenance support"), false);
});

test("isExcludedLabel/Column: Japanese GA and version excluded", () => {
  assert.ok(lib.isExcludedLabel("一般提供の開始-(ga)-日"));
  assert.ok(lib.isExcludedLabel("一般提供の開始 (GA) 日"));
  assert.ok(lib.isExcludedLabel("バージョン"));
  assert.equal(lib.isExcludedLabel("フルサポート"), false);
  assert.equal(lib.isExcludedLabel("メンテナンスサポート"), false);
  assert.equal(lib.isExcludedLabel("延長ライフフェーズ"), false);
  assert.ok(lib.isExcludedColumn("一般提供の開始 (GA) 日"));
  assert.ok(lib.isExcludedColumn("バージョン"));
});

test("sanitizeSettings: defaults and clamping", () => {
  const d = lib.sanitizeSettings(undefined);
  assert.deepEqual(d, lib.DEFAULTS);

  const s = lib.sanitizeSettings({ dangerDays: "200", warnDays: 100 });
  assert.equal(s.dangerDays, 200);
  assert.equal(s.warnDays, 201);

  const junk = lib.sanitizeSettings({ dangerDays: "abc", warnDays: -5, showBadge: 0 });
  assert.equal(junk.dangerDays, lib.DEFAULTS.dangerDays);
  assert.equal(junk.warnDays, lib.DEFAULTS.dangerDays + 1);
  assert.equal(junk.showBadge, false);
});
