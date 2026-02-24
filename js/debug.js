/**
 * Debug tool — выводит результат декодирования в консоль и на страницу
 */

var TalentDebug = (function () {

  function run(exportString, talentData) {
    console.log('====== DEBUG DECODE ======');
    console.log('Input string:', exportString);
    console.log('String length:', exportString.length);

    // 1. Decode bytes
    var bytes = TalentDecoder.decodeBase64(exportString);
    console.log('Decoded bytes (' + bytes.length + '):', Array.from(bytes).map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join(' '));

    // 2. Parse header
    var reader = new TalentDecoder.BitReader(bytes);
    var header = TalentDecoder.parseHeader(reader);
    console.log('Header:', {
      version: header.version,
      specId: header.specId,
      treeHash: header.treeHash.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('')
    });
    console.log('Bits read after header:', reader.pos);
    console.log('Bits remaining:', reader.remaining());

    // 3. Find spec
    var treeData = null;
    for (var i = 0; i < talentData.length; i++) {
      if (talentData[i].specId === header.specId) {
        treeData = talentData[i];
        break;
      }
    }

    if (!treeData) {
      console.error('NO SPEC FOUND for specId:', header.specId);
      console.log('Available specs:');
      for (var j = 0; j < talentData.length; j++) {
        console.log('  ', talentData[j].className, talentData[j].specName, '- specId:', talentData[j].specId);
      }
      return;
    }

    console.log('Found spec:', treeData.className, treeData.specName);
    console.log('Class nodes count:', (treeData.classNodes || []).length);
    console.log('Spec nodes count:', (treeData.specNodes || []).length);
    console.log('Hero nodes count:', (treeData.heroNodes || []).length);
    console.log('Hero trees:', (treeData.heroTrees || []).length);

    if (treeData.heroTrees) {
      for (var h = 0; h < treeData.heroTrees.length; h++) {
        var ht = treeData.heroTrees[h];
        console.log('  Hero tree ' + h + ':', ht.name, '- nodes:', (ht.nodeIds || []).length);
      }
    }

    // 4. Sort nodes same way as decoder
    var classNodes = sortNodes(treeData.classNodes || []);
    var specNodes = sortNodes(treeData.specNodes || []);
    var heroNodes = sortNodes(treeData.heroNodes || []);

    console.log('\n====== CLASS NODES (sorted) ======');
    dumpNodes(classNodes);

    console.log('\n====== SPEC NODES (sorted) ======');
    dumpNodes(specNodes);

    console.log('\n====== HERO NODES (sorted) ======');
    dumpNodes(heroNodes);

    // 5. Read bits manually for first few class nodes
    console.log('\n====== BIT-BY-BIT CLASS TREE READ ======');
    console.log('Starting at bit position:', reader.pos);

    var classSelections = [];
    for (var cn = 0; cn < classNodes.length; cn++) {
      var node = classNodes[cn];
      if (reader.remaining() < 1) {
        console.log('  [' + cn + '] NO BITS LEFT');
        break;
      }

      var bitPos = reader.pos;
      var isSelected = reader.readBits(1);
      var info = {
        index: cn,
        nodeId: node.id,
        name: node.name,
        type: node.type,
        maxRanks: node.maxRanks,
        entryNode: node.entryNode || false,
        freeNode: node.freeNode || false,
        posX: node.posX,
        posY: node.posY,
        bitPos: bitPos,
        selected: isSelected === 1,
        rank: 0,
        choiceIndex: 0
      };

      if (isSelected) {
        if (node.type === 'choice' && node.entries && node.entries.length > 1) {
          if (reader.remaining() >= 1) {
            info.choiceIndex = reader.readBits(1);
          }
        }
        if (node.maxRanks > 1) {
          var bits = Math.ceil(Math.log2(node.maxRanks));
          if (bits > 0 && reader.remaining() >= bits) {
            info.rank = reader.readBits(bits) + 1;
          } else {
            info.rank = 1;
          }
        } else {
          info.rank = 1;
        }

        classSelections.push(info);
      }

      console.log(
        '  [' + cn + '] bit:' + bitPos +
        (isSelected ? ' ✅' : ' ⬜') +
        ' "' + node.name + '"' +
        ' (id:' + node.id + ')' +
        ' type:' + node.type +
        ' maxRank:' + node.maxRanks +
        (node.entryNode ? ' ENTRY' : '') +
        (node.freeNode ? ' FREE' : '') +
        (isSelected && info.rank > 1 ? ' rank:' + info.rank : '') +
        (isSelected && info.choiceIndex > 0 ? ' choice:' + info.choiceIndex : '')
      );
    }

    console.log('\nClass selections:', classSelections.length);
    console.log('Bit position after class tree:', reader.pos);
    console.log('Bits remaining:', reader.remaining());

    // 6. Spec tree
    console.log('\n====== BIT-BY-BIT SPEC TREE READ ======');
    console.log('Starting at bit position:', reader.pos);

    var specSelections = [];
    for (var sn = 0; sn < specNodes.length; sn++) {
      var snode = specNodes[sn];
      if (reader.remaining() < 1) {
        console.log('  [' + sn + '] NO BITS LEFT');
        break;
      }

      var sBitPos = reader.pos;
      var sIsSelected = reader.readBits(1);
      var sInfo = {
        index: sn,
        nodeId: snode.id,
        name: snode.name,
        type: snode.type,
        maxRanks: snode.maxRanks,
        bitPos: sBitPos,
        selected: sIsSelected === 1,
        rank: 0,
        choiceIndex: 0
      };

      if (sIsSelected) {
        if (snode.type === 'choice' && snode.entries && snode.entries.length > 1) {
          if (reader.remaining() >= 1) {
            sInfo.choiceIndex = reader.readBits(1);
          }
        }
        if (snode.maxRanks > 1) {
          var sBits = Math.ceil(Math.log2(snode.maxRanks));
          if (sBits > 0 && reader.remaining() >= sBits) {
            sInfo.rank = reader.readBits(sBits) + 1;
          } else {
            sInfo.rank = 1;
          }
        } else {
          sInfo.rank = 1;
        }

        specSelections.push(sInfo);
      }

      console.log(
        '  [' + sn + '] bit:' + sBitPos +
        (sIsSelected ? ' ✅' : ' ⬜') +
        ' "' + snode.name + '"' +
        ' (id:' + snode.id + ')' +
        ' type:' + snode.type +
        ' maxRank:' + snode.maxRanks +
        (sIsSelected && sInfo.rank > 1 ? ' rank:' + sInfo.rank : '') +
        (sIsSelected && sInfo.choiceIndex > 0 ? ' choice:' + sInfo.choiceIndex : '')
      );
    }

    console.log('\nSpec selections:', specSelections.length);
    console.log('Bit position after spec tree:', reader.pos);
    console.log('Bits remaining:', reader.remaining());

    // 7. Hero tree
    console.log('\n====== HERO TREE BITS ======');
    console.log('Starting at bit position:', reader.pos);
    console.log('Bits remaining:', reader.remaining());

    if (reader.remaining() > 0) {
      // Peek next 32 bits
      var peekPos = reader.pos;
      var peekBits = [];
      for (var pb = 0; pb < Math.min(64, reader.remaining()); pb++) {
        peekBits.push(reader.readBits(1));
      }
      reader.pos = peekPos; // Reset
      console.log('Next 64 bits:', peekBits.join(''));
    }

    // Summary
    console.log('\n====== SUMMARY ======');
    console.log('Class talents selected:', classSelections.length);
    console.log('Spec talents selected:', specSelections.length);
    console.log('Total bits consumed:', reader.pos, '/', bytes.length * 8);

    // Output to page
    outputToPage(header, treeData, classSelections, specSelections);
  }

  function sortNodes(nodes) {
    return nodes.slice().sort(function (a, b) {
      if (a.posY !== b.posY) return a.posY - b.posY;
      return a.posX - b.posX;
    });
  }

  function dumpNodes(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var entries = (n.entries || []).map(function(e) { return e.name; }).join(' / ');
      console.log(
        '  [' + i + '] id:' + n.id +
        ' "' + n.name + '"' +
        ' pos:(' + n.posX + ',' + n.posY + ')' +
        ' type:' + n.type +
        ' maxRank:' + n.maxRanks +
        (n.entryNode ? ' ENTRY' : '') +
        (n.freeNode ? ' FREE' : '') +
        ' entries:[' + entries + ']'
      );
    }
  }

  function outputToPage(header, treeData, classSelections, specSelections) {
    var div = document.createElement('div');
    div.style.cssText = 'background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:16px;font-family:monospace;font-size:12px;color:#aaa;max-height:400px;overflow:auto;white-space:pre;';

    var text = '=== DECODE DEBUG ===\n';
    text += 'Version: ' + header.version + '\n';
    text += 'SpecId: ' + header.specId + '\n';
    text += 'Class: ' + treeData.className + '\n';
    text += 'Spec: ' + treeData.specName + '\n\n';

    text += '=== CLASS TALENTS SELECTED (' + classSelections.length + ') ===\n';
    for (var i = 0; i < classSelections.length; i++) {
      var s = classSelections[i];
      text += '  ✅ ' + s.name;
      if (s.rank > 1) text += ' (rank ' + s.rank + ')';
      text += '\n';
    }

    text += '\n=== SPEC TALENTS SELECTED (' + specSelections.length + ') ===\n';
    for (var j = 0; j < specSelections.length; j++) {
      var sp = specSelections[j];
      text += '  ✅ ' + sp.name;
      if (sp.rank > 1) text += ' (rank ' + sp.rank + ')';
      text += '\n';
    }

    div.textContent = text;
    document.getElementById('app').appendChild(div);
  }

  return {
    run: run
  };

})();
