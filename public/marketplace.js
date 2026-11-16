/* TaskHarbor marketplace: progressive enhancement over authenticated /api/state. */
(function (root) {
  'use strict';
  const CATEGORIES = [
    ['all', 'All work'],
    ['microtask', 'Microtasks'],
    ['survey', 'Surveys & offers'],
    ['ai', 'AI evaluation'],
    ['transcription', 'Transcription'],
    ['annotation', 'Data annotation'],
    ['project', 'Skilled projects'],
    ['general', 'General']
  ];
  const LABELS = Object.fromEntries(CATEGORIES);
  const ALIASES = {
    micro: 'microtask', quick: 'microtask', tasks: 'microtask',
    surveys: 'survey', offerwall: 'survey', offers: 'survey',
    ai_training: 'ai', ai_evaluation: 'ai', ai_training_data: 'ai',
    audio: 'transcription', transcript: 'transcription',
    data_annotation: 'annotation', labeling: 'annotation', labelling: 'annotation',
    skilled: 'project', freelance: 'project', milestones: 'project'
  };
  const STATUSES = new Set(['available', 'claimed', 'submitted', 'approved', 'rejected']);
  let current = null;
  let initialized = false;
  let activeView = 'discover';
  function category(task) {
    const raw = String(task.task_type || task.category || task.work_type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const key = ALIASES[raw] || raw;
    return LABELS[key] && key !== 'all' ? key : 'general';
  }
  function counters(tasks, submissions, userId) {
    const own = tasks.filter(task => task.worker_id === userId);
    return {
      available: tasks.filter(task => task.status === 'available').length,
      active: own.filter(task => task.status === 'claimed').length,
      inReview: own.filter(task => task.status === 'submitted').length,
      corrections: own.filter(task => Boolean(task.correction)).length,
      complete: own.filter(task => task.status === 'approved' || task.compensation).length,
      total: tasks.length
    };
  }
  function matches(task, filters) {
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.category !== 'all' && category(task) !== filters.category) return false;
    if (Number(task.reward || 0) < filters.minimumCents) return false;
    const term = (filters.search || '').toLocaleLowerCase();
    if (!term) return true;
    return [task.title, task.provider, task.status, LABELS[category(task)]]
      .some(value => String(value || '').toLocaleLowerCase().includes(term));
  }
  function filterTasks(tasks, filters) {
    return tasks.filter(task => matches(task, filters));
  }
  function scopeTasks(tasks, user, view = 'discover') {
    if (user?.role === 'admin') return tasks;
    if (view === 'mine') return tasks.filter(task => task.worker_id === user?.id &&
      task.status !== 'available');
    return tasks.filter(task => task.status === 'available');
  }
  function filtersFromUi(doc) {
    const get = id => doc.getElementById(id);
    const status = get('task-filter')?.value || 'all';
    const minimumRaw = Number(get('market-minimum')?.value || 0);
    return {
      status: STATUSES.has(status) ? status : 'all',
      category: get('market-category')?.value || 'all',
      minimumCents: Number.isFinite(minimumRaw) && minimumRaw > 0 ? Math.ceil(minimumRaw * 100) : 0,
      search: (get('market-search')?.value || '').trim().slice(0,100),
      sort: get('market-sort')?.value || 'newest'
    };
  }
  function el(doc, name, className, text) {
    const node = doc.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function oneCard(doc, label, value, detail, href, view = 'discover') {
    const item = el(doc, 'a', 'market-stat');
    item.href = href;
    item.dataset.marketViewLink = view;
    item.append(el(doc, 'span', 'market-stat-label', label));
    item.append(el(doc, 'strong', 'market-stat-value', value));
    item.append(el(doc, 'small', 'market-stat-detail', detail));
    return item;
  }
  function paintSummary(doc, snapshot) {
    const node = doc.getElementById('marketplace-summary');
    if (!node) return;
    const totals = counters(snapshot.tasks || [], snapshot.submissions || [], snapshot.user.id);
    node.replaceChildren(
      oneCard(doc, 'Find work', totals.available, 'Open tasks', '#tasks-section'),
      oneCard(doc, 'My active work', totals.active, 'Continue tasks', '#tasks-section', 'mine'),
      oneCard(doc, 'In review', totals.inReview, 'Awaiting a decision', '#tasks-section', 'mine'),
      oneCard(doc, 'Needs attention', totals.corrections, 'Review corrections', '#tasks-section', 'mine')
    );
    const label = doc.getElementById('marketplace-welcome');
    if (label) label.textContent = 'Welcome back. You have ' + totals.active +
      ' task' + (totals.active === 1 ? '' : 's') + ' in progress and ' + totals.inReview + ' awaiting review.';
    const notice = doc.getElementById('marketplace-attention');
    if (notice) {
      notice.hidden = totals.corrections === 0;
      notice.textContent = totals.corrections ? totals.corrections +
        ' task' + (totals.corrections === 1 ? ' needs' : 's need') +
        ' a correction. Open My Tasks to see what to change.' : '';
    }
  }
  function enhanceCard(doc, task, money) {
    const node = doc.getElementById('task-' + task.id);
    if (!node) return null;
    node.dataset.category = category(task);
    node.dataset.reward = String(task.reward || 0);
    node.dataset.search = [task.title, task.provider, LABELS[category(task)]].join(' ');
    const meta = node.querySelector('.task-metadata');
    if (meta && !meta.querySelector('.market-category-tag')) {
      const tag = el(doc, 'span', 'market-category-tag', LABELS[category(task)]);
      meta.prepend(tag);
    }
    const detail = node.querySelector('.task-detail');
    if (detail && !detail.querySelector('.market-policy')) {
      const policy = el(doc, 'div', 'market-policy');
      const units = {task:'task',item:'item',batch:'batch',clip:'clip',recorded_minute:'recorded minute',milestone:'milestone'};
      const unit = units[task.reward_unit] || 'task';
      const reward = el(doc, 'span', '', 'Reward: ' + money(task.reward || 0) + ' per accepted ' + unit);
      policy.append(reward);
      if (task.expected_minutes) policy.append(el(doc, 'span', '', 'Estimated duration: ' + task.expected_minutes + ' minutes'));
      if (task.skill_level && task.skill_level !== 'any') policy.append(el(doc, 'span', '', 'Skill level: ' + task.skill_level));
      if (task.policy && task.policy.claim_minutes) policy.append(el(doc, 'span', '', 'Work window: ' + task.policy.claim_minutes + ' minutes after activation'));
      if (task.policy && task.policy.deadline_at) {
        const deadline = new Date(Number(task.policy.deadline_at));
        if (!Number.isNaN(deadline.getTime())) policy.append(el(doc, 'span', '', 'Deadline: ' + deadline.toLocaleString()));
      }
      policy.append(el(doc, 'span', '', 'Approval and any applicable hold are required before withdrawal.'));
      if (task.public_summary) detail.prepend(el(doc,'p','market-public-summary',task.public_summary));
      detail.prepend(policy);
    }
    return node;
  }
  function paintTasks(doc) {
    if (!current) return;
    const { snapshot, money } = current;
    const filters = filtersFromUi(doc);
    const allRecords = snapshot.tasks || [];
    const records = scopeTasks(allRecords, snapshot.user, activeView);
    const included = filterTasks(records, filters);
    const eligibleIds = new Set(included.map(t => String(t.id)));
    const sort = filters.sort;
    const ranked = included.slice().sort((a, b) => {
      if (sort === 'reward-high') return Number(b.reward || 0) - Number(a.reward || 0);
      if (sort === 'reward-low') return Number(a.reward || 0) - Number(b.reward || 0);
      if (sort === 'title') return String(a.title).localeCompare(String(b.title));
      return 0;
    });
    const positions = new Map(ranked.map((t, i) => [String(t.id), i]));
    allRecords.forEach(t => {
      const card = enhanceCard(doc, t, money);
      if (!card) return;
      card.hidden = !eligibleIds.has(String(t.id));
      card.style.order = String(positions.get(String(t.id)) ?? records.length);
    });
    const result = doc.getElementById('market-results');
    if (result) result.textContent = included.length + ' of ' + records.length +
      ' task' + (records.length === 1 ? '' : 's') + ' shown';
    const empty = doc.getElementById('market-empty');
    if (empty) {
      empty.hidden = included.length !== 0;
      empty.textContent = activeView === 'mine'
        ? 'No matching assignments. Your claimed and submitted tasks appear here.'
        : 'No matching open work. Try another category or clear your filters.';
    }
    const switcher = doc.getElementById('market-view-switch');
    if (switcher) switcher.hidden = snapshot.user.role === 'admin';
    doc.querySelectorAll?.('#market-view-switch [data-market-view]')?.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.marketView === activeView));
    });
    if (snapshot.user.role !== 'admin') {
      const heading = doc.querySelector?.('#tasks-section .section-heading h2');
      if (heading) heading.textContent = activeView === 'mine' ? 'My Tasks' : 'Find Work';
    }
  }
  function adminEditor(doc, snapshot) {
    const form = doc.getElementById('market-admin-edit');
    const picker = doc.getElementById('market-edit-task');
    if (!form || !picker) return;
    const status = doc.getElementById('market-edit-status');
    if (status && !snapshot.catalogReady) status.textContent =
      'Catalog database migration is required before saving classifications.';
    const tasks = snapshot.tasks || [];
    const previous = picker.value;
    const previousKeys = picker.dataset.keys || '';
    const keys = tasks.map(task => task.id).join('|');
    const populate = () => {
      const record = tasks.find(task => task.id === picker.value);
      if (!record) return;
      const field = (id, value) => {
        const node = doc.getElementById(id);
        if (node) node.value = value == null ? '' : String(value);
      };
      field('market-edit-category',record.category || 'general');
      field('market-edit-unit',record.reward_unit || 'task');
      field('market-edit-level',record.skill_level || 'any');
      field('market-edit-minutes',record.expected_minutes);
      field('market-edit-summary',record.public_summary || '');
    };
    if (keys !== previousKeys) {
      picker.replaceChildren(...tasks.map(task => {
        const option = el(doc, 'option', '', task.title + ' · ' + task.id.slice(0,8));
        option.value = task.id;
        return option;
      }));
      picker.dataset.keys = keys;
      if (tasks.some(task => task.id === previous)) picker.value = previous;
      populate();
    }
    if (form.dataset.bound) return;
    form.dataset.bound = '1';
    picker.addEventListener('change', () => {
      const match = current?.snapshot?.tasks.find(task => task.id === picker.value);
      if (!match) return;
      const fields = [
        ['market-edit-category',match.category||'general'],
        ['market-edit-unit',match.reward_unit||'task'],
        ['market-edit-level',match.skill_level||'any'],
        ['market-edit-minutes',match.expected_minutes??''],
        ['market-edit-summary',match.public_summary||'']
      ];
      fields.forEach(([id,value]) => {
        const node = doc.getElementById(id);if(node)node.value=String(value);
      });
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!current?.snapshot?.catalogReady) {
        if (status) status.textContent='Catalog schema is not yet installed.';
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      const button = form.querySelector('button[type=submit]');
      if (button) button.disabled=true;
      if (status) status.textContent='Saving…';
      try {
        const response = await fetch('/api/task-catalog', {
          method:'POST', credentials:'same-origin',
          headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
        });
        const result=await response.json();
        if (!response.ok) throw Error(result.error || 'Could not save task metadata');
        if (status) status.textContent='Saved. Refreshing task listings…';
        doc.getElementById('refresh')?.click?.();
      } catch (error) {
        if (status) status.textContent=error.message;
      } finally {
        if (button) button.disabled=false;
      }
    });
  }
  function mount(snapshot, options) {
    if (!snapshot || !snapshot.user || !Array.isArray(snapshot.tasks)) return;
    const doc = root.document;
    if (!doc) return;
    const admin = snapshot.user.role === 'admin';
    const summary = doc.getElementById('marketplace-summary');
    const quick = doc.getElementById('marketplace-intro');
    if (summary) summary.hidden = admin;
    if (quick) quick.hidden = admin;
    const mobile = doc.getElementById('mobile-work-nav');
    if (mobile) mobile.hidden = admin;
    current = { snapshot, money: options?.money || (n => '$' + (n / 100).toFixed(2)) };
    if (!initialized) {
      initialized = true;
      ['market-search', 'market-category', 'market-minimum', 'market-sort', 'task-filter']
        .forEach(id => {
          const target = doc.getElementById(id);
          if (target) {
            target.addEventListener('input', () => paintTasks(doc));
            target.addEventListener('change', () => paintTasks(doc));
          }
        });
      const selectView = view => {
        if (view !== 'discover' && view !== 'mine') return;
        activeView=view;
        const status=doc.getElementById('task-filter');
        if (status) status.value='all';
        paintTasks(doc);
      };
      doc.querySelectorAll?.('#market-view-switch [data-market-view]')?.forEach(button => {
        button.addEventListener('click', () => selectView(button.dataset.marketView));
      });
      doc.addEventListener?.('click', event => {
        const link=event.target?.closest?.('[data-market-view-link]');
        if (link && current?.snapshot?.user?.role !== 'admin') {
          selectView(link.dataset.marketViewLink);
        }
      });
      const clear = doc.getElementById('market-clear');
      if (clear) clear.addEventListener('click', () => {
        ['market-search', 'market-minimum'].forEach(id => {
          const element = doc.getElementById(id);
          if (element) element.value = '';
        });
        const category = doc.getElementById('market-category');
        if (category) category.value = 'all';
        const status = doc.getElementById('task-filter');
        if (status) status.value = 'all';
        const sort = doc.getElementById('market-sort');
        if (sort) sort.value = 'newest';
        paintTasks(doc);
      });
    }
    if (admin) adminEditor(doc,snapshot);
    else paintSummary(doc, snapshot);
    paintTasks(doc);
  }
  root.TaskHarborMarketplace = { mount, category, counters, matches, filterTasks, scopeTasks, CATEGORIES };
})(globalThis);
