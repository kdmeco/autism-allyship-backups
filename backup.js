// Pulls the foundation's published Firestore content into plain JSON files.
//
// No credential is needed and none should be added. The security rules already
// allow anyone to read galleries outright, and to read events, posts and
// resources as long as the query filters on published == true. That is exactly
// what a visitor's browser does, so this script is doing nothing a member of
// the public could not do. Adding a service account here would put a
// Firestore-wide credential into GitHub Actions to fetch content that is
// already public.
//
// The trade is that unpublished drafts are invisible to this. That is recorded
// in RESTORE.md rather than worked around.

const PROJECT = "autism-allyship";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Collections readable without a filter, because their rule is `allow read: if true`.
const OPEN = ["galleries"];

// Collections whose rule is `allow read: if resource.data.published == true`.
// Firestore refuses to list these at all unless the query carries the same
// condition, so a plain fetch returns 403 and a filtered query returns rows.
const PUBLISHED = ["resources", "events", "posts"];

// Firestore returns every value wrapped in its type, for example
// { stringValue: "x" }. Unwrapping makes the committed files readable in a
// diff, which is the whole point of backing up to Git rather than to a blob.
function decode(value) {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  throw new Error("Unknown Firestore value type: " + JSON.stringify(value));
}

// Keys are sorted so an unchanged document always serialises identically.
// Without this the file churns on every run and the workflow commits daily
// whether anything changed or not.
function decodeFields(fields) {
  const out = {};
  for (const key of Object.keys(fields).sort()) {
    out[key] = decode(fields[key]);
  }
  return out;
}

function idOf(name) {
  return name.split("/").pop();
}

async function fetchOpen(collection) {
  const documents = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${collection}?pageSize=300${pageToken ? "&pageToken=" + pageToken : ""}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${collection}: HTTP ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    for (const doc of body.documents || []) {
      documents.push({ id: idOf(doc.name), ...decodeFields(doc.fields || {}) });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function fetchPublished(collection) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: "published" },
          op: "EQUAL",
          value: { booleanValue: true },
        },
      },
    },
  };
  const response = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${collection}: HTTP ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  return rows
    .filter((row) => row.document)
    .map((row) => ({ id: idOf(row.document.name), ...decodeFields(row.document.fields || {}) }));
}

async function main() {
  const fs = await import("node:fs/promises");
  const summary = [];
  let failed = false;

  for (const collection of [...OPEN, ...PUBLISHED]) {
    try {
      const documents = OPEN.includes(collection)
        ? await fetchOpen(collection)
        : await fetchPublished(collection);

      // Sorting by id keeps the file order stable between runs. Firestore does
      // not promise a consistent order, so without this the diff is noise.
      documents.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      await fs.writeFile(
        `data/${collection}.json`,
        JSON.stringify(documents, null, 2) + "\n",
        "utf8",
      );
      summary.push(`${collection}: ${documents.length}`);
    } catch (error) {
      // One collection failing must not silently produce a partial backup that
      // looks complete. Report it and exit non-zero so the workflow goes red.
      console.error(`FAILED ${collection}: ${error.message}`);
      failed = true;
    }
  }

  console.log(summary.join("\n"));
  if (failed) {
    process.exit(1);
  }
}

main();
