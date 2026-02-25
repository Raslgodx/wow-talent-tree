/**
 * Main application — URL-driven talent tree viewer
 */

(function () {

  var talentData = null;
  var currentResult = null;
  var currentMode = null;
  var currentString = null;

  var specBackgrounds = {
    265: 'images/bg/warlock-affliction.jpg',
    266: 'images/bg/warlock-demonology.jpg',
    267: 'images/bg/warlock-destruction.jpg',
    71: 'images/bg/warrior-arms.jpg',
    72: 'images/bg/warrior-fury.jpg',
    73: 'images/bg/warrior-protection.jpg',
    65: 'images/bg/paladin-holy.jpg',
    66: 'images/bg/paladin-protection.jpg',
    70: 'images/bg/paladin-retribution.jpg',
    253: 'images/bg/hunter-bm.jpg',
    254: 'images/bg/hunter-marksmanship.jpg',
    255: 'images/bg/hunter-survival.jpg',
    259: 'images/bg/rogue-assassination.jpg',
    260: 'images/bg/rogue-outlaw.jpg',
    261: 'images/bg/rogue-subtlety.jpg',
    256: 'images/bg/priest-discipline.jpg',
    257: 'images/bg/priest-holy.jpg',
    258: 'images/bg/priest-shadow.jpg',
    250: 'images/bg/dk-blood.jpg',
    251: 'images/bg/dk-frost.jpg',
    252: 'images/bg/dk-unholy.jpg',
    262: 'images/bg/shaman-elemental.jpg',
    263: 'images/bg/shaman-enhancement.jpg',
    264: 'images/bg/shaman-restoration.jpg',
    62: 'images/bg/mage-arcane.jpg',
    63: 'images/bg/mage-fire.jpg',
    64: 'images/bg/mage-frost.jpg',
    268: 'images/bg/monk-brewmaster.jpg',
    270: 'images/bg/monk-mistweaver.jpg',
    269: 'images/bg/monk-windwalker.jpg',
    102: 'images/bg/druid-balance.jpg',
    103: 'images/bg/druid-feral.jpg',
    104: 'images/bg/druid-guardian.jpg',
    105: 'images/bg/druid-restoration.jpg',
    577: 'images/bg/dh-havoc.jpg',
    581: 'images/bg/dh-vengeance.jpg',
    1467: 'images/bg/evoker-devastation.jpg',
    1468: 'images/bg/evoker-preservation.jpg',
    1473: 'images/bg/evoker-augmentation.jpg'
  };

  function loadTalentData(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/talents.json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          try {
            var data = JSON.parse(xhr.responseText);
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

  function setSpecBackground(specId) {
    var bgEl = document.getElementById('specBackground');
    if (!bgEl) return;
    var bgPath = specBackgrounds[specId];
    if (bgPath) {
      bgEl.style.backgroundImage = 'url("' + bgPath + '")';
    } else {
      bgEl.style.backgroundImage = 'none';
    }
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
      setSpecBackground(currentResult.header.specId);
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
    var copyBar = document.getElementById('copyBar');
    var panels = [classPanel, heroPanel, specPanel];

    container.classList.remove('single-view');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.remove('visible');
      panels[i].style.display = '';
    }
    if (copyBar) copyBar.classList.remove('visible');

    if (currentMode === 'all') {
      container.classList.remove('single-view');
      if (copyBar) copyBar.classList.add('visible');
      renderAllTrees();
    } else {
      container.classList.add('single-view');
      if (currentMode === 'class') classPanel.classList.add('visible');
      else if (currentMode === 'hero') heroPanel.classList.add('visible');
      else if (currentMode === 'spec') specPanel.classList.add('visible');
      if (copyBar) copyBar.classList.add('visible');
      renderAllTrees();
    }
  }

    function renderAllTrees() {
    if (!currentResult) return;
    var r = currentResult;

    TalentTreeRenderer.renderTree(
      document.getElementById('classTreeSvg'),
      r.classNodes,
      r.classSelections
    );

    TalentTreeRenderer.renderTree(
      document.getElementById('specTreeSvg'),
      r.specNodes,
      r.specSelections
    );

    var heroNodes = getSelectedHeroNodes(r);
    TalentTreeRenderer.renderTree(
      document.getElementById('heroTreeSvg'),
      heroNodes,
      r.heroSelections
    );

    TalentTreeRenderer.renderHeroIcon(r.treeData, r.selectedSubTreeId);

    console.log('[Render] Class selected:', Object.keys(r.classSelections).length);
    console.log('[Render] Spec selected:', Object.keys(r.specSelections).length);
    console.log('[Render] Hero nodes shown:', heroNodes.length, 'selected:', Object.keys(r.heroSelections).length);

    // Update parent iframe height after render
    sendHeight();
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
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Скопировано!';
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
      '<p style="margin-bottom:8px;">Строка талантов не указана.</p>' +
      '<p style="font-size:13px;color:#3a3a5a;">Используйте параметры URL:</p>' +
      '<code style="display:block;margin-top:12px;padding:10px;background:#13132a;border-radius:6px;color:#8888aa;font-size:12px;word-break:break-all;">' +
      '?all=EXPORT_STRING<br>?class=EXPORT_STRING<br>?hero=EXPORT_STRING<br>?spec=EXPORT_STRING' +
      '</code></div>';
  }

    function init() {
    loadTalentData(function (err) {
      if (err) {
        showError(err);
        sendHeight(); // отправить даже при ошибке
        return;
      }

      TalentDecoder.loadNodeOrder(function (err2) {
        if (err2) {
          showError(err2);
          sendHeight();
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

        // Send height after render
        sendHeight();

        // Resend on resize (responsive changes)
        window.addEventListener('resize', debounce(sendHeight, 200));
      });
    });
  }

  function sendHeight() {
    // Small delay to let browser finish layout
    setTimeout(function () {
      var body = document.body;
      var html = document.documentElement;
      var height = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      );
      window.parent.postMessage({
        type: 'talent-tree-resize',
        height: height
      }, '*');
      console.log('[iframe] Sent height:', height);
    }, 100);
  }

  function debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
