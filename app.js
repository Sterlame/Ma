/* ===========================================================
   Ma — app glue
   =========================================================== */

(() => {
  let state = {
    notebooks: [],
    activeNotebookId: null,
    docs: [],
    activeDocId: null,
    theme: 'light',
    autosyncTimer: null
  };

  const el = {
    notebookList: document.getElementById('notebookList'),
    activeNotebookName: document.getElementById('activeNotebookName'),
    docItems: document.getElementById('docItems'),
    docSearch: document.getElementById('docSearch'),
    docTitle: document.getElementById('docTitle'),
    editor: document.getElementById('editor'),
    wordCount: document.getElementById('wordCount'),
    goalStatus: document.getElementById('goalStatus'),
    tagLine: document.getElementById('tagLine'),
    savedState: document.getElementById('savedState'),
    syncStatus: document.getElementById('syncStatus'),
    themePopover: document.getElementById('themePopover'),
    menuBtn: document.getElementById('menuBtn')
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- bootstrap ----------
  async function init() {
    state.theme = (await MaDB.getMeta('theme')) || 'light';
    applyTheme(state.theme);

    state.notebooks = await MaDB.listNotebooks();
    if (state.notebooks.length === 0) {
      const nb = { id: uid(), name: 'Personal', createdAt: Date.now() };
      await MaDB.putNotebook(nb);
      state.notebooks = [nb];
    }
    state.activeNotebookId = (await MaDB.getMeta('activeNotebookId')) || state.notebooks[0].id;
    renderNotebooks();
    await loadDocsForActiveNotebook();

    wireEvents();
    updateSyncStatusLabel();
    if (MaSync.configured()) {
      state.autosyncTimer = setInterval(() => MaSync.syncAll(setSyncStatus), 30000);
    }
  }

  // ---------- notebooks ----------
  function renderNotebooks() {
    el.notebookList.innerHTML = '';
    state.notebooks.forEach((nb) => {
      const item = document.createElement('div');
      item.className = 'notebook-item' + (nb.id === state.activeNotebookId ? ' active' : '');
      item.textContent = nb.name;
      item.addEventListener('click', () => switchNotebook(nb.id));
      el.notebookList.appendChild(item);
    });
    const active = state.notebooks.find((n) => n.id === state.activeNotebookId);
    el.activeNotebookName.textContent = active ? active.name : '—';
  }

  async function switchNotebook(id) {
    state.activeNotebookId = id;
    await MaDB.setMeta('activeNotebookId', id);
    renderNotebooks();
    await loadDocsForActiveNotebook();
  }

  async function createNotebook() {
    const name = prompt('Notebook name');
    if (!name) return;
    const nb = { id: uid(), name: name.trim(), createdAt: Date.now() };
    await MaDB.putNotebook(nb);
    state.notebooks.push(nb);
    if (MaSync.configured()) {
      try { await MaSync.ensureNotebookFolder(nb.name); } catch (e) { console.warn(e); }
    }
    await switchNotebook(nb.id);
  }

  // ---------- documents ----------
  async function loadDocsForActiveNotebook() {
    state.docs = await MaDB.listDocuments(state.activeNotebookId);
    state.docs.sort((a, b) => b.updatedAt - a.updatedAt);
    renderDocList();
    if (state.docs.length > 0) {
      openDocument(state.docs[0].id);
    } else {
      await createDocument();
    }
  }

  function renderDocList(filter) {
    el.docItems.innerHTML = '';
    const q = (filter || '').toLowerCase();
    state.docs
      .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.tags || []).some((t) => t.toLowerCase().includes(q)))
      .forEach((doc) => {
        const item = document.createElement('div');
        item.className = 'doc-item' + (doc.id === state.activeDocId ? ' active' : '');
        const title = document.createElement('div');
        title.className = 'doc-item-title';
        title.textContent = doc.title || 'Untitled';
        const meta = document.createElement('div');
        meta.className = 'doc-item-meta';
        meta.textContent = (doc.tags && doc.tags.length ? doc.tags.join(', ') + ' · ' : '') + timeAgo(doc.updatedAt);
        item.appendChild(title);
        item.appendChild(meta);
        item.addEventListener('click', () => openDocument(doc.id));
        el.docItems.appendChild(item);
      });
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    return Math.floor(hr / 24) + 'd ago';
  }

  async function createDocument() {
    const doc = {
      id: uid(),
      notebookId: state.activeNotebookId,
      title: '',
      markdown: '',
      tags: [],
      goal: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dirty: true,
      driveFileId: null
    };
    await MaDB.putDocument(doc);
    state.docs.unshift(doc);
    renderDocList();
    openDocument(doc.id);
  }

  function openDocument(id) {
    state.activeDocId = id;
    const doc = state.docs.find((d) => d.id === id);
    if (!doc) return;
    el.docTitle.value = doc.title || '';
    MaMarkdown.fromMarkdown(el.editor, doc.markdown || '');
    updateWordCount(doc);
    el.tagLine.textContent = (doc.tags && doc.tags.length) ? doc.tags.join(', ') : 'no tags';
    renderDocList(el.docSearch.value);
  }

  function currentDoc() {
    return state.docs.find((d) => d.id === state.activeDocId);
  }

  let saveTimer = null;
  function scheduleSave() {
    el.savedState.textContent = 'editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveActiveDocument, 600);
  }

  async function saveActiveDocument() {
    const doc = currentDoc();
    if (!doc) return;
    doc.title = el.docTitle.value.trim();
    doc.markdown = MaMarkdown.toMarkdown(el.editor);
    doc.updatedAt = Date.now();
    doc.dirty = true;
    await MaDB.putDocument(doc);
    updateWordCount(doc);
    renderDocList(el.docSearch.value);
    el.savedState.textContent = 'saved';
  }

  function updateWordCount(doc) {
    const count = MaMarkdown.wordCount(doc.markdown || '');
    el.wordCount.textContent = count + (count === 1 ? ' word' : ' words');
    if (doc.goal && doc.goal > 0) {
      el.goalStatus.textContent = Math.min(count, doc.goal) + ' / ' + doc.goal;
    } else {
      el.goalStatus.textContent = 'no goal';
    }
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    state.theme = theme;
  }

  // ---------- sync status ----------
  function setSyncStatus(label) {
    el.syncStatus.textContent = label;
  }
  function updateSyncStatusLabel() {
    setSyncStatus(MaSync.configured() ? 'connected' : 'offline');
  }

  // ---------- events ----------
  function wireEvents() {
    document.getElementById('newNotebookBtn').addEventListener('click', createNotebook);
    document.getElementById('newDocBtn').addEventListener('click', createDocument);
    document.getElementById('signInBtn').addEventListener('click', async () => {
      if (!MaSync.configured()) {
        alert('Add your Apps Script Web App URL to MA_CONFIG.appsScriptUrl in js/sync.js first — see apps-script/README.md.');
        return;
      }
      setSyncStatus('connecting…');
      try {
        await MaSync.ensureRootFolder();
        setSyncStatus('connected');
      } catch (e) {
        console.error(e);
        setSyncStatus('connection failed');
      }
    });
    document.getElementById('syncNowBtn').addEventListener('click', () => MaSync.syncAll(setSyncStatus));

    el.docSearch.addEventListener('input', () => renderDocList(el.docSearch.value));
    el.docTitle.addEventListener('input', scheduleSave);

    el.editor.addEventListener('input', () => {
      MaMarkdown.restyle(el.editor);
      scheduleSave();
    });
    el.editor.addEventListener('keyup', () => MaMarkdown.restyle(el.editor));
    el.editor.addEventListener('click', () => MaMarkdown.restyle(el.editor));
    el.editor.addEventListener('blur', () => MaMarkdown.restyle(el.editor));

    document.getElementById('focusBtn').addEventListener('click', () => {
      document.body.classList.toggle('focus-mode');
    });

    const themeBtn = document.getElementById('themeBtn');
    themeBtn.addEventListener('click', () => {
      el.themePopover.hidden = !el.themePopover.hidden;
    });
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.getAttribute('data-theme-choice');
        applyTheme(theme);
        await MaDB.setMeta('theme', theme);
        el.themePopover.hidden = true;
      });
    });
    document.addEventListener('click', (e) => {
      if (!el.themePopover.hidden && !el.themePopover.contains(e.target) && e.target.id !== 'themeBtn') {
        el.themePopover.hidden = true;
      }
    });

    if (el.menuBtn) {
      el.menuBtn.addEventListener('click', () => document.body.classList.toggle('nav-open'));
    }

    window.addEventListener('beforeunload', () => {
      // best-effort final local save; Drive sync is background-only
      const doc = currentDoc();
      if (doc) saveActiveDocument();
    });
  }

  init();
})();
