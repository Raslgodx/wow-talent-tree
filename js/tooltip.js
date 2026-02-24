/**
 * Tooltip system for talent nodes
 */

var TalentTooltip = (function () {

  var tooltipEl = null;

  function init() {
    tooltipEl = document.getElementById('tooltip');
    if (!tooltipEl) return;

    // Track mouse position
    document.addEventListener('mousemove', function (e) {
      if (!tooltipEl.classList.contains('visible')) return;

      var x = e.clientX + 16;
      var y = e.clientY + 16;

      // Keep on screen
      var rect = tooltipEl.getBoundingClientRect();
      var winW = window.innerWidth;
      var winH = window.innerHeight;

      if (x + rect.width > winW - 10) {
        x = e.clientX - rect.width - 16;
      }
      if (y + rect.height > winH - 10) {
        y = e.clientY - rect.height - 16;
      }
      if (x < 5) x = 5;
      if (y < 5) y = 5;

      tooltipEl.style.left = x + 'px';
      tooltipEl.style.top = y + 'px';
    });

    // Hover on nodes (event delegation)
    document.addEventListener('mouseover', function (e) {
      var node = findNodeGroup(e.target);
      if (node) {
        show(node);
      }
    });

    document.addEventListener('mouseout', function (e) {
      var node = findNodeGroup(e.target);
      if (node) {
        var related = findNodeGroup(e.relatedTarget);
        if (related !== node) {
          hide();
        }
      }
    });

    // Hide on scroll
    document.addEventListener('scroll', function () {
      hide();
    }, true);
  }

  function findNodeGroup(el) {
    if (!el) return null;
    if (el.classList && el.classList.contains('talent-node')) return el;
    if (el.closest) return el.closest('.talent-node');
    // Fallback for SVG elements
    var current = el;
    while (current && current !== document) {
      if (current.classList && current.classList.contains('talent-node')) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  function show(nodeEl) {
    if (!tooltipEl) return;

    var name = nodeEl.getAttribute('data-name') || 'Unknown';
    var icon = nodeEl.getAttribute('data-icon') || '';
    var type = nodeEl.getAttribute('data-type') || '';
    var rank = parseInt(nodeEl.getAttribute('data-rank')) || 0;
    var maxRank = parseInt(nodeEl.getAttribute('data-max-rank')) || 1;
    var spellId = nodeEl.getAttribute('data-spell-id') || '';
    var isActive = nodeEl.classList.contains('active');
    var isMaxed = nodeEl.classList.contains('maxed');
    var isChoice = nodeEl.classList.contains('choice-node');

    // Icon
    var iconSrc = icon
      ? 'https://wow.zamimg.com/images/wow/icons/large/' + icon + '.jpg'
      : '';

    // Rank display
    var rankStr = '';
    var rankColor = '#555';
    if (maxRank > 1) {
      rankStr = 'Rank ' + rank + ' / ' + maxRank;
      if (isMaxed) rankColor = '#43d243';
      else if (isActive) rankColor = '#f0b232';
    } else {
      if (isActive) {
        rankStr = 'Learned';
        rankColor = '#43d243';
      } else {
        rankStr = 'Not learned';
        rankColor = '#666';
      }
    }

    // Type label
    var typeLabel = '';
    if (type === 'active') typeLabel = 'Active Ability';
    else if (type === 'passive') typeLabel = 'Passive';
    if (isChoice) typeLabel = 'Choice Talent' + (typeLabel ? ' · ' + typeLabel : '');

    // Build tooltip HTML
    var html = '<div class="tt-header">';
    if (iconSrc) {
      html += '<img class="tt-icon" src="' + iconSrc + '" alt="" onerror="this.style.display=\'none\'">';
    }
    html += '<div>';
    html += '<div class="tt-name">' + escapeHtml(name) + '</div>';
    html += '<div class="tt-rank" style="color:' + rankColor + '">' + rankStr + '</div>';
    html += '</div>';
    html += '</div>';

    if (typeLabel) {
      html += '<div class="tt-type">' + typeLabel + '</div>';
    }

    if (spellId) {
      html += '<div class="tt-spell-id">Spell ID: ' + spellId + '</div>';
    }

    tooltipEl.innerHTML = html;
    tooltipEl.classList.add('visible');
  }

  function hide() {
    if (tooltipEl) {
      tooltipEl.classList.remove('visible');
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  return {
    init: init,
    show: show,
    hide: hide
  };

})();
