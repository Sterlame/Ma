/* ===========================================================
   Ma — sync layer
   Talks to the Apps Script Web App (see /apps-script/Code.gs).
   Sync is always a background concern: local IndexedDB is the
   source of truth for the current editing session, Drive is
   the backup + cross-device copy.

   Set MA_CONFIG.appsScriptUrl below after you deploy the
   Apps Script Web App (Deploy > New deployment > Web app,
   execute as "User accessing the web app", access "Anyone
   with a Google account" — or restrict to specific testers).
   =========================================================== */

const MA_CONFIG = {
  // Paste your deployed Apps Script Web App URL here, e.g.
  // "https://script.google.com/macros/s/AKfycb.../exec"
  appsScriptUrl: ''
};

const MaSync = (() => {
  let syncing = false;

  function configured() {
    return !!MA_CONFIG.appsScriptUrl;
  }

  // POST as text/plain to sidestep a CORS preflight — the
  // Apps Script side reads e.postData.contents and parses JSON.
  async function call(action, payload) {
    if (!configured()) throw new Error('Ma is not connected to Drive yet.');
    const res = await fetch(MA_CONFIG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) throw new Error('Sync request failed: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async function ensureRootFolder() {
    return call('ensureRootFolder', {});
  }

  async function ensureNotebookFolder(notebookName) {
    return call('ensureNotebookFolder', { notebookName });
  }

  async function saveDocument(doc) {
    // doc: { id, notebookName, title, markdown, tags, updatedAt, driveFileId }
    return call('saveDocument', doc);
  }

  async function loadDocument(driveFileId) {
    return call('loadDocument', { driveFileId });
  }

  async function listRemoteDocuments(notebookName) {
    return call('listDocuments', { notebookName });
  }

  // Push every locally-dirty document. Called on an interval
  // and on demand from the "sync" button.
  async function syncAll(onStatus) {
    if (!configured()) { onStatus && onStatus('not connected'); return; }
    if (syncing) return;
    syncing = true;
    onStatus && onStatus('syncing');
    try {
      const docs = await MaDB.allDocuments();
      const dirty = docs.filter((d) => d.dirty);
      for (const doc of dirty) {
        const notebooks = await MaDB.listNotebooks();
        const notebook = notebooks.find((n) => n.id === doc.notebookId);
        const result = await saveDocument({
          id: doc.id,
          notebookName: notebook ? notebook.name : 'Unsorted',
          title: doc.title,
          markdown: doc.markdown,
          tags: doc.tags || [],
          updatedAt: doc.updatedAt,
          driveFileId: doc.driveFileId || null
        });
        doc.driveFileId = result.driveFileId;
        doc.dirty = false;
        await MaDB.putDocument(doc);
      }
      onStatus && onStatus('synced');
    } catch (err) {
      console.error(err);
      onStatus && onStatus('sync error');
    } finally {
      syncing = false;
    }
  }

  return {
    configured,
    ensureRootFolder,
    ensureNotebookFolder,
    saveDocument,
    loadDocument,
    listRemoteDocuments,
    syncAll
  };
})();
