# RemNote Database Board

**The Notion-style database experience, inside RemNote.**

## Install on macOS

1. Install [Node.js 22 or newer](https://nodejs.org/en/download) and extract this bundle.
2. Run `Install-Mac.command`. The service starts automatically when you sign in.
3. In RemNote, open **Settings → Plugins → Build → Develop from localhost** and enter `http://localhost:8081`.
4. Zoom into an Advanced Table and click **Open board**.

## Install on Windows

1. Install Node.js 22 or newer and extract this bundle.
2. Run `Start-Windows.cmd` and keep the window open.
3. Load `http://localhost:8081` through RemNote's localhost development entry, then click **Open board** in an Advanced Table.

## Automatic updates

The service checks GitHub Releases on startup and every hour. New plugin versions are downloaded, verified, and activated automatically. Reopen the board or refresh RemNote to load the updated interface.

Each computer downloads its own updates. The last verified version stays available while offline. Older update caches are removed after a successful update.

## Use

Switch between **Table** and **Board**, create views with **+**, and choose filters, sorts, grouping, and visible properties. Drag cards to update their grouping property. Click a record to edit its full native note alongside the database.

Choose English or Simplified Chinese in **Settings → Plugin Settings → Database Board → Language**.

Sign in to the same RemNote account and knowledge base on each device to synchronize notes and views.

[Latest desktop bundle](https://github.com/Shawn-Bo/remnote-database-board/releases/latest/download/RemNote-Board-DesktopBundle.zip) · [User guide](https://github.com/Shawn-Bo/remnote-database-board#readme)
