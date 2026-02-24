/**
 * SVG Talent Tree Renderer
 */

var TreeRenderer = (function () {

  var ICON_CDN = 'https://wow.zamimg.com/images/wow/icons/medium';
  var NODE_RADIUS = 19;
  var SCALE = 0.08;
  var PADDING = 40;

  // ---- SVG helper ----
  function svg(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    return el;
  }

  // ---- Icon URL ----
  function iconUrl(name) {
    if (!name) return '';
    return ICON_CDN + '/' + name + '.jpg';
  }

  // ---- Normalize node positions ----
  function layoutNodes(nodes) {
    if (!nodes || nodes.length === 0) {
      return { placed: [], width: 300, height: 100 };
    }

    var minX = Infinity, maxX = -Infinity;
    var minY = Infinity, maxY = -Infinity;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.posX < minX) minX = n.posX;
      if (n.posX > maxX) maxX = n.posX;
      if (n.posY < minY) minY = n.posY;
      if (n.posY > maxY) maxY = n.posY;
    }

    var placed = [];
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      placed.push({
        node: node,
        x: (node.posX - minX) * SCALE + PADDING,
        y: (node.posY - minY) * SCALE + PADDING
      });
    }

    var width = (maxX - minX) * SCALE + PADDING * 2;
    var height = (maxY - minY) * SCALE + PADDING * 2;

    return { placed: placed, width: width, height: height };
  }

  // ---- Octagon path ----
  function octagonPath(cx, cy, r) {
    var a = r * 0.414;
    return 'M ' + (cx - r) + ' ' + (cy - a) +
      ' L ' + (cx - a) + ' ' + (cy - r) +
      ' L ' + (cx + a) + ' ' + (cy - r) +
      ' L ' + (cx + r) + ' ' + (cy - a) +
      ' L ' + (cx + r) + ' ' + (cy + a) +
      ' L ' + (cx + a) + ' ' + (cy + r) +
      ' L ' + (cx - a) + ' ' + (cy + r) +
      ' L ' + (cx - r) + ' ' + (cy + a) +
      ' Z';
  }

  // ---- Render connection ----
  function renderConnection(fromX, fromY, toX, toY, isActive) {
    return svg('line', {
      x1: fromX,
      y1: fromY,
      x2: toX,
      y2: toY,
      'class': 'connection-line' + (isActive ? ' active' : '')
    });
  }

  // ---- Render a single node ----
  function renderNode(placed, selections) {
    var node = placed.node;
    var cx = placed.x;
    var cy = placed.y;
    var sel = selections[node.id] || null;
    var isActive = !!sel;
    var isMaxed = isActive && sel.rank >= node.maxRanks;
    var isChoice = node.type === 'choice';
    var r = NODE_RADIUS;

    // Pick entry to display
    var entry = node.entries[0];
    if (isChoice && sel && node.entries.length > 1) {
      entry = node.entries[sel.choiceIndex] || node.entries[0];
    }

    // CSS classes
    var classes = 'talent-node';
    if (isActive) classes += ' active';
    else classes += ' inactive';
    if (isMaxed) classes += ' maxed';
    if (isChoice) classes += ' choice-node';

    var group = svg('g', {
      'class': classes,
      'data-node-id': node.id,
      'data-name': entry ? entry.name : node.name,
      'data-icon': entry ? entry.icon : '',
      'data-type': entry ? entry.type : '',
      'data-rank': sel ? sel.rank : 0,
      'data-max-rank': node.maxRanks,
      'data-spell-id': entry ? entry.spellId : ''
    });

    // Clip path
    var clipId = 'clip-node-' + node.id;
    var defs = svg('defs');
    var clip = svg('clipPath', { id: clipId });

    if (isChoice) {
      clip.appendChild(svg('path', {
        d: octagonPath(cx, cy, r - 3)
      }));
    } else {
      clip.appendChild(svg('rect', {
        x: cx - r + 3,
        y: cy - r + 3,
        width: (r - 3) * 2,
        height: (r - 3) * 2,
        rx: 4,
        ry: 4
      }));
    }
    defs.appendChild(clip);
    group.appendChild(defs);

    // Background
    if (isChoice) {
      group.appendChild(svg('path', {
        d: octagonPath(cx, cy, r),
        'class': 'node-bg-fill'
      }));
    } else {
      group.appendChild(svg('rect', {
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        rx: 6,
        ry: 6,
        'class': 'node-bg-fill'
      }));
    }

    // Icon
    if (entry && entry.icon) {
      group.appendChild(svg('image', {
        href: iconUrl(entry.icon),
        x: cx - r + 3,
        y: cy - r + 3,
        width: (r - 3) * 2,
        height: (r - 3) * 2,
        'clip-path': 'url(#' + clipId + ')',
        'class': 'node-icon-img',
        preserveAspectRatio: 'xMidYMid slice'
      }));
    }

    // Border
    if (isChoice) {
      group.appendChild(svg('path', {
        d: octagonPath(cx, cy, r),
        'class': 'node-border-shape'
      }));
    } else {
      group.appendChild(svg('rect', {
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        rx: 6,
        ry: 6,
        'class': 'node-border-shape'
      }));
    }

    // Rank badge
    if (node.maxRanks > 1) {
      var bx = cx + r - 2;
      var by = cy + r - 2;
      var currentRank = sel ? sel.rank : 0;

      group.appendChild(svg('rect', {
        x: bx - 11,
        y: by - 7,
        width: 22,
        height: 14,
        rx: 4,
        ry: 4,
        'class': 'rank-bg'
      }));

      var txt = svg('text', {
        x: bx,
        y: by,
        'class': 'rank-text'
      });
      txt.textContent = currentRank + '/' + node.maxRanks;
      group.appendChild(txt);
    }

    return group;
  }

  // ---- Main render ----
  function render(svgElement, nodes, selections) {
    svgElement.innerHTML = '';

    if (!nodes || nodes.length === 0) {
      var emptyText = svg('text', {
        x: 150, y: 50,
        fill: '#4a4a6a',
        'font-size': 13,
        'text-anchor': 'middle',
        'font-family': 'system-ui, sans-serif'
      });
      emptyText.textContent = 'No talent data';
      svgElement.appendChild(emptyText);
      svgElement.setAttribute('viewBox', '0 0 300 100');
      return;
    }

    var layout = layoutNodes(nodes);
    var placed = layout.placed;
    var w = layout.width;
    var h = layout.height;

    svgElement.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    // Build position lookup
    var posMap = {};
    for (var i = 0; i < placed.length; i++) {
      posMap[placed[i].node.id] = placed[i];
    }

    // Connections
    var connGroup = svg('g', { 'class': 'connections-layer' });
    for (var c = 0; c < placed.length; c++) {
      var p = placed[c];
      var nextIds = p.node.next || [];
      for (var n = 0; n < nextIds.length; n++) {
        var target = posMap[nextIds[n]];
        if (target) {
          var bothActive = !!selections[p.node.id] && !!selections[target.node.id];
          connGroup.appendChild(renderConnection(
            p.x, p.y, target.x, target.y, bothActive
          ));
        }
      }
    }
    svgElement.appendChild(connGroup);

    // Nodes
    var nodeGroup = svg('g', { 'class': 'nodes-layer' });
    for (var d = 0; d < placed.length; d++) {
      nodeGroup.appendChild(renderNode(placed[d], selections));
    }
    svgElement.appendChild(nodeGroup);
  }

  return {
    render: render
  };

})();
