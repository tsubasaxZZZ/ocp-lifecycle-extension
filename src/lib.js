(function (global) {
  "use strict";

  var MONTHS = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  var EN_DATE_RE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{4})\b/i;
  var ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  var JA_DATE_RE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

  var DEFAULTS = {
    dangerDays: 90,
    warnDays: 180,
    showBadge: true,
    showLegend: true,
    strikeExpired: true
  };

  var REQUIRED_HEADER_SETS = [
    [/general availability/i, /full support/i, /maintenance support/i],
    [/一般提供/, /フルサポート/, /メンテナンスサポート/]
  ];
  var REQUIRED_HEADERS = REQUIRED_HEADER_SETS[0];
  var EXCLUDED_HEADERS = [/general availability/i, /^version/i, /一般提供/, /^バージョン/];
  var EXCLUDED_LABELS = [/general[\s-]?availability/i, /^version$/i, /一般提供/, /^バージョン$/];

  function parseDateFromText(text) {
    if (!text) return null;
    var m = EN_DATE_RE.exec(text);
    if (m) {
      var month = MONTHS[m[1].toLowerCase()];
      var day = parseInt(m[2], 10);
      var year = parseInt(m[3], 10);
      if (month === undefined || day < 1 || day > 31) return null;
      return new Date(year, month, day);
    }
    m = ISO_DATE_RE.exec(text) || JA_DATE_RE.exec(text);
    if (m) {
      var y = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var d = parseInt(m[3], 10);
      if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
      return new Date(y, mo, d);
    }
    return null;
  }

  function parseDeadlineFromText(text) {
    if (!text) return null;
    var globals = [
      new RegExp(EN_DATE_RE.source, "gi"),
      new RegExp(ISO_DATE_RE.source, "g"),
      new RegExp(JA_DATE_RE.source, "g")
    ];
    var best = null;
    var bestIdx = -1;
    globals.forEach(function (re) {
      var m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > bestIdx) {
          bestIdx = m.index;
          best = m[0];
        }
      }
    });
    return best ? parseDateFromText(best) : null;
  }

  function parseDateTimeAttr(value) {
    if (!value) return null;
    var t = Date.parse(value);
    if (isNaN(t)) return null;
    var d = new Date(t);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function daysUntil(target, today) {
    var now = today || new Date();
    var a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    var b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
  }

  function classify(diffDays, settings) {
    var s = settings || DEFAULTS;
    if (diffDays < 0) return "expired";
    if (diffDays <= s.dangerDays) return "danger";
    if (diffDays <= s.warnDays) return "warn";
    return "ok";
  }

  function isLifecycleHeaderSet(headers) {
    return REQUIRED_HEADER_SETS.some(function (set) {
      return set.every(function (re) {
        return headers.some(function (h) { return re.test(h); });
      });
    });
  }

  function isExcludedColumn(headerText) {
    return EXCLUDED_HEADERS.some(function (re) { return re.test(headerText || ""); });
  }

  function isExcludedLabel(label) {
    return EXCLUDED_LABELS.some(function (re) { return re.test(label || ""); });
  }

  function sanitizeSettings(raw) {
    var s = Object.assign({}, DEFAULTS, raw || {});
    s.dangerDays = clampInt(s.dangerDays, 1, 3650, DEFAULTS.dangerDays);
    s.warnDays = clampInt(s.warnDays, 1, 3650, DEFAULTS.warnDays);
    if (s.warnDays <= s.dangerDays) s.warnDays = s.dangerDays + 1;
    s.showBadge = !!s.showBadge;
    s.showLegend = !!s.showLegend;
    s.strikeExpired = !!s.strikeExpired;
    return s;
  }

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  var api = {
    DEFAULTS: DEFAULTS,
    REQUIRED_HEADERS: REQUIRED_HEADERS,
    parseDateFromText: parseDateFromText,
    parseDeadlineFromText: parseDeadlineFromText,
    parseDateTimeAttr: parseDateTimeAttr,
    daysUntil: daysUntil,
    classify: classify,
    isLifecycleHeaderSet: isLifecycleHeaderSet,
    isExcludedColumn: isExcludedColumn,
    isExcludedLabel: isExcludedLabel,
    sanitizeSettings: sanitizeSettings
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.OCPLH = api;
  }
})(typeof self !== "undefined" ? self : this);
