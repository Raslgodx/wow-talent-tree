/**
 * Tooltip system — fetches from Wowhead API, shows under cursor
 * Uses position: fixed to avoid container offset issues
 */

var TalentTooltip = (function () {

  var tooltipEl = null;
  var tooltipCache = {};
  var currentSpellId = null;
  var WOWHEAD_TOOLTIP_API = 'https://nether.wowhead.com/tooltip/spell/';
  var LOCALE = 8; // Will be auto-detected or set manually

  function init() {
    tooltipEl = document.getElementById('tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'tooltip';
      tooltipEl.className = 'wh-tooltip';
      document.body.appendChild(tooltipEl);
    }

    // Detect correct locale for Russian
    detectLocale();

    // Mouse events
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseout', onMouseOut, true);

    // Prevent click on talent links
    document.addEventListener('click', function (e) {
      var link = findTalentLink(e.target);
      if (link) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Touch: tap to show, tap elsewhere to hide
    document.addEventListener('touchstart', function (e) {
      var link = findTalentLink(e.target);
      if (link) {
        e.preventDefault();
        var spellId = link.getAttribute('data-spell-id');
        if (spellId) {
          var touch = e.touches[0];
          showTooltip(parseInt(spellId), touch.clientX, touch.clientY);
        }
      } else if (!tooltipEl.contains(e.target)) {
        hideTooltip();
      }
    }, { passive: false });

    console.log('[Tooltip] Initialized');
  }

  function detectLocale() {
    // Try locale 8 first, check if it returns Russian
    fetch(WOWHEAD_TOOLTIP_API + '445465?dataEnv=1&locale=8')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.tooltip && /[\u0400-\u04FF]/.test(d.tooltip)) {
          LOCALE = 8;
          console.log('[Tooltip] Locale 8 = Russian ✓');
        } else {
          // Try other locales
          tryLocales([7, 9, 10, 11, 12, 13, 14, 15, 6, 5, 4, 3, 2, 1]);
        }
      })
      .catch(function () {
        LOCALE = 8;
      });
  }

  function tryLocales(list) {
    if (list.length === 0) {
      console.log('[Tooltip] Could not find Russian locale, using 8');
      return;
    }
    var loc = list[0];
    fetch(WOWHEAD_TOOLTIP_API + '445465?dataEnv=1&locale=' + loc)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.tooltip && /[\u0400-\u04FF]/.test(d.tooltip)) {
          LOCALE = loc;
          console.log('[Tooltip] Found Russian at locale=' + loc);
        } else {
          tryLocales(list.slice(1));
        }
      })
      .catch(function () {
        tryLocales(list.slice(1));
      });
  }

  function onMouseOver(e) {
    var link = findTalentLink(e.target);
    if (!link) return;
    var spellId = link.getAttribute('data-spell-id');
    if (spellId) {
      showTooltip(parseInt(spellId), e.clientX, e.clientY);
    }
  }

  function onMouseMove(e) {
    if (tooltipEl.style.display !== 'block') return;
    positionTooltip(e.clientX, e.clientY);
  }

  function onMouseOut(e) {
    var link = findTalentLink(e.target);
    if (link) {
      // Check if moving to another element within same link
      var related = e.relatedTarget;
      if (related && link.contains(related)) return;
      hideTooltip();
    }
  }

  function findTalentLink(el) {
    var node = el;
    var depth = 0;
    while (node && depth < 15) {
      if (node.getAttribute && node.getAttribute('data-spell-id')) {
        return node;
      }
      node = node.parentNode;
      depth++;
    }
    return null;
  }

  function showTooltip(spellId, clientX, clientY) {
    currentSpellId = spellId;

    if (tooltipCache[spellId]) {
      renderTooltip(tooltipCache[spellId]);
      positionTooltip(clientX, clientY);
      return;
    }

    // Loading
    tooltipEl.innerHTML = '<div class="wh-tooltip-loading">Загрузка...</div>';
    tooltipEl.style.display = 'block';
    positionTooltip(clientX, clientY);

    var url = WOWHEAD_TOOLTIP_API + spellId + '?dataEnv=1&locale=' + LOCALE;

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (currentSpellId === spellId) {
          tooltipCache[spellId] = data;
          renderTooltip(data);
        }
      })
      .catch(function () {
        if (currentSpellId === spellId) {
          tooltipEl.innerHTML = '<div class="wh-tooltip-simple"><b>Spell #' + spellId + '</b><br>' +
            '<a href="https://www.wowhead.com/ru/spell=' + spellId + '" target="_blank" style="color:#4488ff;font-size:12px;">Wowhead</a></div>';
        }
      });
  }

  function renderTooltip(data) {
    if (!data) {
      hideTooltip();
      return;
    }

    var html = '';
    if (data.tooltip) {
      html = data.tooltip;
    } else if (data.name) {
      html = '<div class="wh-tooltip-simple"><b>' + escapeHtml(data.name) + '</b></div>';
    }

    if (html) {
      tooltipEl.innerHTML = html;
      tooltipEl.style.display = 'block';
    }
  }

  function positionTooltip(clientX, clientY) {
    // Position using fixed coordinates — directly under cursor
    var tipW = tooltipEl.offsetWidth || 300;
    var tipH = tooltipEl.offsetHeight || 100;
    var winW = window.innerWidth;
    var winH = window.innerHeight;

    var left = clientX + 12;
    var top = clientY + 16;

    // Keep on screen — flip if needed
    if (left + tipW > winW - 8) {
      left = clientX - tipW - 12;
    }
    if (top + tipH > winH - 8) {
      top = clientY - tipH - 16;
    }
    if (left < 4) left = 4;
    if (top < 4) top = 4;

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function hideTooltip() {
    currentSpellId = null;
    if (tooltipEl) {
      tooltipEl.style.display = 'none';
      tooltipEl.innerHTML = '';
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    show: showTooltip,
    hide: hideTooltip
  };

})();
