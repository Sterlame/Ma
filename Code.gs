/**
 * Ma — Apps Script backend
 *
 * Deploy: Extensions > Apps Script (or script.google.com, new project),
 * paste this file in as Code.gs, then Deploy > New deployment > Web app.
 *   - Execute as: "User accessing the web app"
 *   - Who has access: "Anyone with a Google account" (or restrict via
 *     the OAuth consent screen's test users list for you + friends)
 * Copy the resulting /exec URL into MA_CONFIG.appsScriptUrl in js/sync.js.
 *
 * Because this runs "as the user accessing it", every person who uses
 * Ma authorizes it against their OWN Drive the first time they sign in.
 * There is no shared backend and no database — each person's "Ma" root
 * folder lives only in their own Drive.
 */

const ROOT_FOLDER_NAME = 'Ma';

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: 'Invalid request body' });
  }
  const action = body.action;
  const payload = body.payload || {};

  try {
    let result;
    switch (action) {
      case 'ensureRootFolder':
        result = { folderId: getRootFolder().getId() };
        break;
      case 'ensureNotebookFolder':
        result = { folderId: getNotebookFolder(payload.notebookName).getId() };
        break;
      case 'saveDocument':
        result = saveDocument(payload);
        break;
      case 'loadDocument':
        result = loadDocument(payload.driveFileId);
        break;
      case 'listDocuments':
        result = listDocuments(payload.notebookName);
        break;
      default:
        return jsonOut({ error: 'Unknown action: ' + action });
    }
    return jsonOut({ result: result });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doGet(e) {
  return jsonOut({ result: 'Ma backend is running.' });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- folders ----------

function getRootFolder() {
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function getNotebookFolder(notebookName) {
  const root = getRootFolder();
  const name = notebookName || 'Unsorted';
  const folders = root.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(name);
}

// ---------- documents ----------
// Stored as markdown files with YAML frontmatter, e.g.:
//
// ---
// id: abc123
// title: My essay
// tags: [wedding, reflection]
// updatedAt: 2026-07-20T18:00:00.000Z
// ---
// The actual document body follows.

function buildFileContents(doc) {
  const frontmatter = [
    '---',
    'id: ' + doc.id,
    'title: ' + (doc.title || 'Untitled'),
    'tags: [' + (doc.tags || []).join(', ') + ']',
    'updatedAt: ' + new Date(doc.updatedAt).toISOString(),
    '---',
    ''
  ].join('\n');
  return frontmatter + (doc.markdown || '');
}

function saveDocument(doc) {
  const folder = getNotebookFolder(doc.notebookName);
  const filename = (doc.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '-') + '.md';
  const contents = buildFileContents(doc);

  let file;
  if (doc.driveFileId) {
    try {
      file = DriveApp.getFileById(doc.driveFileId);
      file.setContent(contents);
      if (file.getName() !== filename) file.setName(filename);
    } catch (err) {
      file = null;
    }
  }
  if (!file) {
    // avoid duplicate files if one already exists with this name
    const existing = folder.getFilesByName(filename);
    if (existing.hasNext()) {
      file = existing.next();
      file.setContent(contents);
    } else {
      file = folder.createFile(filename, contents, MimeType.PLAIN_TEXT);
    }
  }
  return { driveFileId: file.getId() };
}

function loadDocument(driveFileId) {
  const file = DriveApp.getFileById(driveFileId);
  return { markdown: file.getBlob().getDataAsString(), name: file.getName() };
}

function listDocuments(notebookName) {
  const folder = getNotebookFolder(notebookName);
  const files = folder.getFilesByType(MimeType.PLAIN_TEXT);
  const out = [];
  while (files.hasNext()) {
    const f = files.next();
    out.push({
      driveFileId: f.getId(),
      name: f.getName(),
      updatedAt: f.getLastUpdated().toISOString()
    });
  }
  return out;
}
