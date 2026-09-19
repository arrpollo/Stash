# Stash — Saved posts for Reddit

A local Chrome extension for finding your saved Reddit posts and comments, especially when your saved list has grown out of hand.

**Free and open source, created by [Arthit Napradit](https://github.com/arrpollo).**

Use, modify, and share Stash under the [MIT license](LICENSE). Keep the copyright and license notice when redistributing it. Bundled fonts retain their own SIL Open Font Licenses.

[Website](https://stashreddit.vercel.app) · [Download the source ZIP](https://github.com/arrpollo/Stash/archive/refs/heads/main.zip) · [Source code](https://github.com/arrpollo/Stash)

## Install in Chrome

1. Keep the **extension** folder somewhere permanent on your computer. If you downloaded the ZIP, unzip it first.
2. Open **chrome://extensions** in Chrome.
3. Enable **Developer mode** at the top right.
4. Click **Load unpacked** and select the **extension** folder, the one containing **manifest.json**.
5. Pin **Stash — Saved posts for Reddit** from Chrome’s Extensions menu.
6. Sign in to Reddit in the same Chrome profile. Click the Stash icon, then **Sync Reddit**. Keep the library tab open until sync finishes.

There is no build step, Stash account, or API key to set up. This is an unpacked extension, not a Chrome Web Store listing. Chrome 120 or newer is required.

To apply an update, replace the files in the same extension folder (if using a downloaded ZIP), open **chrome://extensions**, click **Reload** on Stash, then close and reopen the Stash tab and refresh any open Reddit tabs. Reloading keeps your local library; do not uninstall or clear it.

Version **1.2.3** fixes the **“Extension context invalidated”** error that could appear after reloading or updating Stash while Reddit was open. The old playback scripts now stop cleanly when disconnected, cancel pending lookups, and restore the original player. Refresh open Reddit tabs after reloading Stash to activate the updated scripts. Existing entries in Chrome’s extension error list are historical; use **Clear all** to remove them after updating. No new permissions or library sync are needed.

Version **1.0.1** fixes saved-item validation for profile communities with hyphenated names and profile-post links. It recovers missing IDs and links when other Reddit fields provide enough information. Unreadable individual entries are skipped and counted in the sync summary instead of aborting a whole sync. An entirely unreadable response still fails safely and preserves your existing library. Backup imports remain strict.

Version **1.0.2** adds **Display size** (100–200%) and a **Post title font** choice in **Settings & backups**. You can also use the display-settings icon at the top right. Changes preview immediately and are saved for this Chrome profile. Try **150%** for a large monitor. **Reset display settings** restores the original size and title font without clearing your library or other preferences.

Version **1.1.0** adds more fonts, adjustable page sizes, continuous scrolling, and optional media thumbnails. Open **Settings & backups** to customize them; changes save automatically:

- **Reading font:** Choose System default, Atkinson Hyperlegible, Lexend, Verdana, Trebuchet, or Georgia. Atkinson Hyperlegible and Lexend are bundled and work offline. You can choose a separate post title font or **Match reading font**. Reset display settings now resets both fonts and the display size.
- **Browsing style:** Keep previous/next pages or choose **Continuous scrolling · load as I scroll** to append more synced saves near the bottom. Search and subreddit filters still apply.
- **Posts per page or scroll batch:** Choose **15, 30, 60, or 100**. Continuous scrolling also has a **Load more** button.
- **Show media thumbnails:** Compact previews for images, galleries, GIFs, and videos. **Sync Reddit once after updating from a version before 1.1.0** to collect available previews for older saves. GIFs and videos show still images. Some posts have no usable preview, and deleted or expired images may be unavailable.

Version **1.1.1** makes media thumbnails **on by default** and adds a separate **Show NSFW thumbnails** switch, **off by default**. Enabling it shows available NSFW previews automatically; turning it off hides them again, with an individual click still available to reveal a preview. Spoiler previews continue to require a click. The main thumbnail switch controls all previews. Both choices save automatically, and an existing choice to turn thumbnails off is preserved. No new sync is needed if your library already has preview data from 1.1.0.

## What it does

Version **1.2.2** automatically tries Reddit’s retained video copy when a RedGIFs player reports a loading error, both on opened posts and in feeds such as **Saved**, subreddit feeds, and the home feed. Each card uses its own post’s copy, including cards added as you scroll. Automatic lookups wait until the card is onscreen, with at most two lookups running together. Replacement videos pause when offscreen or in a background tab and resume on return if they were playing; a deliberate pause stays paused. Working, paused, or merely slow original players are left alone. Automatic playback starts muted; **Original player** switches back for that card and suppresses another automatic attempt until you leave or refresh the page. **Play Reddit copy** remains available for manual retries and black-screen failures that do not report an error. This works only when Reddit still provides a playable copy; previews may be shorter or silent. It does not repair RedGIFs itself. No post-data or video requests are made by this feature until an embed failure is detected or you click the button. Your saved library is unchanged. Reload Stash in Chrome and refresh an existing Reddit tab after updating. Old Reddit is not supported by this playback control. Updating from 1.2.1 needs no additional permissions.

- **Filter by subreddit:** Search your communities and select one or several. Selected communities are combined; search, reading, and content-type filters narrow those results.
- **Search your saves:** Titles, post text, saved comment text, subreddit names, and authors. Multiple search words must all match.
- **Favorites:** Star the best finds without changing their saved status on Reddit.
- **Reading queue:** “To read” and “Finished,” with explicit mark-read controls. Opening a post does not automatically mark it read.
- **Saved posts and comments:** Separate filters, text previews, and direct links to Reddit.
- **Sort:** Reddit’s saved order, newest/oldest posted, or top scored. Displayed dates are posting dates, not saving dates.
- **Grid and list layouts:** Responsive layout, keyboard navigation, and / to focus search.
- **Comfortable reading:** Adjustable display size enlarges text, controls, icons, and the sidebar together. Choose from six reading fonts and customize post titles separately. The card layout adapts to the available space.
- **Flexible browsing:** Choose how many saves appear per page, or keep scrolling to load more from your synced library.
- **Optional media previews:** Small thumbnails with image, gallery, GIF, or video labels, in both grid and list layouts.
- **In-page playback fallback:** Automatically try Reddit’s video copy when a RedGIFs embed reports a loading error, directly in the post or feed card.
- **Offline library:** Cached text remains searchable without a connection.
- **Unsave:** An explicit confirmation removes the item from Reddit and its local copy. The signed-in account is checked first.
- **Backups:** Export/import Stash JSON files with text, favorites, and reading status. Import merges the same account’s items without changing Reddit.
- **Sample library:** Fictional example posts, isolated from your real library. No live account requests or destructive Reddit actions run in sample mode.

## Reddit access and history limits

Stash calls Reddit’s session-authenticated JSON endpoints directly from an extension page with the browser’s existing login. It does not request your password or read cookie values. This relies on Reddit continuing to permit those endpoints for your session; it is **not a guarantee of API availability**, and does not establish eligibility for public API distribution.

Reddit may return only a limited portion of saved history. Stash follows every available pagination cursor and reports the number fetched. It cannot recover saves Reddit does not expose. Exact saved timestamps are not provided, so “Recently saved” uses the returned listing order.

Items absent from a later sync remain in the library with a **Previously cached** label, after the current listing. This preserves older finds but can include items unsaved elsewhere. Importing a backup also labels new local items as previously cached. Stash never claims those entries are still saved on Reddit.

Sync is manual. Closing the tab cancels an unfinished sync; the last successfully saved library is kept. Retries respect short Reddit rate-limit delays and otherwise stop with a useful error. Simultaneous writes from other Stash tabs are prevented. Export and clear your local library before switching accounts.

If sync does not work:

1. Open Reddit in the same Chrome profile and confirm you are logged in; complete any normal browser check.
2. Check that Chrome allows the extension’s access to Reddit in the extension’s site-access settings.
3. In **Settings & backups**, choose the Reddit version you use (www or old) and retry.
4. If Reddit still denies session access, keep using your cached library or import a Stash backup. The extension does not bypass Reddit access restrictions.

Before a public release, review Reddit’s current developer access requirements and Chrome Web Store policies. This project is designed for local installation.

## Privacy and permissions

Your library and settings stay in this Chrome profile. Sync and unsave requests go directly to Reddit. Optional thumbnails load from Reddit image servers when enabled; fonts are bundled with the extension. There are no analytics, hosted backend, font downloads, or remote executable code. Cached text works offline; thumbnails need an internet connection or a copy already in the browser cache.

- **storage:** saves the library and settings locally, not to Chrome Sync.
- **unlimitedStorage:** prevents the usual local storage quota from cutting off a large text library.
- **www.reddit.com and old.reddit.com host access:** allows authenticated sync and explicit unsave requests. A content script on www.reddit.com also adds the playback control to supported posts and reads that post’s JSON after a detected player error or a click.
- **RedGIFs embedded-player access:** a content script is limited to HTTPS `redgifs.com/ifr/*` and `www.redgifs.com/ifr/*`. It observes loading errors inside embedded players and sends an error signal through Stash to the Reddit post in the same tab. It does not run on RedGIFs watch pages or report standalone tabs. Chrome may show an additional RedGIFs site-access warning when updating from 1.2.0.

The playback content scripts cannot read Stash’s saved library. There is no general browsing-history permission or cookie-reading permission. Uninstalling the extension or clearing its data deletes its local library. Export a backup first. See [PRIVACY.md](PRIVACY.md).

## Preview and development

Node.js 20+ is used for development scripts only; no runtime dependencies are needed by the extension.

    npm run dev
    npm test
    npm run package

Open **http://127.0.0.1:4173/?demo=1** for the fictional sample library, or **http://127.0.0.1:4173/** for the first-run screen.

The ordinary web preview cannot access your Reddit session or persist a real library. Only the installed extension can do that. The ZIP in **dist/** contains the loadable extension plus these instructions and the privacy notice.

For the optional browser integration test, install Playwright as a development tool, install its Chromium browser, and run:

    npm install --no-save playwright
    npx playwright install chromium
    node tests/browser.mjs
    node tests/features-browser.mjs

Alternatively set PLAYWRIGHT_MODULE to an existing Playwright ES module path. The browser test creates and removes its own temporary Chromium profile, loads the actual extension, intercepts Reddit requests with test responses, and writes screenshots and results to **artifacts/**.

## Technical notes

Manifest V3, plain ES modules, HTML, and CSS. The action worker opens or focuses a single library tab; syncing lives in that tab to avoid service-worker suspension halfway through a large fetch. Successful sync is committed once, after identity checks and pagination finish. Local writes use Web Locks. Data from Reddit or backups is inserted as text; links are restricted to HTTPS Reddit post/comment permalinks. Imported JSON is validated and limited to 50 MB / 50,000 items.

Tests cover combined filters, ordering, normalization, backup validation and merge, account separation, pagination, duplicate pages, partial failures, rate limiting, cancellation, and unsave checks. Additional checks cover bundled font loading, preference persistence, page sizes, continuous scrolling without duplicate cards, thumbnail extraction and URL validation, preview controls, and older backups. Browser integration verification uses mocked Reddit responses and images. It verifies extension loading, storage, and UI integration; it does not verify acceptance by a logged-in live Reddit account.

Bundled font sources and licenses are listed in [extension/fonts/README.md](extension/fonts/README.md).

Official implementation references: [Reddit API](https://www.reddit.com/dev/api/), [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [Chrome storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).

## Website

The launch website is in `website/`. Preview it with `npm run dev:website`.
Vercel serves that directory using the root `vercel.json`. The website and extension are independent; the website never accesses your saved library.
