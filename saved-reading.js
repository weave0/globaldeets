/**
 * GD-043: one reviewed public story shortcut, explicitly saved by the reader.
 * No accounts, cookies, network calls, publisher URL persistence or engagement
 * telemetry. The saved VERSION can be compared with a separately loaded and
 * validated record, but this control never promises alerts/live monitoring.
 */
(function () {
  'use strict';

  const KEY = 'globaldeets:saved-story:v1';
  const ID = 'santa-ynez-pipeline';
  const VALID_VERSION = /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/;
  const savedControls = document.getElementById('saved-story-controls');
  const storyButton = document.getElementById('saved-story-toggle');
  const storyStatus = document.getElementById('saved-story-status');
  const homePanel = document.getElementById('saved-story-panel');
  const homeStatus = document.getElementById('saved-story-home-status');
  const homeRemove = document.getElementById('saved-story-remove');

  function snapshot() {
    let raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch {
      return { usable: false, saved: null };
    }
    if (!raw) return { usable: true, saved: null };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id === ID && typeof parsed.version === 'string' &&
          VALID_VERSION.test(parsed.version) && Object.keys(parsed).sort().join(',') === 'id,version') {
        return { usable: true, saved: { id: ID, version: parsed.version } };
      }
    } catch {
      // Damaged or noncanonical entries cannot supply URLs, HTML, or buttons.
    }
    return { usable: true, saved: null };
  }

  function write(record) {
    try {
      if (record) window.localStorage.setItem(KEY, JSON.stringify(record));
      else window.localStorage.removeItem(KEY);
      return true;
    } catch {
      return false;
    }
  }

  function renderedVersion() {
    if (document.body.dataset.storyKey !== ID) return null;
    const value = document.body.dataset.storyVersion;
    return VALID_VERSION.test(value || '') ? value : null;
  }

  function updateStory() {
    if (!savedControls || !storyButton || !storyStatus) return;
    const version = renderedVersion();
    if (!version) {
      savedControls.hidden = true;
      storyButton.disabled = true;
      return;
    }
    savedControls.hidden = false;
    const { usable, saved } = snapshot();
    if (!usable) {
      storyButton.disabled = true;
      storyButton.textContent = 'Saving unavailable';
      storyStatus.textContent = 'This browser does not allow local saving. Use a browser bookmark instead.';
      return;
    }
    storyButton.disabled = false;
    storyButton.textContent = saved ? 'Remove saved story' : 'Save story on this device';
    if (!saved) {
      storyStatus.textContent = 'Saves a shortcut and record version only on this device. No alerts or account.';
    } else if (saved.version === version) {
      storyStatus.textContent = 'Saved on this device. Reopen this page to check its reviewed record. No alerts are sent.';
    } else {
      storyStatus.textContent = 'Your saved version ' + saved.version +
        ' differs from the currently loaded record version ' + version +
        '. Check the corrections and record dates. This does not imply live monitoring.';
    }
  }

  function updateHome() {
    if (!homePanel) return;
    const { saved } = snapshot();
    homePanel.hidden = !saved;
    if (saved && homeStatus) {
      homeStatus.textContent = 'Saved record version ' + saved.version +
        '. Open the story to check for differences; this device does not receive alerts.';
    }
  }

  if (storyButton) {
    storyButton.addEventListener('click', () => {
      const version = renderedVersion();
      if (!version) return;
      const old = snapshot();
      if (!old.usable) return updateStory();
      const wanted = old.saved ? null : { id: ID, version };
      if (!write(wanted)) {
        storyStatus.textContent = 'Could not save on this device. Use a browser bookmark instead.';
        return;
      }
      updateStory();
    });
    document.addEventListener('globaldeets:reviewed-story-rendered', updateStory);
  }
  if (homeRemove) {
    homeRemove.addEventListener('click', () => {
      if (!write(null)) {
        if (homeStatus) homeStatus.textContent = 'Could not remove the shortcut in this browser.';
        return;
      }
      updateHome();
    });
  }
  window.addEventListener('storage', event => {
    if (event.key === KEY) {
      updateHome();
      updateStory();
    }
  });
  updateHome();
  updateStory();
})();
