/**
 * WoW Talent Loadout String Decoder (The War Within / 11.x)
 *
 * Format (from Wowhead TalentCalcDragonflight.js):
 *   - Base64 alphabet: A-Za-z0-9+/  (6 bits per char, LSB first)
 *   - Header: 8-bit version, 16-bit specId, 128-bit treeHash
 *   - For each node in fixed order (from wowhead-node-order.json):
 *       1 bit: isNodeSelected
 *       if version>1 && selected: 1 bit isNodePurchased
 *       if purchased:
 *         1 bit: isPartiallyRanked
 *         if partial: 6 bits partialRanksPurchased
 *         1 bit: isChoiceNode
 *         if choice: 2 bits choiceNodeSelection
 */

var TalentDecoder = (function () {

  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  var nodeOrderData = null;

  // ---- Load node order from Wowhead data ----
  function loadNodeOrder(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/wowhead-node-order.json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          try {
            nodeOrderData = JSON.parse(xhr.responseText);
            callback(null);
          } catch (e) {
            callback('Failed to parse wowhead-node-order.json: ' + e.message);
          }
        } else {
          callback('Failed to load wowhead-node-order.json (HTTP ' + xhr.status + ')');
        }
      }
    };
    xhr.send();
  }

  // ---- Bit reader working directly on base64 values (6-bit) ----
  function BitReader(exportString) {
    this.vals = [];
    for (var i = 0; i < exportString.length; i++) {
      this.vals.push(ALPHABET.indexOf(exportString[i]));
    }
    this.currentIndex = 0;
    this.currentExtractedBits = 0;
    this.currentRemainingValue = this.vals[0] || 0;
  }

  BitReader.prototype.read = function (bitCount) {
    var result = 0;
    var bitsNeeded = bitCount;
    var shift = 0;

    while (bitsNeeded > 0) {
      if (this.currentIndex >= this.vals.length) return result;

      var availableBits = 6 - this.currentExtractedBits;
      var bitsToRead = Math.min(availableBits, bitsNeeded);

      this.currentExtractedBits += bitsToRead;
      var mask = (1 << bitsToRead) - 1;
      var bits = this.currentRemainingValue & mask;
      this.currentRemainingValue >>= bitsToRead;

      result += bits << shift;
      shift += bitsToRead;
      bitsNeeded -= bitsToRead;

      if (bitsToRead >= availableBits) {
        this.currentIndex++;
        this.currentExtractedBits = 0;
        this.currentRemainingValue = this.vals[this.currentIndex] || 0;
      }
    }
    return result;
  };

  BitReader.prototype.hasMore = function () {
    return this.currentIndex < this.vals.length;
  };

  // ---- Parse header ----
  function parseHeader(reader) {
    var version = reader.read(8);
    var specId = reader.read(16);
    var treeHash = [];
    for (var i = 0; i < 16; i++) {
      treeHash.push(reader.read(8));
    }
    return { version: version, specId: specId, treeHash: treeHash };
  }

  // ---- Read all node states ----
  function readAllNodes(reader, version) {
    var nodes = [];
    while (reader.hasMore()) {
      var isSelected = reader.read(1) === 1;
      var isPurchased = isSelected;

      if (version > 1 && isSelected) {
        isPurchased = reader.read(1) === 1;
      }

      var isPartial = false;
      var partialRanks = 0;
      var isChoice = false;
      var choiceIdx = 0;

      if (isPurchased) {
        isPartial = reader.read(1) === 1;
        if (isPartial) {
          partialRanks = reader.read(6);
        }
        isChoice = reader.read(1) === 1;
        if (isChoice) {
          choiceIdx = reader.read(2);
        }
      }

      nodes.push({
        isSelected: isSelected,
        isPurchased: isPurchased,
        isPartial: isPartial,
        partialRanks: partialRanks,
        isChoice: isChoice,
        choiceIdx: choiceIdx
      });
    }
    return nodes;
  }

  // ---- Main decode ----
  function decode(exportString, talentData) {
    if (!exportString || exportString.trim().length === 0) {
      throw new Error('Empty talent string');
    }
    if (!nodeOrderData) {
      throw new Error('Node order data not loaded. Call TalentDecoder.loadNodeOrder() first.');
    }

    exportString = exportString.trim();
    var reader = new BitReader(exportString);

    // 1. Header
    var header = parseHeader(reader);
    console.log('[Decoder] version:', header.version, 'specId:', header.specId);

    // 2. Find spec in talent data
    var treeData = null;
    for (var i = 0; i < talentData.length; i++) {
      if (talentData[i].specId === header.specId) {
        treeData = talentData[i];
        break;
      }
    }
    if (!treeData) {
      throw new Error('No talent data for specId ' + header.specId);
    }

    // 3. Get node order for this class
    var classId = treeData.classId;
    var orderInfo = nodeOrderData[classId];
    if (!orderInfo) {
      throw new Error('No node order data for classId ' + classId);
    }
    var nodeOrder = orderInfo.nodes;
    var heroTreeChoices = orderInfo.heroTreeChoices || {};

    console.log('[Decoder] Class:', treeData.className, 'Spec:', treeData.specName,
      'Nodes in order:', nodeOrder.length);

    // 4. Build lookup: nodeId → talent info
    var nodeLookup = {};
    var allTreeNodes = ['classNodes', 'specNodes', 'heroNodes'];
    for (var t = 0; t < allTreeNodes.length; t++) {
      var arr = treeData[allTreeNodes[t]] || [];
      for (var n = 0; n < arr.length; n++) {
        nodeLookup[arr[n].id] = arr[n];
      }
    }

    // 5. Read all node states from bitstream
    var rawNodes = readAllNodes(reader, header.version);
    console.log('[Decoder] Raw nodes read:', rawNodes.length);

    // 6. Map raw states to node IDs and build selections
    var classSelections = {};
    var specSelections = {};
    var heroSelections = {};
    var classPoints = 0;
    var specPoints = 0;
    var heroPoints = 0;
    var selectedSubTreeId = null;

    // Detect hero tree from heroTreeChoices
    for (var idx = 0; idx < rawNodes.length && idx < nodeOrder.length; idx++) {
      var rn = rawNodes[idx];
      if (!rn.isSelected) continue;

      var nodeId = nodeOrder[idx];
      var info = nodeLookup[nodeId];

      // Check if this is a hero tree choice node
      var htcEntry = heroTreeChoices[nodeId];
      if (htcEntry && rn.isPurchased) {
        selectedSubTreeId = htcEntry[rn.choiceIdx] || htcEntry[0];
        continue; // don't add to selections
      }

      // Determine rank
      var rank;
      if (rn.isPartial) {
        rank = rn.partialRanks;
      } else if (rn.isPurchased) {
        rank = info ? info.maxRanks : 1;
      } else {
        // granted (selected but not purchased)
        rank = info ? info.maxRanks : 1;
      }

      var sel = {
        nodeId: nodeId,
        rank: rank,
        choiceIndex: rn.isChoice ? rn.choiceIdx : 0
      };

      // Determine which tree this node belongs to
      if (!info) {
        // Unknown node — skip
        continue;
      }

      var treeType = info._treeType; // we'll set this below
      if (treeType === 'class') {
        classSelections[nodeId] = sel;
        if (!info.freeNode && rn.isPurchased) classPoints += rank;
      } else if (treeType === 'spec') {
        specSelections[nodeId] = sel;
        if (!info.freeNode && rn.isPurchased) specPoints += rank;
      } else if (treeType === 'hero') {
        heroSelections[nodeId] = sel;
        if (!info.freeNode && rn.isPurchased) heroPoints += rank;
      }
    }

    var totalPoints = classPoints + specPoints + heroPoints;
    console.log('[Decoder] Points — class:', classPoints, 'spec:', specPoints,
      'hero:', heroPoints, 'total:', totalPoints);
    console.log('[Decoder] Selected hero tree:', selectedSubTreeId);

    // Build hero tree data
    var heroTreeData = null;
    if (selectedSubTreeId) {
      var heroTreeNodes = (treeData.heroNodes || []).filter(function (n) {
        return n.subTreeId === selectedSubTreeId;
      });
      heroTreeData = {
        subTreeId: selectedSubTreeId,
        name: getSubTreeName(heroTreeNodes),
        nodeIds: heroTreeNodes.map(function (n) { return n.id; })
      };
    }

    // Sort nodes for rendering (posY, posX)
    var classNodesSorted = sortNodes(treeData.classNodes || []);
    var specNodesSorted = sortNodes(treeData.specNodes || []);
    var heroNodesSorted = sortNodes(treeData.heroNodes || []);

    return {
      header: header,
      treeData: treeData,
      heroTreeData: heroTreeData,
      classNodes: classNodesSorted,
      specNodes: specNodesSorted,
      heroNodes: heroNodesSorted,
      classSelections: classSelections,
      specSelections: specSelections,
      heroSelections: heroSelections,
      classPoints: classPoints,
      specPoints: specPoints,
      heroPoints: heroPoints,
      totalPoints: totalPoints,
      selectedSubTreeId: selectedSubTreeId
    };
  }

  function sortNodes(nodes) {
    return nodes.slice().sort(function (a, b) {
      if (a.posY !== b.posY) return a.posY - b.posY;
      return a.posX - b.posX;
    });
  }

  function getSubTreeName(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].entryNode) return nodes[i].name;
    }
    return nodes.length > 0 ? nodes[0].name : 'Hero';
  }

  // Public API
  return {
    decode: decode,
    loadNodeOrder: loadNodeOrder,
    parseHeader: parseHeader
  };

})();
