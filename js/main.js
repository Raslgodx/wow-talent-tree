/**
 * Main application — URL-driven talent tree viewer
 *
 * URL formats:
 *   ?all=EXPORT_STRING    — show all 3 trees + copy button
 *   ?class=EXPORT_STRING  — show only class tree
 *   ?hero=EXPORT_STRING   — show only hero tree
 *   ?spec=EXPORT_STRING   — show only spec tree
 */

(function () {

  var talentData = null;
  var currentResult = null;
  var currentMode = null;
  var currentString = null;

  // ---- Load talent JSON ----
  function loadTalentData(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/talents.json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          try {
            talentData = JSON.parse(xhr.responseText);
            console.log('Loaded talent data: ' + talentData.length + ' specs');
            callback(null);
          } catch (e) {
            callback('Failed to parse talents.json: ' + e.message);
          }
        } else {
          callback('Failed to load talents.json (HTTP ' + xhr.status + ')');
        }
      }
    };
    xhr.send();
  }

  // ---- Parse URL ----
  function parseUrl() {
    var params = new URLSearchParams(window.location.search);
    var modes = ['all', 'class', 'hero', 'spec'];

    for (var i = 0; i < modes.length; i++) {
      var val = params.get(modes[i]);
      if (val && val.trim().length > 0) {
        return { mode: modes[i], str: val.trim() };
      }
    }

    var t = params.get('t') || params.get('talents') || '';
    if (t.trim().length > 0) {
      return { mode: 'all', str: t.trim() };
    }

    return null;
  }

  // ---- Get hero nodes for the selected hero tree only ----
  function getSelectedHeroNodes(result) {
    if (!result) return [];

    var heroNodes = result.heroNodes || [];

    // If we know which hero tree was selected, filter to only those nodes
    if (result.heroTreeData && result.heroTreeData.nodeIds && result.heroTreeData.nodeIds.length > 0) {
      var idSet = {};
      for (var i = 0; i < result.heroTreeData.nodeIds.length; i++) {
        idSet[result.heroTreeData.nodeIds[i]] = true;
      }
      var filtered = [];
      for (var j = 0; j < heroNodes.length; j++) {
        if (idSet[heroNodes[j].id]) {
          filtered.push(heroNodes[j]);
        }
      }
      return filtered;
    }

    // Fallback: if no heroTreeData, try to figure out which tree based on selections
    if (result.heroSelections && Object.keys(result.heroSelections).length > 0) {
      var selectedIds = result.heroSelections;
      var treeData = result.treeData;

      if (treeData.heroTrees && treeData.heroTrees.length > 1) {
        // Find which hero tree has the most selected nodes
        var bestTree = null;
        var bestCount = -1;

        for (var t = 0; t < treeData.heroTrees.length; t++) {
          var ht = treeData.heroTrees[t];
          var count = 0;
          if (ht.nodeIds) {
            for (var k = 0; k < ht.nodeIds.length; k++) {
              if (selectedIds[ht.nodeIds[k]]) {
                count++;
              }
            }
          }
          if (count > bestCount) {
            bestCount = count;
            bestTree = ht;
          }
        }

        if (bestTree && bestTree.nodeIds) {
          var bestIdSet = {};
          for (var m = 0; m < bestTree.nodeIds.length; m++) {
            bestIdSet[bestTree.nodeIds[m]] = true;
          }
          var bestFiltered = [];
          for (var n = 0; n < heroNodes.length; n++) {
            if (bestIdSet[heroNodes[n].id]) {
              bestFiltered.push(heroNodes[n]);
            }
          }
          return bestFiltered;
        }
      }
    }

    return heroNodes;
  }

  // ---- Decode and render ----
  function loadBuild(mode, exportString) {
    clearError();
    currentMode = mode;
    currentString = exportString;

    if (!talentData) {
      showError('Talent data not loaded.');
      return;
    }

       try {
      currentResult = TalentDecoder.decode(exportString, talentData);

      // DEBUG — remove after calibration
      TalentDebug.run(exportString, talentData);

      applyView();
    } catch (e) {
      console.error('Decode error:', e);
      showError('Error decoding talent string: ' + e.message);
    }
  }

  // ---- Apply view ----
  function applyView() {
    if (!currentResult) return;

    var container = document.getElementById('treesContainer');
    var classPanel = document.getElementById('classTreePanel');
    var heroPanel = document.getElementById('heroTreePanel');
    var specPanel = document.getElementById('specTreePanel');
    var bottomBar = document.getElementById('bottomBar');
    var panels = [classPanel, heroPanel, specPanel];

    // Reset
    container.classList.remove('single-view');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.remove('visible');
      panels[i].style.display = '';
    }
    bottomBar.classList.remove('visible');

    if (currentMode === 'all') {
      container.classList.remove('single-view');
      bottomBar.classList.add('visible');
      renderAllTrees();
    } else {
      container.classList.add('single-view');

      if (currentMode === 'class') {
        classPanel.classList.add('visible');
      } else if (currentMode === 'hero') {
        heroPanel.classList.add('visible');
      } else if (currentMode === 'spec') {
        specPanel.classList.add('visible');
      }

      renderAllTrees();
    }
  }

  // ---- Render all trees ----
  function renderAllTrees() {
    if (!currentResult) return;
    var r = currentResult;

    // Class tree
    var classSvg = document.getElementById('classTreeSvg');
    TreeRenderer.render(classSvg, r.classNodes, r.classSelections);

    // Spec tree
    var specSvg = document.getElementById('specTreeSvg');
    TreeRenderer.render(specSvg, r.specNodes, r.specSelections);

    // Hero tree — only the selected hero tree
    var heroSvg = document.getElementById('heroTreeSvg');
    var heroNodes = getSelectedHeroNodes(r);
    TreeRenderer.render(heroSvg, heroNodes, r.heroSelections);

    // Trigger Wowhead tooltip refresh after render
    setTimeout(function () {
      if (window.$WowheadPower && window.$WowheadPower.refreshLinks) {
        window.$WowheadPower.refreshLinks();
      }
    }, 500);
  }

  // ---- Copy button ----
  function initCopyButton() {
    var btn = document.getElementById('copyBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (!currentString) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentString).then(function () {
          showCopied(btn);
        }).catch(function () {
          fallbackCopy(currentString, btn);
        });
      } else {
        fallbackCopy(currentString, btn);
      }
    });
  }

  function fallbackCopy(text, btn) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showCopied(btn);
    } catch (e) {
      console.error('Copy failed:', e);
    }
    document.body.removeChild(textarea);
  }

  function showCopied(btn) {
    var originalText = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';

    setTimeout(function () {
      btn.classList.remove('copied');
      btn.innerHTML = originalText;
    }, 2000);
  }

  // ---- Error ----
  function showError(msg) {
    var el = document.getElementById('errorMsg');
    if (el) el.textContent = msg;
  }

  function clearError() {
    var el = document.getElementById('errorMsg');
    if (el) el.textContent = '';
  }

  // ---- Empty state ----
  function showEmpty() {
    var container = document.getElementById('treesContainer');
    container.innerHTML = '<div style="text-align:center;color:#4a4a6a;padding:60px 20px;font-size:15px;">' +
      '<p style="margin-bottom:8px;">No talent string provided.</p>' +
      '<p style="font-size:13px;color:#3a3a5a;">Use URL parameters:</p>' +
      '<code style="display:block;margin-top:12px;padding:10px;background:#13132a;border-radius:6px;color:#8888aa;font-size:12px;word-break:break-all;">' +
      '?all=EXPORT_STRING<br>?class=EXPORT_STRING<br>?hero=EXPORT_STRING<br>?spec=EXPORT_STRING' +
      '</code></div>';
  }

  // ---- Init ----
  function init() {
    loadTalentData(function (err) {
      if (err) {
        showError(err);
        return;
      }

      initCopyButton();
      TalentTooltip.init();

      var urlData = parseUrl();
      if (urlData) {
        loadBuild(urlData.mode, urlData.str);
      } else {
        showEmpty();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
