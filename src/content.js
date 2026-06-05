(function () {
  "use strict";

  var STYLE_CSS = [
    "td.ocp-lh-expired { background-color: #d3d1c7 !important; color: #2c2c2a !important; }",
    "td.ocp-lh-danger { background-color: #f7c1c1 !important; color: #501313 !important; }",
    "td.ocp-lh-warn { background-color: #fac775 !important; color: #412402 !important; }",
    "td.ocp-lh-ok { background-color: #c0dd97 !important; color: #173404 !important; }",
    "td.ocp-lh-strike { text-decoration: line-through; }",
    ".ocp-lh-badge { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 8px; font-size: 11px; font-weight: 600; line-height: 1.5; background-color: rgba(255,255,255,0.65); color: inherit; text-decoration: none; white-space: nowrap; }",
    ".ocp-lh-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin: 10px 0; font-size: 12px; color: #444; }",
    ".ocp-lh-legend-title { font-weight: 600; }",
    ".ocp-lh-legend-item { display: inline-flex; align-items: center; gap: 5px; }",
    ".ocp-lh-swatch { display: inline-block; width: 11px; height: 11px; border-radius: 3px; }",
    ".ocp-lh-swatch-expired { background-color: #d3d1c7; }",
    ".ocp-lh-swatch-danger { background-color: #f7c1c1; }",
    ".ocp-lh-swatch-warn { background-color: #fac775; }",
    ".ocp-lh-swatch-ok { background-color: #c0dd97; }"
  ].join("\n");

  var settings = OCPLH.sanitizeSettings({});
  var applyTimer = null;
  var observedRoots = new WeakSet();

  function msg(key, subs) {
    try {
      return chrome.i18n.getMessage(key, subs) || key;
    } catch (e) {
      return key;
    }
  }

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

  function headerCells(table) {
    var thead = table.querySelector("thead");
    if (thead) {
      var row = thead.querySelector("tr");
      if (row) return Array.prototype.slice.call(row.children);
    }
    var first = table.querySelector("tr");
    return first ? Array.prototype.slice.call(first.children) : [];
  }

  function headerTexts(table) {
    return headerCells(table).map(function (c) {
      return (c.textContent || "").trim();
    });
  }

  function findHeaderTable(root) {
    var tables = root.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      if (OCPLH.isLifecycleHeaderSet(headerTexts(tables[i]))) return tables[i];
    }
    return null;
  }

  function ensureStyle(root) {
    var host = root === document ? (document.head || document.documentElement) : root;
    if (host.querySelector && host.querySelector("style[data-ocp-lh]")) return;
    for (var i = 0; i < host.children.length; i++) {
      if (host.children[i].tagName === "STYLE" && host.children[i].hasAttribute("data-ocp-lh")) return;
    }
    var style = document.createElement("style");
    style.setAttribute("data-ocp-lh", "");
    style.textContent = STYLE_CSS;
    host.appendChild(style);
  }

  function cleanupRoot(root) {
    var badges = root.querySelectorAll(".ocp-lh-badge");
    for (var i = 0; i < badges.length; i++) badges[i].remove();
    var legends = root.querySelectorAll(".ocp-lh-legend");
    for (var j = 0; j < legends.length; j++) legends[j].remove();
    var cells = root.querySelectorAll(".ocp-lh-cell");
    for (var k = 0; k < cells.length; k++) {
      cells[k].classList.remove(
        "ocp-lh-cell", "ocp-lh-expired", "ocp-lh-danger",
        "ocp-lh-warn", "ocp-lh-ok", "ocp-lh-strike"
      );
    }
  }

  function badgeText(diff) {
    if (diff < 0) return msg("badgeEndedAgo", [String(-diff)]);
    return msg("badgeDaysLeft", [String(diff)]);
  }

  function cellDeadline(cell) {
    var endContainer = cell.querySelector(".end-date");
    if (endContainer) {
      var endDt = endContainer.querySelector("pfe-datetime[datetime]");
      return endDt ? OCPLH.parseDateTimeAttr(endDt.getAttribute("datetime")) : null;
    }
    var dts = cell.querySelectorAll("pfe-datetime[datetime]");
    if (dts.length > 0) {
      return OCPLH.parseDateTimeAttr(dts[dts.length - 1].getAttribute("datetime"));
    }
    return OCPLH.parseDeadlineFromText(cell.textContent || "");
  }

  function decorateCell(cell, today) {
    var date = cellDeadline(cell);
    if (!date) return false;
    var diff = OCPLH.daysUntil(date, today);
    var cls = OCPLH.classify(diff, settings);
    cell.classList.add("ocp-lh-cell", "ocp-lh-" + cls);
    if (settings.strikeExpired && cls === "expired") {
      cell.classList.add("ocp-lh-strike");
    }
    if (settings.showBadge) {
      var badge = document.createElement("span");
      badge.className = "ocp-lh-badge";
      badge.textContent = badgeText(diff);
      cell.appendChild(badge);
    }
    return true;
  }

  function cellLabel(cell) {
    return cell.getAttribute("data-label") || cell.getAttribute("headers") || "";
  }

  function decorateLabelledCells(root, today) {
    var headerTable = findHeaderTable(root);
    if (!headerTable) return false;

    var decorated = 0;
    var cells = root.querySelectorAll("td[data-label], td[headers]");
    for (var i = 0; i < cells.length; i++) {
      var label = cellLabel(cells[i]);
      if (OCPLH.isExcludedLabel(label)) continue;
      if (decorateCell(cells[i], today)) decorated++;
    }

    if (decorated > 0) {
      if (settings.showLegend) insertLegend(headerTable);
      ensureStyle(root);
    }
    return true;
  }

  function decoratePlainTables(root, today) {
    var tables = root.querySelectorAll("table");
    var decoratedAny = false;
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      var headers = headerTexts(table);
      if (!OCPLH.isLifecycleHeaderSet(headers)) continue;

      var rows = table.querySelectorAll("tbody tr");
      var decorated = 0;
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].children;
        for (var c = 0; c < cells.length; c++) {
          if (cells[c].tagName !== "TD") continue;
          if (cells[c].hasAttribute("data-label") || cells[c].hasAttribute("headers")) continue;
          var header = headers[cells[c].cellIndex] || "";
          if (OCPLH.isExcludedColumn(header)) continue;
          if (decorateCell(cells[c], today)) decorated++;
        }
      }
      if (decorated > 0) {
        decoratedAny = true;
        if (settings.showLegend && !table.previousElementSibling?.classList?.contains("ocp-lh-legend")) {
          insertLegend(table);
        }
        ensureStyle(root);
      }
    }
    return decoratedAny;
  }

  function insertLegend(beforeTable) {
    var prev = beforeTable.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains("ocp-lh-legend")) return;

    var legend = document.createElement("div");
    legend.className = "ocp-lh-legend";
    var title = document.createElement("span");
    title.className = "ocp-lh-legend-title";
    title.textContent = msg("legendTitle");
    legend.appendChild(title);

    var items = [
      ["expired", msg("legendExpired")],
      ["danger", msg("legendWithinDays", [String(settings.dangerDays)])],
      ["warn", msg("legendWithinDays", [String(settings.warnDays)])],
      ["ok", msg("legendBeyondDays", [String(settings.warnDays)])]
    ];
    items.forEach(function (item) {
      var el = document.createElement("span");
      el.className = "ocp-lh-legend-item";
      var swatch = document.createElement("span");
      swatch.className = "ocp-lh-swatch ocp-lh-swatch-" + item[0];
      el.appendChild(swatch);
      el.appendChild(document.createTextNode(item[1]));
      legend.appendChild(el);
    });
    beforeTable.parentNode.insertBefore(legend, beforeTable);
  }

  function applyAll() {
    var today = new Date();
    var roots = collectRoots();
    roots.forEach(function (root) {
      cleanupRoot(root);
    });
    roots.forEach(function (root) {
      observeRoot(root);
      var handled = decorateLabelledCells(root, today);
      if (!handled) decoratePlainTables(root, today);
    });
  }

  function scheduleApply() {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(applyAll, 200);
  }

  function isOurNode(node) {
    if (node.nodeType !== 1) return false;
    if (node.tagName === "STYLE" && node.hasAttribute("data-ocp-lh")) return true;
    return node.classList.contains("ocp-lh-badge") ||
      node.classList.contains("ocp-lh-legend");
  }

  function onMutations(mutations) {
    var external = mutations.some(function (m) {
      if (m.type === "characterData") {
        var p = m.target.parentElement;
        return !(p && p.closest && p.closest(".ocp-lh-badge, .ocp-lh-legend"));
      }
      var nodes = Array.prototype.slice.call(m.addedNodes)
        .concat(Array.prototype.slice.call(m.removedNodes));
      return nodes.some(function (n) { return !isOurNode(n); });
    });
    if (external) scheduleApply();
  }

  function observeRoot(root) {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    var target = root === document ? document.body : root;
    new MutationObserver(onMutations).observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  chrome.storage.sync.get(OCPLH.DEFAULTS, function (stored) {
    settings = OCPLH.sanitizeSettings(stored);
    applyAll();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    var raw = {};
    Object.keys(OCPLH.DEFAULTS).forEach(function (key) {
      raw[key] = changes[key] ? changes[key].newValue : settings[key];
    });
    settings = OCPLH.sanitizeSettings(raw);
    scheduleApply();
  });
})();
