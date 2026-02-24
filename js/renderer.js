/**
 * renderer.js — SVG-based talent tree renderer
 * Reads talent data, draws nodes + connections on three panels: class, spec, hero
 */

var TalentTreeRenderer = (function () {

  /* ── constants ── */
  var WOWHEAD_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium/';
  var NODE_SIZE   = 40;   // px – square / circle size
  var GRID_X      = 60;   // px – horizontal spacing
  var GRID_Y      = 60;   // px – vertical spacing
  var PADDING     = 30;   // px – SVG inner padding
  var heroIconEl  = null;

  /* ── state ── */
  var specData   = null;  // full JSON object for current spec
  var buildState = null;  // optional – which talents are chosen

  /* ── init ── */
  function init() {
    console.log('[Renderer] Initialized');
  }

  /* ── public entry point ── */
  function renderTree(data, state) {
    specData   = data;
    buildState = state || null;

    renderPanel('class', specData.classNodes || []);
    renderPanel('spec',  specData.specNodes  || []);
    renderPanel('hero',  specData.heroNodes  || []);

    // Render hero icon
    renderHeroIcon(specData, buildState);
  }

  /* ── render one panel (class / spec / hero) ── */
  function renderPanel(panelKey, nodes) {
    var panel = document.querySelector('.tree-panel[data-tree="' + panelKey + '"]');
    if (!panel) return;

    var svg = panel.querySelector('svg.talent-tree-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'talent-tree-svg');
      panel.appendChild(svg);
    }
    svg.innerHTML = '';

    if (!nodes || nodes.length === 0) {
      svg.setAttribute('width', 0);
      svg.setAttribute('height', 0);
      return;
    }

    /* — normalise positions to grid — */
    var coords = normalizePositions(nodes);

    /* — calculate SVG dimensions — */
    var maxCol = 0, maxRow = 0;
    coords.forEach(function (c) {
      if (c.col > maxCol) maxCol = c.col;
      if (c.row > maxRow) maxRow = c.row;
    });
    var svgW = maxCol * GRID_X + NODE_SIZE + PADDING * 2;
    var svgH = maxRow * GRID_Y + NODE_SIZE + PADDING * 2;
    svg.setAttribute('width',  svgW);
    svg.setAttribute('height', svgH);
    svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);

    /* — build id→coord lookup — */
    var coordMap = {};
    nodes.forEach(function (n, i) {
      coordMap[n.id] = coords[i];
    });

    /* — draw connections first (below nodes) — */
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

        var line = createSvgElement('line', {
          x1: x1, y1: y1, x2: x2, y2: y2,
          'class': 'talent-connection'
        });
        svg.appendChild(line);
      });
    });

    /* — draw nodes — */
    nodes.forEach(function (node, i) {
      var c = coords[i];
      var x = PADDING + c.col * GRID_X;
      var y = PADDING + c.row * GRID_Y;
      drawNode(svg, node, x, y, panelKey);
    });
  }

  /* ── normalize posX/posY to 0-based column/row ── */
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

  /* ── draw a single talent node ── */
  function drawNode(svg, node, x, y, panelKey) {
    var entry = (node.entries && node.entries[0]) || {};
    var iconName = entry.icon || '';
    var spellId  = entry.spellId || entry.visibleSpellId || 0;
    var isChoice = (node.type === 'choice');
    var isOctagon = isChoice;

    var g = createSvgElement('g', {
      'class': 'talent-node'
              + (node.entryNode ? ' entry-node' : '')
              + (isChoice ? ' choice-node' : '')
              + (entry.type === 'active' ? ' active-talent' : ' passive-talent'),
      'data-node-id':  node.id,
      'data-spell-id': spellId,
      transform: 'translate(' + x + ',' + y + ')'
    });

    /* shape */
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

      /* clip for octagon icon */
      var clipId = 'clip-oct-' + node.id;
      var defs = createSvgElement('defs', {});
      var clip = createSvgElement('clipPath', { id: clipId });
      var clipPoly = createSvgElement('polygon', { points: points });
      clip.appendChild(clipPoly);
      defs.appendChild(clip);
      g.appendChild(defs);

      if (iconName) {
        var img = createSvgElement('image', {
          href: getIconUrl(iconName),
          x: 0, y: 0,
          width: NODE_SIZE,
          height: NODE_SIZE,
          'clip-path': 'url(#' + clipId + ')',
          'class': 'node-icon'
        });
        g.appendChild(img);
      }
    } else if (entry.type === 'active') {
      /* square with rounded corners */
      var rect = createSvgElement('rect', {
        x: 0, y: 0,
        width: NODE_SIZE, height: NODE_SIZE,
        rx: 4, ry: 4,
        'class': 'node-shape node-square'
      });
      g.appendChild(rect);

      if (iconName) {
        var rectClipId = 'clip-rect-' + node.id;
        var rectDefs = createSvgElement('defs', {});
        var rectClip = createSvgElement('clipPath', { id: rectClipId });
        var rectClipRect = createSvgElement('rect', {
          x: 0, y: 0, width: NODE_SIZE, height: NODE_SIZE, rx: 4, ry: 4
        });
        rectClip.appendChild(rectClipRect);
        rectDefs.appendChild(rectClip);
        g.appendChild(rectDefs);

        var rectImg = createSvgElement('image', {
          href: getIconUrl(iconName),
          x: 0, y: 0,
          width: NODE_SIZE, height: NODE_SIZE,
          'clip-path': 'url(#' + rectClipId + ')',
          'class': 'node-icon'
        });
        g.appendChild(rectImg);
      }
    } else {
      /* circle for passive */
      var circ = createSvgElement('circle', {
        cx: NODE_SIZE / 2,
        cy: NODE_SIZE / 2,
        r:  NODE_SIZE / 2,
        'class': 'node-shape node-circle'
      });
      g.appendChild(circ);

      if (iconName) {
        var circClipId = 'clip-circ-' + node.id;
        var circDefs = createSvgElement('defs', {});
        var circClip = createSvgElement('clipPath', { id: circClipId });
        var circClipCircle = createSvgElement('circle', {
          cx: NODE_SIZE / 2, cy: NODE_SIZE / 2, r: NODE_SIZE / 2
        });
        circClip.appendChild(circClipCircle);
        circDefs.appendChild(circClip);
        g.appendChild(circDefs);

        var circImg = createSvgElement('image', {
          href: getIconUrl(iconName),
          x: 0, y: 0,
          width: NODE_SIZE, height: NODE_SIZE,
          'clip-path': 'url(#' + circClipId + ')',
          'class': 'node-icon'
        });
        g.appendChild(circImg);
      }
    }

    /* rank badge */
    if (node.maxRanks && node.maxRanks > 1) {
      var badge = createSvgElement('text', {
        x: NODE_SIZE - 2,
        y: NODE_SIZE - 2,
        'class': 'rank-badge',
        'text-anchor': 'end'
      });
      badge.textContent = '0/' + node.maxRanks;
      g.appendChild(badge);
    }

    svg.appendChild(g);
  }

  /* ── icon URL helper ── */
  function getIconUrl(iconName) {
    if (!iconName) return '';
    var name = iconName.toLowerCase();
    // Fix double underscore → underscore + hyphen (e.g. warlock__bloodstone → warlock_-bloodstone)
    name = name.replace(/__/g, '_-');
    return WOWHEAD_ICON_BASE + name + '.jpg';
  }

  /* ── SVG element helper ── */
  function createSvgElement(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

  /* ── Hero Tree Icon ── */
  function renderHeroIcon(specData, buildState) {
    // Remove old icon
    if (heroIconEl) {
      heroIconEl.remove();
      heroIconEl = null;
    }

    if (!specData || !specData.subTreeNodes || !specData.subTreeNodes[0]) return;

    var subTreeNode = specData.subTreeNodes[0];
    var entries = subTreeNode.entries;
    if (!entries || entries.length < 1) return;

    // Find active hero subTree from buildState
    var activeEntry = null;

    if (buildState && buildState.heroTreeId) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].traitSubTreeId === buildState.heroTreeId) {
          activeEntry = entries[i];
          break;
        }
      }
    }

    if (!activeEntry && buildState && buildState.heroNodes) {
      // Find by checking which subTree has allocated nodes
      var subTreeIds = {};
      entries.forEach(function (e) {
        subTreeIds[e.traitSubTreeId] = { entry: e, count: 0 };
      });

      specData.heroNodes.forEach(function (node) {
        if (node.subTreeId && subTreeIds[node.subTreeId]) {
          var nodeState = buildState.heroNodes[node.id];
          if (nodeState && nodeState.ranks > 0) {
            subTreeIds[node.subTreeId].count++;
          }
        }
      });

      var maxCount = 0;
      Object.keys(subTreeIds).forEach(function (id) {
        if (subTreeIds[id].count > maxCount) {
          maxCount = subTreeIds[id].count;
          activeEntry = subTreeIds[id].entry;
        }
      });
    }

    // Fallback to first entry
    if (!activeEntry) {
      activeEntry = entries[0];
    }

    var atlas = activeEntry.atlasMemberName;
    if (!atlas) return;

    var imgSrc = 'images/hero/' + atlas + '.png';

    // Find hero panel
    var heroPanel = document.querySelector('.tree-panel-hero');
    if (!heroPanel) return;

    // Create icon container
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
    heroPanel.insertBefore(heroIconEl, heroPanel.firstChild);
  }

  /* ── public API ── */
  return {
    init: init,
    renderTree: renderTree,
    renderHeroIcon: renderHeroIcon
  };

})();
