(function () {
  "use strict";

  var PREVIEW_ROWS = [
    { gaOff: -120, fsOff: 420, msOff: 700 },
    { gaOff: -300, fsOff: 150, msOff: 420 },
    { gaOff: -500, fsOff: 45, msOff: 160 },
    { gaOff: -800, fsOff: -200, msOff: -10 }
  ];

  function offsetDate(base, days) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  }

  function $(id) { return document.getElementById(id); }
  function msg(key, subs) { return chrome.i18n.getMessage(key, subs) || key; }

  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = msg(el.getAttribute("data-i18n"));
  });

  function currentSettings() {
    return OCPLH.sanitizeSettings({
      dangerDays: $("danger").value,
      warnDays: $("warn").value,
      showBadge: $("opt-badge").checked,
      showLegend: $("opt-legend").checked,
      strikeExpired: $("opt-strike").checked,
      showGaBadge: $("opt-ga-badge").checked
    });
  }

  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function renderPreview() {
    var danger = parseInt($("danger").value, 10);
    var warn = parseInt($("warn").value, 10);
    $("danger-out").textContent = danger;
    $("warn-out").textContent = warn;
    $("thresh-error").style.display = warn <= danger ? "block" : "none";

    var showBadge = $("opt-badge").checked;
    var strike = $("opt-strike").checked;
    var showGaBadge = $("opt-ga-badge").checked;
    var today = new Date();
    $("today-out").textContent = today.toLocaleDateString();

    var s = { dangerDays: danger, warnDays: warn };
    var tbody = $("preview-body");
    tbody.textContent = "";

    PREVIEW_ROWS.forEach(function (row, idx) {
      var tr = document.createElement("tr");
      var tdV = document.createElement("td");
      tdV.style.fontWeight = "600";
      tdV.textContent = msg("optSampleVersion", [String(idx + 1)]);
      tr.appendChild(tdV);

      var tdGA = document.createElement("td");
      tdGA.style.color = "#777";
      tdGA.textContent = fmtDate(offsetDate(today, row.gaOff));
      if (showGaBadge && row.gaOff < 0) {
        var gaBadge = document.createElement("span");
        gaBadge.className = "badge badge-ga";
        gaBadge.textContent = msg("badgeReleasedAgo", [String(-row.gaOff)]);
        tdGA.appendChild(gaBadge);
      }
      tr.appendChild(tdGA);

      ["fsOff", "msOff"].forEach(function (key) {
        var date = offsetDate(today, row[key]);
        var diff = OCPLH.daysUntil(date, today);
        var cls = OCPLH.classify(diff, s);
        var td = document.createElement("td");
        td.className = "c-" + cls;
        var span = document.createElement("span");
        span.textContent = fmtDate(date);
        if (strike && cls === "expired") span.className = "strike";
        td.appendChild(span);
        if (showBadge) {
          var b = document.createElement("span");
          b.className = "badge";
          b.textContent = diff < 0 ? msg("badgeEndedAgo", [String(-diff)]) : msg("badgeDaysLeft", [String(diff)]);
          td.appendChild(b);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function loadIntoForm(s) {
    $("danger").value = s.dangerDays;
    $("warn").value = s.warnDays;
    $("opt-badge").checked = s.showBadge;
    $("opt-legend").checked = s.showLegend;
    $("opt-strike").checked = s.strikeExpired;
    $("opt-ga-badge").checked = s.showGaBadge;
    renderPreview();
  }

  ["danger", "warn", "opt-badge", "opt-legend", "opt-strike", "opt-ga-badge"].forEach(function (id) {
    $(id).addEventListener("input", renderPreview);
  });

  $("reset-btn").addEventListener("click", function () {
    loadIntoForm(OCPLH.DEFAULTS);
  });

  $("save-btn").addEventListener("click", function () {
    chrome.storage.sync.set(currentSettings(), function () {
      var state = $("save-state");
      state.textContent = msg("optSaved");
      setTimeout(function () { state.textContent = ""; }, 2000);
    });
  });

  chrome.storage.sync.get(OCPLH.DEFAULTS, function (stored) {
    loadIntoForm(OCPLH.sanitizeSettings(stored));
  });
})();
