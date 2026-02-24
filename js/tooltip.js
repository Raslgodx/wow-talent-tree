/**
 * Tooltip — now handled entirely by Wowhead widget
 * This file kept for compatibility, does nothing custom
 */

var TalentTooltip = (function () {

  function init() {
    // Wowhead tooltips loaded via <script> in index.html
    // Russian locale enforced via /ru/ in URLs
    console.log('[Tooltip] Using Wowhead tooltips with /ru/ locale');
  }

  return {
    init: init
  };

})();
