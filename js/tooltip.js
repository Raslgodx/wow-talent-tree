/**
 * Tooltip system for talent tree
 * Fetches tooltip HTML from Wowhead and shows on hover
 * Uses Russian locale (/ru/)
 */

var TalentTooltip = (function () {

  var tooltipEl = null;
  var tooltipCache = {};
  var currentSpellId = null;
  var hideTimeout = null;
  var WOWHEAD_TOOLTIP_API = 'https://nether.wowhead.com/tooltip/spell/';

  function init() {
    tooltipEl = document.getElementById('tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'tooltip';
      tooltipEl.className = 'wh-tooltip';
      document.body.appendChild(tooltipEl);
    }

    // Listen for mouse events on talent links in SVG
    document.addEventListener('mouseover', function (e) {
      var link = findTalentLink(e.target);
      if (link) {
        var spellId = link.getAttribute('data-spell-id');
        if (spellId) {
          clearTimeout(hideTimeout);
          showTooltip(parseInt(spellId), e);
        }
      }
    });

    document.addEventListener('mousemove', function (e) {
      if (tooltipEl.style.display === 'block') {
        positionTooltip(e);
      }
    });

    document.addEventListener('mouseout', function (e) {
      var link = findTalentLink(e.target);
      if (link) {
        hideTimeout = setTimeout(function () {
          hideTooltip();
        }, 100);
      }
    });

    // Prevent tooltip from hiding when hovering over tooltip itself
    tooltipEl.addEventListener('mouseenter', function () {
      clearTimeout(hideTimeout);
    });

    tooltipEl.addEventListener('mouseleave', function () {
      hideTooltip();
    });

    // Touch support
    document.addEventListener('click', function (e) {
      var link = findTalentLink(e.target);
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        var spellId = link.getAttribute('data-spell-id');
        if (spellId) {
          if (currentSpellId === parseInt(spellId) && tooltipEl.style.display === 'block') {
            hideTooltip();
          } else {
            showTooltip(parseInt(spellId), e);
          }
        }
      } else if (!tooltipEl.contains(e.target)) {
        hideTooltip();
      }
    });

    console.log('[Tooltip] Initialized with Wowhead /ru/ tooltips');
  }

  function findTalentLink(el) {
    var node = el;
    var maxDepth = 10;
    while (node && maxDepth > 0) {
      if (node.getAttribute && node.getAttribute('data-spell-id')) {
        return node;
      }
      // Check for SVG <a> parent with data-spell-id
      if (node.tagName === 'a' || node.tagName === 'A' ||
          (node.namespaceURI && node.namespaceURI.indexOf('svg') !== -1 && node.tagName === 'a')) {
        if (node.getAttribute('data-spell-id')) {
          return node;
        }
      }
      node = node.parentNode || node.parentElement;
      maxDepth--;
    }
    return null;
  }

  function showTooltip(spellId, event) {
    currentSpellId = spellId;

    if (tooltipCache[spellId]) {
      renderTooltip(tooltipCache[spellId], event);
      return;
    }

    // Show loading state
    tooltipEl.innerHTML = '<div class="wh-tooltip-loading">Загрузка...</div>';
    tooltipEl.style.display = 'block';
    positionTooltip(event);

    // Fetch from Wowhead
    fetchTooltip(spellId, function (data) {
      if (currentSpellId === spellId) {
        tooltipCache[spellId] = data;
        renderTooltip(data, event);
      }
    });
  }

  function fetchTooltip(spellId, callback) {
    var url = WOWHEAD_TOOLTIP_API + spellId + '?dataEnv=1&locale=8';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            callback(data);
          } catch (e) {
            // Fallback: try JSONP approach
            fetchTooltipJsonp(spellId, callback);
          }
        } else {
          fetchTooltipJsonp(spellId, callback);
        }
      }
    };
    xhr.onerror = function () {
      fetchTooltipJsonp(spellId, callback);
    };

    try {
      xhr.send();
    } catch (e) {
      fetchTooltipJsonp(spellId, callback);
    }
  }

  function fetchTooltipJsonp(spellId, callback) {
    // Use iframe approach to get tooltip from Wowhead
    // Create a hidden link and use Wowhead's own tooltip system
    var tempLink = document.createElement('a');
    tempLink.href = 'https://www.wowhead.com/ru/spell=' + spellId;
    tempLink.dataset.wowhead = 'spell=' + spellId + '&domain=ru';
    tempLink.style.position = 'absolute';
    tempLink.style.left = '-9999px';
    tempLink.style.top = '-9999px';
    tempLink.textContent = 'spell';
    document.body.appendChild(tempLink);

    // Try to trigger Wowhead tooltip system
    if (window.$WowheadPower && window.$WowheadPower.refreshLinks) {
      window.$WowheadPower.refreshLinks();
    }

    // Wait a moment then try to capture tooltip
    setTimeout(function () {
      // Look for Wowhead's tooltip element
      var whTooltip = document.getElementById('wowhead-tooltip-0') ||
                      document.querySelector('.wowhead-tooltip') ||
                      document.querySelector('#wowhead-tooltip');

      if (whTooltip && whTooltip.innerHTML) {
        callback({ tooltip: whTooltip.innerHTML });
      } else {
        // Fallback: simple text tooltip
        callback({
          tooltip: null,
          name: 'Spell #' + spellId,
          fallback: true
        });
      }

      document.body.removeChild(tempLink);
    }, 300);
  }

  function renderTooltip(data, event) {
    if (!data) {
      hideTooltip();
      return;
    }

    var html = '';

    if (data.tooltip) {
      html = data.tooltip;
    } else if (data.name) {
      html = '<div class="wh-tooltip-simple">' +
        '<b>' + escapeHtml(data.name) + '</b>' +
        (data.fallback ? '<br><a href="https://www.wowhead.com/ru/spell=' + currentSpellId +
          '" target="_blank" style="color:#4488ff;font-size:12px;">Открыть на Wowhead</a>' : '') +
        '</div>';
    }

    if (html) {
      tooltipEl.innerHTML = html;
      tooltipEl.style.display = 'block';
      positionTooltip(event);

      // Load Wowhead CSS for proper styling
      loadWowheadTooltipCss();
    }
  }

  var wowheadCssLoaded = false;
  function loadWowheadTooltipCss() {
    if (wowheadCssLoaded) return;
    wowheadCssLoaded = true;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://wow.zamimg.com/css/universal.css';
    document.head.appendChild(link);
  }

  function positionTooltip(event) {
    var x, y;

    if (event && event.clientX !== undefined) {
      x = event.clientX;
      y = event.clientY;
    } else if (event && event.touches && event.touches[0]) {
      x = event.touches[0].clientX;
      y = event.touches[0].clientY;
    } else {
      return;
    }

    var tooltipWidth = tooltipEl.offsetWidth || 300;
    var tooltipHeight = tooltipEl.offsetHeight || 200;
    var windowWidth = window.innerWidth;
    var windowHeight = window.innerHeight;
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;

    var left = x + scrollX + 15;
    var top = y + scrollY + 15;

    // Keep tooltip on screen
    if (left + tooltipWidth > windowWidth + scrollX - 10) {
      left = x + scrollX - tooltipWidth - 15;
    }
    if (top + tooltipHeight > windowHeight + scrollY - 10) {
      top = y + scrollY - tooltipHeight - 15;
    }
    if (left < scrollX + 5) left = scrollX + 5;
    if (top < scrollY + 5) top = scrollY + 5;

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
