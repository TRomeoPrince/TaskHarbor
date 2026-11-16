/* TaskHarbor appearance controller. Extend THEMES with a matching CSS token set. */
(function (root) {
  'use strict';
  const KEY = 'taskharbor.theme';
  const THEMES = Object.freeze([
    Object.freeze({id: 'light', label: 'Harbor Light', tone: 'light', description: 'The original clean, botanical TaskHarbor'}),
    Object.freeze({id: 'dark', label: 'Midnight Grove', tone: 'dark', description: 'The original calm forest-night look'}),
    Object.freeze({id: 'eden', label: 'Eden Bloom', tone: 'light', description: 'Sage, blossoms and warm cream'}),
    Object.freeze({id: 'sunrise', label: 'Golden Hour', tone: 'light', description: 'Honeyed sunrise with terracotta'}),
    Object.freeze({id: 'ocean', label: 'Ocean Glass', tone: 'light', description: 'Aqua, sea glass and crisp blue'}),
    Object.freeze({id: 'orchid', label: 'Orchid Atelier', tone: 'light', description: 'Lavender and elegant creative energy'}),
    Object.freeze({id: 'aurora', label: 'Aurora Circuit', tone: 'dark', description: 'Northern lights meet digital precision'}),
    Object.freeze({id: 'velvet', label: 'Velvet Afterglow', tone: 'dark', description: 'Mulberry night with rose-gold highlights'}),
    Object.freeze({id: 'cosmos', label: 'Cosmic Harbor', tone: 'dark', description: 'Electric indigo and starlit cyan'})
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
    doc.documentElement.style.colorScheme = THEMES.find(item => item.id === theme).tone;
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
    const swatch = doc.createElement('span');
    swatch.className = 'theme-switcher-swatch';
    swatch.setAttribute('aria-hidden','true');
    label.append(swatch);
    const word = doc.createElement('span');
    word.className = 'theme-switcher-label';
    word.textContent = 'Appearance';
    label.append(word);
    const select = doc.createElement('select');
    select.id = 'taskharbor-theme-select';
    select.setAttribute('aria-label','Site appearance');
    select.setAttribute('title','Choose a TaskHarbor theme');
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
