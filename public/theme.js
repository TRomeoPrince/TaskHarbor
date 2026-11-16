/* TaskHarbor appearance controller. Extend THEMES with a matching CSS token set. */
(function (root) {
  'use strict';
  const KEY = 'taskharbor.theme';
  const THEMES = Object.freeze([
    Object.freeze({id: 'light', label: 'Light'}),
    Object.freeze({id: 'dark', label: 'Dark'})
  ]);
  const allowed = id => THEMES.some(theme => theme.id === id);
  const doc = root.document;
  if (!doc?.documentElement) return;

  function persisted() {
    try { return root.localStorage?.getItem(KEY); }
    catch { return null; }
  }
  function current() {
    const raw = doc.documentElement.getAttribute('data-theme');
    return allowed(raw) ? raw : 'light';
  }
  function apply(id, save = true) {
    const theme = allowed(id) ? id : 'light';
    doc.documentElement.setAttribute('data-theme', theme);
    // Inform the UA's controls/scrollbars and cross-page paint.
    doc.documentElement.style.colorScheme = theme;
    const select = doc.getElementById?.('taskharbor-theme-select');
    if (select) select.value = theme;
    if (save) {
      try { root.localStorage?.setItem(KEY, theme); }
      catch { /* Private browsing may disable persistence. UI still works. */ }
    }
    return theme;
  }
  // Execute in <head>, before styles and app scripts, to avoid theme flash.
  apply(persisted(), false);

  function createControl() {
    const header = doc.querySelector?.('.site-header');
    if (!header || doc.getElementById?.('taskharbor-theme-select')) return;
    const label = doc.createElement('label');
    label.className = 'theme-switcher';
    label.setAttribute('for','taskharbor-theme-select');
    const word = doc.createElement('span');
    word.className = 'theme-switcher-label';
    word.textContent = 'Appearance';
    label.append(word);
    const select = doc.createElement('select');
    select.id = 'taskharbor-theme-select';
    select.setAttribute('aria-label','Site appearance');
    for (const theme of THEMES) {
      const option = doc.createElement('option');
      option.value = theme.id;
      option.textContent = theme.label;
      select.append(option);
    }
    select.value = current();
    select.addEventListener('change', () => apply(select.value));
    label.append(select);
    header.append(label);
  }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', createControl, {once:true});
  } else createControl();

  root.addEventListener?.('storage', event => {
    if (event.key === KEY) apply(event.newValue, false);
  });
  root.TaskHarborTheme = Object.freeze({
    get: current,
    set: id => {
      if (!allowed(id)) throw new Error('Unknown TaskHarbor theme');
      return apply(id);
    },
    available: () => THEMES.map(theme => ({...theme})),
    storageKey:KEY
  });
})(globalThis);
