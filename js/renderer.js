/**
 * renderer.js — SVG-based talent tree renderer
 * renderTree(svgEl, nodes, selections) — draws nodes + connections into given SVG element
 */

var TalentTreeRenderer = (function () {

    var WOWHEAD_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium/';
  var NODE_SIZE   = 40;
  var GRID_X      = 60;
  var GRID_Y      = 60;
  var PADDING     = 30;
  var heroIconEl  = null;

  // Custom icon overrides: spellId → correct icon filename (without .jpg)
  var iconOverrides = {
    454433: 'achievement_guildperk_havegroup-willtravel'
  };

  function getIconUrl(iconName, spellId) {
    if (spellId && iconOverrides[spellId]) {
      return WOWHEAD_ICON_BASE + iconOverrides[spellId] + '.jpg';
    }
    if (!iconName) return '';
    var name = iconName.toLowerCase();
    return WOWHEAD_ICON_BASE + name + '.jpg';
  }

  function init() {
    console.log('[Renderer] Initialized');
  }

  /**
   * Main render function — called from main.js as:
   *   renderTree(svgElement, nodesArray, selectionsObject)
   */
    function renderTree(svgEl, nodes, selections) {
    if (!svgEl) return;
    svgEl.innerHTML = '';

    if (!nodes || nodes.length === 0) {
      svgEl.setAttribute('width', 0);
      svgEl.setAttribute('height', 0);
      return;
    }

    var sel = selections || {};

    var coords = normalizePositions(nodes);

    var maxCol = 0, maxRow = 0;
    coords.forEach(function (c) {
      if (c.col > maxCol) maxCol = c.col;
      if (c.row > maxRow) maxRow = c.row;
    });
    var svgW = maxCol * GRID_X + NODE_SIZE + PADDING * 2;
    var svgH = maxRow * GRID_Y + NODE_SIZE + PADDING * 2;

    // Use viewBox for scaling, remove fixed width/height
    svgEl.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
    svgEl.setAttribute('width', svgW);
    svgEl.setAttribute('height', svgH);
    svgEl.style.width = '100%';
    svgEl.style.height = 'auto';

    var coordMap = {};
    nodes.forEach(function (n, i) {
      coordMap[n.id] = coords[i];
    });

    // Connections
    nodes.forEach(function (node) {
      if (!node.next) return;
      var from = coordMap[node.id];
      if (!from) return;

      node.next.forEach(function (nextId) {
        var to = coordMap[nextId];
        if (!to) return;

        var x1 = PADDING + from.col * GRID_X + NODE_SIZE / 2;
        var y1 = PADDING + from.row * GRID_Y + NODE_SIZE / 2;
        var x2 = PADDING + to.col   * GRID_X + NODE_SIZE / 2;
        var y2 = PADDING + to.row   * GRID_Y + NODE_SIZE / 2;

        var fromSel = sel[node.id];
        var toSel   = sel[nextId];
        var connActive = fromSel && toSel;

        var line = createSvgElement('line', {
          x1: x1, y1: y1, x2: x2, y2: y2,
          'class': 'talent-connection' + (connActive ? ' connection-active' : '')
        });
        svgEl.appendChild(line);
      });
    });

    // Nodes
    nodes.forEach(function (node, i) {
      var c = coords[i];
      var x = PADDING + c.col * GRID_X;
      var y = PADDING + c.row * GRID_Y;
      drawNode(svgEl, node, x, y, sel);
    });
  }

  function normalizePositions(nodes) {
    var xs = [], ys = [];
    nodes.forEach(function (n) {
      if (xs.indexOf(n.posX) === -1) xs.push(n.posX);
      if (ys.indexOf(n.posY) === -1) ys.push(n.posY);
    });
    xs.sort(function (a, b) { return a - b; });
    ys.sort(function (a, b) { return a - b; });

    return nodes.map(function (n) {
      return {
        col: xs.indexOf(n.posX),
        row: ys.indexOf(n.posY)
      };
    });
  }

   function drawNode(svg, node, x, y, selections) {
    var nodeSel = selections[node.id];
    var isSelected = !!nodeSel;

    var entryIndex = 0;
    if (nodeSel && nodeSel.choiceIndex !== undefined && node.entries && node.entries.length > 1) {
      entryIndex = nodeSel.choiceIndex;
    }
    var entry = (node.entries && node.entries[entryIndex]) || (node.entries && node.entries[0]) || {};

    var iconName = entry.icon || '';
    var spellId  = entry.spellId || entry.visibleSpellId || 0;
    var isChoice = (node.type === 'choice');
    var isOctagon = isChoice;

    var g = createSvgElement('g', {
      'class': 'talent-node'
              + (node.entryNode ? ' entry-node' : '')
              + (isChoice ? ' choice-node' : '')
              + (entry.type === 'active' ? ' active-talent' : ' passive-talent')
              + (isSelected ? ' node-selected' : ' node-unselected'),
      'data-node-id':  node.id,
      'data-spell-id': spellId,
      transform: 'translate(' + x + ',' + y + ')'
    });

    if (isOctagon) {
      var s = NODE_SIZE;
      var c = s * 0.3;
      var points = [
        c + ',0',
        (s - c) + ',0',
        s + ',' + c,
        s + ',' + (s - c),
        (s - c) + ',' + s,
        c + ',' + s,
        '0,' + (s - c),
        '0,' + c
      ].join(' ');
      var oct = createSvgElement('polygon', {
        points: points,
        'class': 'node-shape node-octagon'
      });
      g.appendChild(oct);

      var clipId = 'clip-oct-' + node.id;
      var defs = createSvgElement('defs', {});
      var clip = createSvgElement('clipPath', { id: clipId });
      var clipPoly = createSvgElement('polygon', { points: points });
      clip.appendChild(clipPoly);
      defs.appendChild(clip);
      g.appendChild(defs);

      addIconWithFallback(g, iconName, clipId, 0, 0, NODE_SIZE, NODE_SIZE);

    } else if (entry.type === 'active') {
      var rect = createSvgElement('rect', {
        x: 0, y: 0,
        width: NODE_SIZE, height: NODE_SIZE,
        rx: 4, ry: 4,
        'class': 'node-shape node-square'
      });
      g.appendChild(rect);

      var rectClipId = 'clip-rect-' + node.id;
      var rectDefs = createSvgElement('defs', {});
      var rectClip = createSvgElement('clipPath', { id: rectClipId });
      var rectClipRect = createSvgElement('rect', {
        x: 0, y: 0, width: NODE_SIZE, height: NODE_SIZE, rx: 4, ry: 4
      });
      rectClip.appendChild(rectClipRect);
      rectDefs.appendChild(rectClip);
      g.appendChild(rectDefs);

      addIconWithFallback(g, iconName, rectClipId, 0, 0, NODE_SIZE, NODE_SIZE);

    } else {
      var circ = createSvgElement('circle', {
        cx: NODE_SIZE / 2,
        cy: NODE_SIZE / 2,
        r:  NODE_SIZE / 2,
        'class': 'node-shape node-circle'
      });
      g.appendChild(circ);

      var circClipId = 'clip-circ-' + node.id;
      var circDefs = createSvgElement('defs', {});
      var circClip = createSvgElement('clipPath', { id: circClipId });
      var circClipCircle = createSvgElement('circle', {
        cx: NODE_SIZE / 2, cy: NODE_SIZE / 2, r: NODE_SIZE / 2
      });
      circClip.appendChild(circClipCircle);
      circDefs.appendChild(circClip);
      g.appendChild(circDefs);

      addIconWithFallback(g, iconName, circClipId, 0, 0, NODE_SIZE, NODE_SIZE);
    }

    if (node.maxRanks && node.maxRanks > 1) {
      var currentRank = nodeSel ? nodeSel.rank : 0;
      var badge = createSvgElement('text', {
        x: NODE_SIZE - 2,
        y: NODE_SIZE - 2,
        'class': 'rank-badge',
        'text-anchor': 'end'
      });
      badge.textContent = currentRank + '/' + node.maxRanks;
      g.appendChild(badge);
    }

    svg.appendChild(g);
  }

   function getIconUrl(iconName) {
    if (!iconName) return '';
    var name = iconName.toLowerCase();
    return WOWHEAD_ICON_BASE + name + '.jpg';
  }

  function getIconUrlFallback(iconName) {
    if (!iconName) return '';
    var name = iconName.toLowerCase();
    // Try replacing underscores with hyphens in various positions
    // Wowhead sometimes uses hyphens instead of underscores
    name = name.replace(/_/g, '-');
    return WOWHEAD_ICON_BASE + name + '.jpg';
  }

  function addIconWithFallback(g, iconName, clipPathId, x, y, w, h) {
    if (!iconName) return;

    var img = createSvgElement('image', {
      href: getIconUrl(iconName),
      x: x, y: y,
      width: w, height: h,
      'class': 'node-icon'
    });
    if (clipPathId) {
      img.setAttribute('clip-path', 'url(#' + clipPathId + ')');
    }

    // On error: try fallback URL with hyphens
    img.addEventListener('error', function () {
      var fallback = getIconUrlFallback(iconName);
      if (img.getAttribute('href') !== fallback) {
        img.setAttribute('href', fallback);
      }
    });

    g.appendChild(img);
  }

  function createSvgElement(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

      function renderHeroIcon(treeData, selectedSubTreeId) {
    if (heroIconEl) {
      heroIconEl.remove();
      heroIconEl = null;
    }

    var heroPanel = document.getElementById('heroTreePanel');
    if (!heroPanel) return;

    if (!treeData || !treeData.subTreeNodes || !treeData.subTreeNodes[0]) return;

    var subTreeNode = treeData.subTreeNodes[0];
    var entries = subTreeNode.entries;
    if (!entries || entries.length < 1) return;

    var activeEntry = null;

    if (selectedSubTreeId !== null && selectedSubTreeId !== undefined) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].traitSubTreeId === selectedSubTreeId) {
          activeEntry = entries[i];
          break;
        }
      }
    }

    if (!activeEntry) {
      activeEntry = entries[0];
    }

    var atlas = activeEntry.atlasMemberName;
    if (!atlas) return;

    var imgSrc = 'images/hero/' + atlas + '.webp';

    heroIconEl = document.createElement('div');
    heroIconEl.className = 'hero-tree-icon';

    var img = document.createElement('img');
    img.src = imgSrc;
    img.alt = activeEntry.name || '';
    img.onerror = function () {
      heroIconEl.style.display = 'none';
    };

    heroIconEl.appendChild(img);

    // Insert before SVG
    var svgEl = heroPanel.querySelector('svg');
    if (svgEl) {
      heroPanel.insertBefore(heroIconEl, svgEl);
    } else {
      heroPanel.appendChild(heroIconEl);
    }
  }

  return {
    init: init,
    renderTree: renderTree,
    renderHeroIcon: renderHeroIcon
  };

})();
