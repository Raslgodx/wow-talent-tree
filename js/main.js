/**
 * Main application — URL-driven talent tree viewer
 */

(function () {

  var talentData = null;
  var currentResult = null;
  var currentMode = null;
  var currentString = null;

  function loadTalentData(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/talents.json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          try {
            var data = JSON.parse(xhr.responseText);
            // Tag each node with its tree type for the decoder
            for (var i = 0; i < data.length; i++) {
              var spec = data[i];
              var tagNodes = function (arr, type) {
                if (!arr) return;
                for (var j = 0; j < arr.length; j++) {
                  arr[j]._treeType = type;
                }
              };
              tagNodes(spec.classNodes, 'class');
              tagNodes(spec.specNodes, 'spec');
              tagNodes(spec.heroNodes, 'hero');
            }
            talentData = data;
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

  function getSelectedHeroNodes(result) {
    if (!result || !result.heroNodes) return [];

    var subTreeId = result.selectedSubTreeId;

    if (subTreeId !== null && subTreeId !== undefined) {
      var filtered = [];
      for (var i = 0; i < result.heroNodes.length; i++) {
        if (result.heroNodes[i].subTreeId === subTreeId) {
          filtered.push(result.heroNodes[i]);
        }
      }
      if (filtered.length > 0) return filtered;
    }

    if (result.heroTreeData && result.heroTreeData.nodeIds) {
      var idSet = {};
      for (var j = 0; j < result.heroTreeData.nodeIds.length; j++) {
        idSet[result.heroTreeData.nodeIds[j]] = true;
      }
      var filtered2 = [];
      for (var k = 0; k < result.heroNodes.length; k++) {
        if (idSet[result.heroNodes[k].id]) {
          filtered2.push(result.heroNodes[k]);
        }
      }
      if (filtered2.length > 0) return filtered2;
    }

    return result.heroNodes;
  }

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
      applyView();
    } catch (e) {
      console.error('Decode error:', e);
      showError('Error decoding talent string: ' + e.message);
    }
  }

  function applyView() {
    if (!currentResult) return;

    var container = document.getElementById('treesContainer');
    var classPanel = document.getElementById('classTreePanel');
    var heroPanel = document.getElementById('heroTreePanel');
    var specPanel = document.getElementById('specTreePanel');
    var bottomBar = document.getElementById('bottomBar');
    var panels = [classPanel, heroPanel, specPanel];

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
      if (currentMode === 'class') classPanel.classList.add('visible');
      else if (currentMode === 'hero') heroPanel.classList.add('visible');
      else if (currentMode === 'spec') specPanel.classList.add('visible');
      renderAllTrees();
    }
  }

  function renderAllTrees() {
    if (!currentResult) return;
    var r = currentResult;

    TreeRenderer.render(
      document.getElementById('classTreeSvg'),
      r.classNodes,
      r.classSelections
    );

    TreeRenderer.render(
      document.getElementById('specTreeSvg'),
      r.specNodes,
      r.specSelections
    );

    var heroNodes = getSelectedHeroNodes(r);
    TreeRenderer.render(
      document.getElementById('heroTreeSvg'),
      heroNodes,
      r.heroSelections
    );

    console.log('[Render] Class selected:', Object.keys(r.classSelections).length);
    console.log('[Render] Spec selected:', Object.keys(r.specSelections).length);
    console.log('[Render] Hero nodes shown:', heroNodes.length, 'selected:', Object.keys(r.heroSelections).length);

    setTimeout(function () {
      if (window.$WowheadPower && window.$WowheadPower.refreshLinks) {
        window.$WowheadPower.refreshLinks();
      }
    }, 500);
  }

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
    } catch (e) { }
    document.body.removeChild(textarea);
  }

  function showCopied(btn) {
    var orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
    setTimeout(function () {
      btn.classList.remove('copied');
      btn.innerHTML = orig;
    }, 2000);
  }

  function showError(msg) {
    var el = document.getElementById('errorMsg');
    if (el) el.textContent = msg;
  }

  function clearError() {
    var el = document.getElementById('errorMsg');
    if (el) el.textContent = '';
  }

  function showEmpty() {
    var container = document.getElementById('treesContainer');
    container.innerHTML = '<div style="text-align:center;color:#4a4a6a;padding:60px 20px;font-size:15px;">' +
      '<p style="margin-bottom:8px;">No talent string provided.</p>' +
      '<p style="font-size:13px;color:#3a3a5a;">Use URL parameters:</p>' +
      '<code style="display:block;margin-top:12px;padding:10px;background:#13132a;border-radius:6px;color:#8888aa;font-size:12px;word-break:break-all;">' +
      '?all=EXPORT_STRING<br>?class=EXPORT_STRING<br>?hero=EXPORT_STRING<br>?spec=EXPORT_STRING' +
      '</code></div>';
  }

  function init() {
    // Load both data files, then start
    loadTalentData(function (err) {
      if (err) {
        showError(err);
        return;
      }

      TalentDecoder.loadNodeOrder(function (err2) {
        if (err2) {
          showError(err2);
          return;
        }

        console.log('Node order data loaded successfully');
        initCopyButton();
        TalentTooltip.init();

        var urlData = parseUrl();
        if (urlData) {
          loadBuild(urlData.mode, urlData.str);
        } else {
          showEmpty();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
