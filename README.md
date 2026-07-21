# Deploying the Ma backend

Ma's frontend is a static site (GitHub Pages). It needs a small Apps
Script Web App to talk to Google Drive on your behalf. Each person who
uses Ma authorizes it against their **own** Drive — there's no shared
server or database.

## 1. Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Delete the default `Code.gs` contents and paste in this repo's
   `apps-script/Code.gs`.
3. Rename the project (top left) to something like "Ma backend".

## 2. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Settings:
   - **Execute as:** `User accessing the web app`
   - **Who has access:** `Anyone with a Google account`
4. Click **Deploy**. The first time, Google will ask you to authorize
   Drive access for your own account — approve it.
5. Copy the **Web app URL** (ends in `/exec`).

## 3. Add yourself + friends as test users

Since this app isn't published publicly, Google will show an
"unverified app" warning to anyone who signs in — including you. This
is expected for a personal tool and not a sign anything's wrong.

1. In the Apps Script editor, go to **Project Settings** (gear icon)
   or the linked Google Cloud project's **OAuth consent screen**.
2. Under "Test users," add the Google account email of anyone you
   want to be able to use Ma (yourself + up to ~100 others on the free
   tier).
3. When a test user first signs in through Ma, they'll see the
   warning screen — click **Advanced → Go to [project name] (unsafe)**
   to proceed. This only happens once per device.

## 4. Connect the frontend

Open `js/sync.js` in the repo and paste your Web app URL into:

```js
const MA_CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/XXXXXXXX/exec'
};
```

Commit and push — GitHub Pages will pick it up automatically.

## 5. Redeploying after changes

Every time you edit `Code.gs`, you need to **Deploy → Manage
deployments → Edit (pencil icon) → New version → Deploy** for the
changes to go live. Just saving the script isn't enough.

## What gets created in Drive

The first successful connection creates a folder named **Ma** at the
root of your Drive. Every notebook you create in the app becomes a
real subfolder inside it, and every document is saved as a `.md` file
with a small YAML frontmatter header (id, title, tags, updatedAt).
You can open, read, or move these files directly in Drive at any
time — nothing is locked into the app.
