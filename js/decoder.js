/**
 * WoW Talent Loadout String Decoder
 * Format: Custom Base64 → byte stream → bitstream → talent selections
 */

var TalentDecoder = (function () {

  // WoW's base64 alphabet
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
  function bitsForValue(maxVal) {
    if (maxVal <= 1) return 0;
    return Math.ceil(Math.log2(maxVal));
  }

  // ---- Decode base64 string to bytes ----
  function decodeBase64(str) {
    str = str.trim();
    var bytes = [];

    for (var i = 0; i < str.length; i += 4) {
      var vals = [];
      for (var j = i; j < Math.min(i + 4, str.length); j++) {
        var idx = ALPHABET.indexOf(str[j]);
        if (idx === -1) {
          throw new Error('Invalid character: "' + str[j] + '" at position ' + j);
        }
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

    // 128-bit tree hash
    var hash = [];
    for (var i = 0; i < 16; i++) {
      hash.push(reader.readBits(8));
    }

    return {
      version: version,
      specId: specId,
      treeHash: hash
    };
  }

  // ---- Sort nodes like WoW does ----
  function sortNodes(nodes) {
    return nodes.slice().sort(function (a, b) {
      if (a.posY !== b.posY) return a.posY - b.posY;
      return a.posX - b.posX;
    });
  }

  // ---- Read tree selections from bitstream ----
  function readTreeSelections(reader, nodes) {
    var selections = {};
    var totalPoints = 0;

    for (var i = 0; i < nodes.length; i++) {
      if (reader.remaining() < 1) break;

      var node = nodes[i];
      var isSelected = reader.readBits(1);

      if (isSelected) {
        var selection = {
          nodeId: node.id,
          rank: 1,
          choiceIndex: 0
        };

        // Choice node: read which entry was picked
        if (node.type === 'choice' && node.entries && node.entries.length > 1) {
          if (reader.remaining() >= 1) {
            selection.choiceIndex = reader.readBits(1);
          }
        }

        // Multi-rank node: read how many ranks were invested
        if (node.maxRanks > 1) {
          var bits = bitsForValue(node.maxRanks);
          if (bits > 0 && reader.remaining() >= bits) {
            selection.rank = reader.readBits(bits) + 1;
          }
        }

        // Free nodes (entry nodes / granted) are selected but don't cost a point
        if (!node.freeNode && !node.entryNode) {
          totalPoints += selection.rank;
        }

        selections[node.id] = selection;
      }
    }

    return {
      selections: selections,
      totalPoints: totalPoints
    };
  }

  // ---- Main decode function ----
  function decode(exportString, talentData) {
    if (!exportString || exportString.trim().length === 0) {
      throw new Error('Empty talent string');
    }

    var bytes = decodeBase64(exportString);
    var reader = new BitReader(bytes);

    // 1. Parse header
    var header = parseHeader(reader);
    console.log('Header:', {
      version: header.version,
      specId: header.specId
    });

    // 2. Find matching spec in talent data
    var treeData = null;
    for (var i = 0; i < talentData.length; i++) {
      if (talentData[i].specId === header.specId) {
        treeData = talentData[i];
        break;
      }
    }

    if (!treeData) {
      throw new Error('No talent data found for specId ' + header.specId +
        '. Available specs: ' + talentData.map(function (t) {
          return t.specName + ' (' + t.specId + ')';
        }).join(', '));
    }

    // 3. Sort nodes in the order WoW expects
    var classNodes = sortNodes(treeData.classNodes || []);
    var specNodes = sortNodes(treeData.specNodes || []);
    var heroNodes = sortNodes(treeData.heroNodes || []);

    // 4. Read class tree
    var classResult = readTreeSelections(reader, classNodes);

    // 5. Read spec tree
    var specResult = readTreeSelections(reader, specNodes);

    // 6. Read hero tree
    var heroResult = { selections: {}, totalPoints: 0 };
    var selectedHeroTree = null;

    if (heroNodes.length > 0 && reader.remaining() > 0) {
      // Check if there are multiple hero trees (sub-trees)
      var heroTrees = treeData.heroTrees || [];

      if (heroTrees.length > 1) {
        // Read which hero tree is selected
        var heroTreeBits = bitsForValue(heroTrees.length);
        if (heroTreeBits === 0) heroTreeBits = 1;
        var heroTreeIndex = 0;

        if (reader.remaining() >= heroTreeBits) {
          heroTreeIndex = reader.readBits(heroTreeBits);
        }

        if (heroTreeIndex < heroTrees.length) {
          selectedHeroTree = heroTrees[heroTreeIndex];
        }

        // Filter hero nodes to only the selected sub-tree
        if (selectedHeroTree && selectedHeroTree.nodeIds) {
          var nodeIdSet = {};
          for (var h = 0; h < selectedHeroTree.nodeIds.length; h++) {
            nodeIdSet[selectedHeroTree.nodeIds[h]] = true;
          }
          var filteredHeroNodes = [];
          for (var h2 = 0; h2 < heroNodes.length; h2++) {
            if (nodeIdSet[heroNodes[h2].id]) {
              filteredHeroNodes.push(heroNodes[h2]);
            }
          }
          heroResult = readTreeSelections(reader, filteredHeroNodes);
        } else {
          heroResult = readTreeSelections(reader, heroNodes);
        }
      } else {
        // Single hero tree or no sub-tree distinction
        if (heroTrees.length === 1) {
          selectedHeroTree = heroTrees[0];
        }
        heroResult = readTreeSelections(reader, heroNodes);
      }
    }

    // 7. Build result
    var result = {
      header: header,
      treeData: treeData,
      heroTreeData: selectedHeroTree,

      classNodes: classNodes,
      specNodes: specNodes,
      heroNodes: heroNodes,

      classSelections: classResult.selections,
      specSelections: specResult.selections,
      heroSelections: heroResult.selections,

      classPoints: classResult.totalPoints,
      specPoints: specResult.totalPoints,
      heroPoints: heroResult.totalPoints,
      totalPoints: classResult.totalPoints + specResult.totalPoints + heroResult.totalPoints,

      bitsRead: reader.pos,
      bitsTotal: bytes.length * 8,
      bitsRemaining: reader.remaining()
    };

    console.log('Decode result:', {
      class: treeData.className,
      spec: treeData.specName,
      heroTree: selectedHeroTree ? selectedHeroTree.name : 'none',
      classSelections: Object.keys(classResult.selections).length,
      specSelections: Object.keys(specResult.selections).length,
      heroSelections: Object.keys(heroResult.selections).length,
      totalPoints: result.totalPoints,
      bitsRead: result.bitsRead,
      bitsRemaining: result.bitsRemaining
    });

    return result;
  }

  // Public API
  return {
    decode: decode,
    decodeBase64: decodeBase64,
    BitReader: BitReader,
    parseHeader: parseHeader
  };

})();
