# Future hosting option — deferred

No server work is required now. Reconsider only after the local website's reading quality and full interaction loop are accepted and hosting is explicitly requested. No provider selection, account, domain, credential or server inventory is needed for implementation.

The current static application can later be served behind private HTTPS access. Authentication and network exposure must then be designed for the actual server; hiding a URL is not access control. A static content library can move independently of personal records. Cross-device notes need an explicit server store and conflict rules; merely copying dist/ does not synchronize IndexedDB.

An installable Android/desktop PWA can be assessed then. HTTPS, manifest details and device/browser behavior matter; a service worker is not an unconditional prerequisite for every browser installation route. Installation does not imply offline reading. Test actual target-device launch, source-return and expired-auth behavior before claiming success.

If personal records later move to SQLite, define migrations, consistent backups, external assets and a tested restore. In WAL mode, copying the running main database file alone is not a complete backup. Current JSON export/import provides an explicit transition path; do not silently read earlier sites or browser origins.

Future decisions: target OS/runtime, private access method, HTTPS arrangement, record migration consent, backup/restore requirements and whether offline reading is actually needed. Cloud automation, native apps, queues and server-side AI remain optional separate work.

Official evidence is listed in REFERENCES.md. This note makes no deployment claim.
