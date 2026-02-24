/**
 * Tree Renderer — draws talent trees into SVG
 * Icons from Wowhead CDN
 * Choice nodes rendered as octagon
 */

var TreeRenderer = (function () {

  var ICON_SIZE = 32;
  var NODE_GAP_X = 48;
  var NODE_GAP_Y = 52;
  var PADDING_X = 24;
  var PADDING_TOP = 16;
  var PADDING_BOTTOM = 28;
  var RANK_OFFSET_Y = 18;
  var OCTAGON_SIZE = 19;

  var WOWHEAD_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium/';

  function getIconUrl(iconName) {
    if (!iconName) return '';
    return WOWHEAD_ICON_BASE + iconName.toLowerCase() + '.jpg';
  }

  function octagonPoints(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var angle = (Math.PI * 2 * i / 8) - Math.PI / 8;
      pts.push(
        (cx + r * Math.cos(angle)).toFixed(2) + ',' +
        (cy + r * Math.sin(angle)).toFixed(2)
      );
    }
    return pts.join(' ');
  }

  function normalizePositions(nodes) {
    if (!nodes || nodes.length === 0) return { items: [], cols: 0, rows: 0 };

    var xVals = [], yVals = [];
    var xSet = {}, ySet = {};
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!xSet[n.posX]) { xSet[n.posX] = true; xVals.push(n.posX); }
      if (!ySet[n.posY]) { ySet[n.posY] = true; yVals.push(n.posY); }
    }
    xVals.sort(function (a, b) { return a - b; });
    yVals.sort(function (a, b) { return a - b; });

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

  function buildConnections(nodes) {
    var conns = [];
    var idMap = {};
    for (var i = 0; i < nodes.length; i++) {
      idMap[nodes[i].id] = true;
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

    var defs = svgEl('defs');
    svgElement.appendChild(defs);

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

      var entryIdx = (sel && sel.choiceIndex) || 0;
      var entry = (node.entries && node.entries[entryIdx]) || (node.entries && node.entries[0]);
      var iconName = entry ? entry.icon : '';
      var spellId = entry ? (entry.visibleSpellId || entry.spellId) : 0;
      var rank = sel ? sel.rank : 0;
      var maxRanks = node.maxRanks || 1;

      var isChoice = node.type === 'choice';
      var isSingle = node.type === 'single';

      var g = svgEl('g', {
        'class': 'talent-node' + (isSelected ? '' : ' unselected'),
        'data-node-id': node.id
      });

      var clipId = 'clip-' + node.id;
      var clip = svgEl('clipPath', { id: clipId });
      defs.appendChild(clip);

      var halfIcon = ICON_SIZE / 2;

      if (isChoice) {
        var octClip = svgEl('polygon', {
          points: octagonPoints(pos.cx, pos.cy, OCTAGON_SIZE)
        });
        clip.appendChild(octClip);
      } else if (isSingle && maxRanks === 1) {
        var circleClip = svgEl('circle', {
          cx: pos.cx,
          cy: pos.cy,
          r: halfIcon
        });
        clip.appendChild(circleClip);
      } else {
        var rectClip = svgEl('rect', {
          x: pos.cx - halfIcon,
          y: pos.cy - halfIcon,
          width: ICON_SIZE,
          height: ICON_SIZE,
          rx: 3,
          ry: 3
        });
        clip.appendChild(rectClip);
      }

      // Icon image
      if (iconName) {
        var imgSize = isChoice ? OCTAGON_SIZE * 2 : ICON_SIZE;
        var imgOffset = imgSize / 2;
        var img = svgEl('image', {
          href: getIconUrl(iconName),
          x: pos.cx - imgOffset,
          y: pos.cy - imgOffset,
          width: imgSize,
          height: imgSize,
          'clip-path': 'url(#' + clipId + ')',
          'class': 'node-icon'
        });
        g.appendChild(img);
      }

      // Border
      if (isChoice) {
        var octState = isSelected ? 'selected' : 'unselected';
        var borderOct = svgEl('polygon', {
          points: octagonPoints(pos.cx, pos.cy, OCTAGON_SIZE),
          'class': 'node-border-octagon ' + octState
        });
        g.appendChild(borderOct);
      } else if (isSingle && maxRanks === 1) {
        var circState = isFree ? 'free' : (isSelected ? 'selected' : 'unselected');
        var borderCirc = svgEl('circle', {
          cx: pos.cx,
          cy: pos.cy,
          r: halfIcon,
          'class': 'node-border-circle ' + circState
        });
        g.appendChild(borderCirc);
      } else {
        var sqState = isFree ? 'free' : (isSelected ? 'selected' : 'unselected');
        var borderSq = svgEl('rect', {
          x: pos.cx - halfIcon,
          y: pos.cy - halfIcon,
          width: ICON_SIZE,
          height: ICON_SIZE,
          rx: 3,
          ry: 3,
          'class': 'node-border-square ' + sqState
        });
        g.appendChild(borderSq);
      }

      // Rank text
      if (isSelected && maxRanks >= 1) {
        var rankStr = rank + '/' + maxRanks;
        var textY = pos.cy + halfIcon + RANK_OFFSET_Y - 6;

        var rankBg = svgEl('rect', {
          x: pos.cx - 14,
          y: textY - 9,
          width: 28,
          height: 12,
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

      // Tooltip link
      if (spellId) {
        var link = svgEl('a', {
          'data-spell-id': spellId,
          'class': 'talent-link',
          'href': 'javascript:void(0)'
        });

        link.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          return false;
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
