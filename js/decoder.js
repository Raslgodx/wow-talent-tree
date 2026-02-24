/**
 * WoW Talent Loadout String Decoder (The War Within / 11.x)
 * 
 * Reverse-engineered format:
 *   - Custom base64 → bytes
 *   - Header: 8-bit version, 16-bit specId, 128-bit treeHash
 *   - Class tree: for each node (sorted posY,posX):
 *       1 bit: isNodeSelected
 *       1 bit: isNodePartiallyRanked  
 *       if selected and choice: ceil(log2(entryCount)) bits for choiceIndex
 *       if selected and partiallyRanked and maxRanks>1: ceil(log2(maxRanks)) bits for currentRank
 *   - Spec tree: same format
 *   - Hero tree: 
 *       ceil(log2(subTreeCount)) bits for subTreeId selection
 *       then same format for hero nodes of that subtree
 */

var TalentDecoder = (function () {

  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  // ---- BitReader ----
  function BitReader(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  BitReader.prototype.readBits = function (count) {
    var result = 0;
    for (var i = 0; i < count; i++) {
      var byteIdx = Math.floor(this.pos / 8);
      var bitIdx = this.pos % 8;
      if (byteIdx < this.bytes.length) {
        var bit = (this.bytes[byteIdx] >> bitIdx) & 1;
        result |= (bit << i);
      }
      this.pos++;
    }
    return result;
  };

  BitReader.prototype.remaining = function () {
    return (this.bytes.length * 8) - this.pos;
  };

  // ---- Helpers ----
  function bitsNeeded(maxVal) {
    if (maxVal <= 1) return 1;
    return Math.ceil(Math.log2(maxVal + 1));
  }

  function sortNodes(nodes) {
    return nodes.slice().sort(function (a, b) {
      if (a.posY !== b.posY) return a.posY - b.posY;
      return a.posX - b.posX;
    });
  }

  // ---- Decode base64 ----
  function decodeBase64(str) {
    str = str.trim();
    var bytes = [];
    for (var i = 0; i < str.length; i += 4) {
      var vals = [];
      for (var j = i; j < Math.min(i + 4, str.length); j++) {
        var idx = ALPHABET.indexOf(str[j]);
        if (idx === -1) throw new Error('Invalid character: "' + str[j] + '"');
        vals.push(idx);
      }
      if (vals.length >= 2) bytes.push(((vals[0]) | (vals[1] << 6)) & 0xFF);
      if (vals.length >= 3) bytes.push(((vals[1] >> 2) | (vals[2] << 4)) & 0xFF);
      if (vals.length >= 4) bytes.push(((vals[2] >> 4) | (vals[3] << 2)) & 0xFF);
    }
    return new Uint8Array(bytes);
  }

  // ---- Parse header ----
  function parseHeader(reader) {
    var version = reader.readBits(8);
    var specId = reader.readBits(16);
    var hash = [];
    for (var i = 0; i < 16; i++) {
      hash.push(reader.readBits(8));
    }
    return { version: version, specId: specId, treeHash: hash };
  }

  // ---- Read selections for a list of nodes ----
  function readTreeNodes(reader, nodes) {
    var selections = {};
    var points = 0;

    for (var i = 0; i < nodes.length; i++) {
      if (reader.remaining() < 2) break;

      var node = nodes[i];
      var isSelected = reader.readBits(1);
      var isPartial = reader.readBits(1);

      if (!isSelected) continue;

      var sel = {
        nodeId: node.id,
        rank: node.maxRanks,
        choiceIndex: 0
      };

      // Choice node: which entry?
      if (node.type === 'choice' && node.entries && node.entries.length > 1) {
        var choiceBits = bitsNeeded(node.entries.length - 1);
        if (reader.remaining() >= choiceBits) {
          sel.choiceIndex = reader.readBits(choiceBits);
        }
      }

      // Partial rank: how many ranks?
      if (isPartial && node.maxRanks > 1) {
        var rankBits = bitsNeeded(node.maxRanks - 1);
        if (reader.remaining() >= rankBits) {
          sel.rank = reader.readBits(rankBits) + 1;
        }
      }

      // Handle tiered nodes (like Shadow of Nathreza with maxRanks:4)
      if (node.type === 'tiered') {
        // Tiered nodes: the rank also selects which entry
        if (node.entries && node.entries.length > 1) {
          // rank determines which tier entry is active
          sel.choiceIndex = Math.min(sel.rank - 1, node.entries.length - 1);
        }
      }

      selections[node.id] = sel;

      if (!node.freeNode && !node.entryNode) {
        points += sel.rank;
      }
    }

    return { selections: selections, points: points };
  }

  // ---- Get unique subTreeIds from hero nodes ----
  function getSubTreeIds(heroNodes) {
    var ids = [];
    var seen = {};
    for (var i = 0; i < heroNodes.length; i++) {
      var stId = heroNodes[i].subTreeId;
      if (stId !== undefined && !seen[stId]) {
        seen[stId] = true;
        ids.push(stId);
      }
    }
    ids.sort(function (a, b) { return a - b; });
    return ids;
  }

  // ---- Main decode ----
  function decode(exportString, talentData) {
    if (!exportString || exportString.trim().length === 0) {
      throw new Error('Empty talent string');
    }

    var bytes = decodeBase64(exportString);
    var reader = new BitReader(bytes);

    // 1. Header
    var header = parseHeader(reader);
    console.log('[Decoder] version:', header.version, 'specId:', header.specId);

    // 2. Find spec
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

    // 3. Sort nodes
    var classNodes = sortNodes(treeData.classNodes || []);
    var specNodes = sortNodes(treeData.specNodes || []);
    var heroNodes = sortNodes(treeData.heroNodes || []);

    console.log('[Decoder] Class:', treeData.className, treeData.specName);
    console.log('[Decoder] Nodes — class:', classNodes.length, 'spec:', specNodes.length, 'hero:', heroNodes.length);

    // 4. Read class tree
    console.log('[Decoder] Reading class tree at bit:', reader.pos);
    var classResult = readTreeNodes(reader, classNodes);
    console.log('[Decoder] Class selections:', Object.keys(classResult.selections).length, 'bits at:', reader.pos);

    // 5. Read spec tree
    console.log('[Decoder] Reading spec tree at bit:', reader.pos);
    var specResult = readTreeNodes(reader, specNodes);
    console.log('[Decoder] Spec selections:', Object.keys(specResult.selections).length, 'bits at:', reader.pos);

    // 6. Read hero tree
    var heroResult = { selections: {}, points: 0 };
    var selectedSubTreeId = null;
    var selectedHeroNodes = heroNodes;
    var heroTreeData = null;

    if (heroNodes.length > 0 && reader.remaining() > 0) {
      // Determine sub-trees from subTreeId field
      var subTreeIds = getSubTreeIds(heroNodes);
      console.log('[Decoder] Hero subTreeIds:', subTreeIds);

      if (subTreeIds.length > 1) {
        // Read which sub-tree is selected
        var stBits = bitsNeeded(subTreeIds.length - 1);
        console.log('[Decoder] Reading hero subtree selection (' + stBits + ' bits) at bit:', reader.pos);
        var stIndex = reader.readBits(stBits);
        selectedSubTreeId = subTreeIds[stIndex] !== undefined ? subTreeIds[stIndex] : subTreeIds[0];
        console.log('[Decoder] Selected hero subTreeId:', selectedSubTreeId, '(index:', stIndex, ')');

        // Filter hero nodes
        selectedHeroNodes = [];
        for (var h = 0; h < heroNodes.length; h++) {
          if (heroNodes[h].subTreeId === selectedSubTreeId) {
            selectedHeroNodes.push(heroNodes[h]);
          }
        }

        heroTreeData = {
          subTreeId: selectedSubTreeId,
          name: getSubTreeName(selectedHeroNodes),
          nodeIds: selectedHeroNodes.map(function (n) { return n.id; })
        };
      } else if (subTreeIds.length === 1) {
        selectedSubTreeId = subTreeIds[0];
        heroTreeData = {
          subTreeId: selectedSubTreeId,
          name: getSubTreeName(heroNodes),
          nodeIds: heroNodes.map(function (n) { return n.id; })
        };
      }

      console.log('[Decoder] Reading hero tree at bit:', reader.pos, 'nodes:', selectedHeroNodes.length);
      heroResult = readTreeNodes(reader, selectedHeroNodes);
      console.log('[Decoder] Hero selections:', Object.keys(heroResult.selections).length, 'bits at:', reader.pos);
    }

    // 7. Summary
    var totalPoints = classResult.points + specResult.points + heroResult.points;
    console.log('[Decoder] Total points:', totalPoints);
    console.log('[Decoder] Bits read:', reader.pos, '/', bytes.length * 8, 'remaining:', reader.remaining());

    return {
      header: header,
      treeData: treeData,
      heroTreeData: heroTreeData,
      classNodes: classNodes,
      specNodes: specNodes,
      heroNodes: heroNodes,
      classSelections: classResult.selections,
      specSelections: specResult.selections,
      heroSelections: heroResult.selections,
      classPoints: classResult.points,
      specPoints: specResult.points,
      heroPoints: heroResult.points,
      totalPoints: totalPoints,
      selectedSubTreeId: selectedSubTreeId
    };
  }

  function getSubTreeName(nodes) {
    // Get name from the entry node of this sub-tree
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].entryNode) {
        return nodes[i].name;
      }
    }
    return nodes.length > 0 ? nodes[0].name : 'Hero';
  }

  // Public API
  return {
    decode: decode,
    decodeBase64: decodeBase64,
    BitReader: BitReader,
    parseHeader: parseHeader
  };

})();
