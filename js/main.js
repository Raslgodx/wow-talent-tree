/**
 * Main application entry point
 */

(function () {

  var talentData = null;
  var currentResult = null;

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

  // ---- Process talent string ----
  function loadBuild(exportString) {
    clearError();

    if (!talentData) {
      showError('Talent data not loaded yet. Please wait...');
      return;
    }

    var str = (exportString || '').trim();
    if (str.length === 0) {
      showError('Please enter a talent export string.');
      return;
    }

    try {
      currentResult = TalentDecoder.decode(str, talentData);
      updateUI();
      updateUrl(str);
    } catch (e) {
      console.error('Decode error:', e);
      showError('Error: ' + e.message);
    }
  }

  // ---- Update UI after decode ----
  function updateUI() {
    if (!currentResult) return;

    var r = currentResult;

    // Info bar
    document.getElementById('className').textContent = r.treeData.className || '-';
    document.getElementById('specName').textContent = r.treeData.specName || '-';
    document.getElementById('heroSpecName').textContent =
      (r.heroTreeData && r.heroTreeData.name) ? r.heroTreeData.name : '-';
    document.getElementById('pointCount').textContent = r.totalPoints + ' points';

    // Render trees
    renderAllTrees();
  }

  // ---- Render all three trees ----
  function renderAllTrees() {
    if (!currentResult) return;

    var r = currentResult;

    // Class tree
    var classSvg = document.getElementById('classTreeSvg');
    TreeRenderer.render(classSvg, r.classNodes, r.classSelections);

    // Spec tree
    var specSvg = document.getElementById('specTreeSvg');
    TreeRenderer.render(specSvg, r.specNodes, r.specSelections);

    // Hero tree — filter to selected hero sub-tree if applicable
    var heroSvg = document.getElementById('heroTreeSvg');
    var heroNodes = r.heroNodes;

    if (r.heroTreeData && r.heroTreeData.nodeIds) {
      var idSet = {};
      for (var i = 0; i < r.heroTreeData.nodeIds.length; i++) {
        idSet[r.heroTreeData.nodeIds[i]] = true;
      }
      heroNodes = [];
      for (var j = 0; j < r.heroNodes.length; j++) {
        if (idSet[r.heroNodes[j].id]) {
          heroNodes.push(r.heroNodes[j]);
        }
      }
    }

    TreeRenderer.render(heroSvg, heroNodes, r.heroSelections);
  }

  // ---- Tab switching ----
  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    var container = document.getElementById('treesContainer');

    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        // Remove active from all
        for (var j = 0; j < tabs.length; j++) {
          tabs[j].classList.remove('active');
        }
        this.classList.add('active');

        var view = this.getAttribute('data-tab');
        var panels = document.querySelectorAll('.tree-panel');

        if (view === 'all') {
          container.classList.remove('single-view');
          for (var k = 0; k < panels.length; k++) {
            panels[k].classList.remove('visible');
          }
        } else {
          container.classList.add('single-view');
          for (var m = 0; m < panels.length; m++) {
            panels[m].classList.remove('visible');
          }
          var target = document.querySelector('.tree-panel[data-tree="' + view + '"]');
          if (target) {
            target.classList.add('visible');
          }
        }
      });
    }
  }

  // ---- URL params ----
  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var str = params.get('t') || params.get('talents') || params.get('loadout') || '';
    if (str.length > 0) {
      document.getElementById('talentString').value = str;
      loadBuild(str);
    }
  }

  function updateUrl(str) {
    try {
      var url = new URL(window.location);
      url.searchParams.set('t', str);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Ignore URL errors (e.g., file:// protocol)
    }
  }

  // ---- Error display ----
  function showError(msg) {
    var el = document.getElementById('errorMsg');
    if (el) el.textContent = msg;
  }

  function clearError() {
    var el = document.getElementById('errorMsg');
    if (el) el.textContent = '';
  }

  // ---- Init ----
  function init() {
    // Load talent data
    loadTalentData(function (err) {
      if (err) {
        showError(err);
        return;
      }

      // Init components
      initTabs();
      TalentTooltip.init();

      // Load button
      document.getElementById('loadBtn').addEventListener('click', function () {
        var str = document.getElementById('talentString').value;
        loadBuild(str);
      });

      // Enter key
      document.getElementById('talentString').addEventListener('keypress', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          document.getElementById('loadBtn').click();
        }
      });

      // Check URL for talent string
      checkUrlParams();
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
