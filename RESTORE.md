# Autism Allyship content backup

A nightly copy of the foundation's published Firestore content, kept as plain JSON so it can be
read, diffed and restored without any special tooling.

This exists because Firestore's own scheduled export writes to Google Cloud Storage, which needs
a billing account, and this project deliberately has no payment card on any account.

## What is in here

| File | Holds |
|---|---|
| `data/resources.json` | The support service directory |
| `data/galleries.json` | Album records: title, year, cover, and the ordered image list |
| `data/events.json` | Published events |
| `data/posts.json` | Published blog articles, including the full body text |

One file per collection. Each is an array of documents, each with its Firestore document `id`
followed by its fields, keys sorted alphabetically.

## What is deliberately not in here

**Unpublished drafts.** The export reads the database the same way a visitor's browser does, and
the security rules only expose published content. A draft event or article is invisible to this
backup. Adding drafts would mean putting a Firestore credential into GitHub Actions, which is a
poor trade for content that is not live.

**Anything holding personal information.** `tickets`, `submissions`, `donations`, `staff` and
`admins` are all excluded on purpose. They contain attendee names, email addresses, phone numbers
and contact form messages, which are personal information under POPIA. Git history is permanent:
a record committed here could not be fully removed later if someone asked for their data to be
deleted. If one of those collections ever has to be exported, do it manually and keep the file out
of any repository.

**The uploaded files themselves.** Photographs, images and attachments live in the website
repository at `assets/uploads/`, which is already version controlled. This backup holds the
records that point at them. The two together are the complete picture.

**`site_settings`.** As of 4 September 2026 the `site_settings/main` document does not exist, so
there is nothing to export. The site runs on its built-in fallbacks. If that document is ever
created, add `site_settings` to the `OPEN` list in `backup.js`.

## How it runs

A GitHub Actions workflow runs `backup.js` at 03:00 SAST every night and commits the result, but
only when something actually changed. An unchanged database produces byte-identical files, so
quiet weeks leave no commits at all.

It needs no secrets and no credentials. It reads the same public data any visitor's browser reads.

Run it by hand from the Actions tab with **Run workflow**, or locally:

```powershell
node backup.js
```

Node 18 or later. There are no dependencies to install.

**One thing to know:** GitHub disables scheduled workflows on a repository with no activity for
60 days, and emails the owner first. A nightly commit usually counts as activity, but a long
quiet period could trip it. If the backups stop, check the Actions tab for a disabled schedule
and re-enable it.

## Restoring

There is no automatic restore, and that is deliberate: a script that writes to production
Firestore would need admin credentials and could do a great deal of damage if it ran by accident.
Restoring is a considered act, not a button.

**To restore a single record**, which is the common case after an accidental deletion:

1. Find the record in the relevant `data/*.json` file.
2. Open the admin panel and re-create it, copying the field values across.

The `id` field is the Firestore document ID. For events this matters: a ticket references its
event by that ID, so recreating an event with a new ID orphans any existing tickets. Recreate it
through the Firebase console using the original ID rather than through the admin panel, which
generates a new one.

**To restore a gallery album**, the image files are already in the website repository at the paths
listed in `images`. Recreate the album record with the same `url` and `thumbUrl` values and the
photographs reappear. Keep the array in its existing order, which is the display order.

**To restore everything**, work through the collections in this order: `resources`, then `posts`,
then `galleries`, then `events`. Events last, because ticket records reference them.

## Checking a backup is current

```powershell
git log -1 --format="%ad  %s" --date=short
```

If the newest commit is old, either nothing has changed on the site or the schedule has been
disabled. Check the Actions tab to tell the two apart.
