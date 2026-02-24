/**
 * Tooltip system — uses Wowhead tooltips for spell info
 */

var TalentTooltip = (function () {

  var wowheadLoaded = false;

  function init() {
    // Load Wowhead tooltip script
    loadWowheadScript();

    // Add hover listeners via event delegation
    document.addEventListener('mouseover', function (e) {
      var node = findNodeGroup(e.target);
      if (node) {
        onNodeHover(node);
      }
    });
  }

  function loadWowheadScript() {
    // Set config before loading script
    if (!window.whTooltips) {
      window.whTooltips = {
        colorLinks: true,
        renameLinks: false,
        iconSize: 'small'
      };
    }

    var script = document.createElement('script');
    script.src = 'https://wow.zamimg.com/js/tooltips.js';
    script.onload = function () {
      wowheadLoaded = true;
      console.log('Wowhead tooltips loaded');
    };
    document.head.appendChild(script);
  }

  function findNodeGroup(el) {
    if (!el) return null;
    var current = el;
    while (current && current !== document) {
      if (current.classList && current.classList.contains('talent-node')) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  function onNodeHover(nodeEl) {
    var spellId = nodeEl.getAttribute('data-spell-id');
    if (!spellId || spellId === '0' || spellId === '') return;

    // Check if we already added a wowhead link to this node
    if (nodeEl.getAttribute('data-wh-attached') === 'true') return;
    nodeEl.setAttribute('data-wh-attached', 'true');

    // Create an invisible anchor that Wowhead will attach tooltip to
    // We use foreignObject to embed HTML inside SVG
    var fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    var r = 19; // NODE_RADIUS
    var cx = 0, cy = 0;

    // Get node center from the background shape
    var bgShape = nodeEl.querySelector('.node-bg-fill');
    if (bgShape) {
      if (bgShape.tagName === 'rect') {
        cx = parseFloat(bgShape.getAttribute('x')) + parseFloat(bgShape.getAttribute('width')) / 2;
        cy = parseFloat(bgShape.getAttribute('y')) + parseFloat(bgShape.getAttribute('height')) / 2;
      } else {
        // For path (octagon), parse from data attribute or use bounding box
        var bbox = bgShape.getBBox();
        cx = bbox.x + bbox.width / 2;
        cy = bbox.y + bbox.height / 2;
      }
    }

    fo.setAttribute('x', cx - r);
    fo.setAttribute('y', cy - r);
    fo.setAttribute('width', r * 2);
    fo.setAttribute('height', r * 2);

    var link = document.createElement('a');
    link.href = 'https://www.wowhead.com/spell=' + spellId;
    link.setAttribute('data-wowhead', 'spell=' + spellId);
    link.style.display = 'block';
    link.style.width = '100%';
    link.style.height = '100%';
    link.style.opacity = '0';
    link.target = '_blank';

    fo.appendChild(link);
    nodeEl.appendChild(fo);

    // Tell Wowhead to rescan for new tooltips
    if (wowheadLoaded && window.$WowheadPower && window.$WowheadPower.refreshLinks) {
      window.$WowheadPower.refreshLinks();
    }
  }

  return {
    init: init
  };

})();
