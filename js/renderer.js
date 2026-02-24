/**
 * Tree Renderer — draws talent trees into SVG
 * Icons loaded from Wowhead CDN
 * Tooltips via Wowhead with /ru/ locale
 */

var TreeRenderer = (function () {

  var ICON_SIZE = 40;
  var NODE_GAP_X = 60;
  var NODE_GAP_Y = 64;
  var PADDING_X = 36;
  var PADDING_TOP = 24;
  var PADDING_BOTTOM = 36;
  var RANK_OFFSET_Y = 22;
  var CHOICE_SIZE = 42;

  var WOWHEAD_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium/';
  var WOWHEAD_TOOLTIP_BASE = 'https://www.wowhead.com/ru/spell=';

  function getIconUrl(iconName) {
    if (!iconName) return '';
    return WOWHEAD_ICON_BASE + iconName.toLowerCase() + '.jpg';
  }

  function getTooltipUrl(spellId) {
    if (!spellId) return '#';
    return WOWHEAD_TOOLTIP_BASE + spellId;
  }

  /**
   * Normalize node positions to grid coordinates
   */
  function normalizePositions(nodes) {
    if (!nodes || nodes.length === 0) return [];

    // Collect unique X and Y values
    var xVals = [], yVals = [];
    var xSet = {}, ySet = {};
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!xSet[n.posX]) { xSet[n.posX] = true; xVals.push(n.posX); }
      if (!ySet[n.posY]) { ySet[n.posY] = true; yVals.push(n.posY); }
    }
    xVals.sort(function (a, b) { return a - b; });
    yVals.sort(function (a, b) { return a - b; });

    // Map to grid indices
    var xMap = {}, yMap = {};
    for (var xi = 0; xi < xVals.length; xi++) xMap[xVals[xi]] = xi;
    for (var yi = 0; yi < yVals.length; yi++) yMap[yVals[yi]] = yi;

    var result = [];
    for (var j = 0; j < nodes.length; j++) {
      var nd = nodes[j];
      result.push({
        node: nd,
        col: xMap[nd.posX],
        row: yMap[nd.posY]
      });
    }
    return {
      items: result,
      cols: xVals.length,
      rows: yVals.length
    };
  }

  /**
   * Create SVG element helper
   */
  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) {
          el.setAttribute(k, attrs[k]);
        }
      }
    }
    return el;
  }

  /**
   * Build adjacency for connection lines
   */
  function buildConnections(nodes) {
    var conns = [];
    var idMap = {};
    for (var i = 0; i < nodes.length; i++) {
      idMap[nodes[i].id] = nodes[i];
    }
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      var nexts = n.next || [];
      for (var k = 0; k < nexts.length; k++) {
        if (idMap[nexts[k]]) {
          conns.push({ from: n.id, to: nexts[k] });
        }
      }
    }
    return conns;
  }

  /**
   * Render a talent tree into an SVG element
   */
  function render(svgElement, nodes, selections) {
    if (!svgElement) return;
    while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);

    if (!nodes || nodes.length === 0) return;

    var norm = normalizePositions(nodes);
    var items = norm.items;
    var cols = norm.cols;
    var rows = norm.rows;

    var svgWidth = cols * NODE_GAP_X + PADDING_X * 2;
    var svgHeight = rows * NODE_GAP_Y + PADDING_TOP + PADDING_BOTTOM;

    svgElement.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    svgElement.setAttribute('width', '100%');

    // Defs for clipping
    var defs = svgEl('defs');
    svgElement.appendChild(defs);

    // Position lookup
    var posMap = {};
    for (var p = 0; p < items.length; p++) {
      var it = items[p];
      var cx = PADDING_X + it.col * NODE_GAP_X + NODE_GAP_X / 2;
      var cy = PADDING_TOP + it.row * NODE_GAP_Y + NODE_GAP_Y / 2;
      posMap[it.node.id] = { cx: cx, cy: cy, item: it };
    }

    // Draw connections
    var conns = buildConnections(nodes);
    for (var ci = 0; ci < conns.length; ci++) {
      var c = conns[ci];
      var fromPos = posMap[c.from];
      var toPos = posMap[c.to];
      if (!fromPos || !toPos) continue;

      var fromSel = !!(selections && selections[c.from]);
      var toSel = !!(selections && selections[c.to]);
      var active = fromSel && toSel;

      var line = svgEl('line', {
        x1: fromPos.cx,
        y1: fromPos.cy,
        x2: toPos.cx,
        y2: toPos.cy,
        'class': 'connection-line' + (active ? ' active' : '')
      });
      svgElement.appendChild(line);
    }

    // Draw nodes
    for (var ni = 0; ni < items.length; ni++) {
      var item = items[ni];
      var node = item.node;
      var pos = posMap[node.id];
      var sel = selections ? selections[node.id] : null;
      var isSelected = !!sel;
      var isFree = node.freeNode && isSelected;

      // Determine entry and spell info
      var entryIdx = (sel && sel.choiceIndex) || 0;
      var entry = (node.entries && node.entries[entryIdx]) || (node.entries && node.entries[0]);
      var iconName = entry ? entry.icon : '';
      var spellId = entry ? (entry.visibleSpellId || entry.spellId) : 0;
      var rank = sel ? sel.rank : 0;
      var maxRanks = node.maxRanks || 1;

      // Node type
      var isChoice = node.type === 'choice';
      var isSingle = node.type === 'single';

      // Group
      var g = svgEl('g', {
        'class': 'talent-node' + (isSelected ? '' : ' unselected'),
        'data-node-id': node.id
      });

      // Clip path
      var clipId = 'clip-' + node.id;
      var clip = svgEl('clipPath', { id: clipId });
      defs.appendChild(clip);

      var halfIcon = ICON_SIZE / 2;
      var halfChoice = CHOICE_SIZE / 2;

      if (isChoice) {
        // Diamond clip
        var diamond = svgEl('polygon', {
          points: [
            pos.cx + ',' + (pos.cy - halfChoice),
            (pos.cx + halfChoice) + ',' + pos.cy,
            pos.cx + ',' + (pos.cy + halfChoice),
            (pos.cx - halfChoice) + ',' + pos.cy
          ].join(' ')
        });
        clip.appendChild(diamond);
      } else if (isSingle && maxRanks === 1) {
        // Circle clip
        var circle = svgEl('circle', {
          cx: pos.cx,
          cy: pos.cy,
          r: halfIcon
        });
        clip.appendChild(circle);
      } else {
        // Square clip (with rounded corners simulated by rect)
        var rect = svgEl('rect', {
          x: pos.cx - halfIcon,
          y: pos.cy - halfIcon,
          width: ICON_SIZE,
          height: ICON_SIZE,
          rx: 4,
          ry: 4
        });
        clip.appendChild(rect);
      }

      // Icon image
      if (iconName) {
        var img = svgEl('image', {
          href: getIconUrl(iconName),
          x: isChoice ? pos.cx - halfChoice : pos.cx - halfIcon,
          y: isChoice ? pos.cy - halfChoice : pos.cy - halfIcon,
          width: isChoice ? CHOICE_SIZE : ICON_SIZE,
          height: isChoice ? CHOICE_SIZE : ICON_SIZE,
          'clip-path': 'url(#' + clipId + ')',
          'class': 'node-icon'
        });
        g.appendChild(img);
      }

      // Border
      if (isChoice) {
        var borderState = isSelected ? 'selected' : 'unselected';
        var borderDiamond = svgEl('polygon', {
          points: [
            pos.cx + ',' + (pos.cy - halfChoice),
            (pos.cx + halfChoice) + ',' + pos.cy,
            pos.cx + ',' + (pos.cy + halfChoice),
            (pos.cx - halfChoice) + ',' + pos.cy
          ].join(' '),
          'class': 'node-border-choice ' + borderState
        });
        g.appendChild(borderDiamond);
      } else if (isSingle && maxRanks === 1) {
        var circBorderState = isFree ? 'free' : (isSelected ? 'selected' : 'unselected');
        var borderCircle = svgEl('circle', {
          cx: pos.cx,
          cy: pos.cy,
          r: halfIcon,
          'class': 'node-border-circle ' + circBorderState
        });
        g.appendChild(borderCircle);
      } else {
        var sqBorderState = isFree ? 'free' : (isSelected ? 'selected' : 'unselected');
        var borderRect = svgEl('rect', {
          x: pos.cx - halfIcon,
          y: pos.cy - halfIcon,
          width: ICON_SIZE,
          height: ICON_SIZE,
          rx: 4,
          ry: 4,
          'class': 'node-border-square ' + sqBorderState
        });
        g.appendChild(borderRect);
      }

      // Rank text
      if (isSelected && maxRanks >= 1) {
        var rankStr = rank + '/' + maxRanks;
        var textY = pos.cy + halfIcon + RANK_OFFSET_Y - 6;

        // Background rect for rank
        var rankBg = svgEl('rect', {
          x: pos.cx - 16,
          y: textY - 10,
          width: 32,
          height: 14,
          'class': 'rank-bg'
        });
        g.appendChild(rankBg);

        var rankText = svgEl('text', {
          x: pos.cx,
          y: textY,
          'class': 'rank-text'
        });
        rankText.textContent = rankStr;
        g.appendChild(rankText);
      }

      // Tooltip link — wrap group in <a> with Wowhead /ru/ URL
      // Prevent click navigation, show tooltip only
      if (spellId) {
        var link = svgEl('a');
        link.setAttributeNS('http://www.w3.org/1999/xlink', 'href', getTooltipUrl(spellId));
        link.setAttribute('target', '_blank');
        link.setAttribute('data-wowhead', 'spell=' + spellId);
        link.setAttribute('class', 'talent-link');

        // Prevent click navigation
        link.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
        });

        link.appendChild(g);
        svgElement.appendChild(link);
      } else {
        svgElement.appendChild(g);
      }
    }
  }

  return {
    render: render
  };

})();
