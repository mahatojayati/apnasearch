// 1. Setup IndexedDB for persistent local storage of photos & videos
const DB_NAME = "PersonalMediaSearchDB";
const STORE_NAME = "mediaItems";
let db;
let activeFilter = "all";

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// 2. Save uploaded files to IndexedDB
function saveMediaItem(item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 3. Retrieve all media items
function getAllMedia() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 4. Delete media item
function deleteMedia(id) {
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  tx.oncomplete = () => runSearch();
}

// 5. Search & Relevance Scoring Engine
function scoreItem(item, queryTokens) {
  if (queryTokens.length === 0) return 1; // Show all when search bar is empty

  const titleText = item.name.toLowerCase();
  const descText = item.description.toLowerCase();
  const typeText = item.type.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    // Description matches carry highest weight
    if (descText.includes(token)) score += 10;
    // File name matches carry medium weight
    if (titleText.includes(token)) score += 5;
    // Media type matches ("photo", "image", "video")
    if (typeText.includes(token)) score += 3;
  }

  return score;
}

// 6. Render matching items
async function runSearch() {
  const allItems = await getAllMedia();
  const rawQuery = document.getElementById("searchInput").value.trim().toLowerCase();
  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

  // Filter by type & calculate search relevance score
  const results = allItems
    .filter((item) => activeFilter === "all" || item.type === activeFilter)
    .map((item) => ({ ...item, score: scoreItem(item, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);

  renderGrid(results, rawQuery);
}

function renderGrid(items, query) {
  const grid = document.getElementById("mediaGrid");
  const countLabel = document.getElementById("resultCount");
  grid.innerHTML = "";

  countLabel.textContent = query
    ? `Found ${items.length} matching result(s) for "${query}"`
    : `Showing ${items.length} item(s) in your library`;

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state">No photos or videos matched your search. Try uploading some or using different keywords!</div>`;
    return;
  }

  items.forEach((item) => {
    const fileURL = URL.createObjectURL(item.fileBlob);
    const card = document.createElement("div");
    card.className = "card";

    const mediaElement =
      item.type === "video"
        ? `<video src="${fileURL}" controls preload="metadata"></video>`
        : `<img src="${fileURL}" alt="${item.description}" loading="lazy" />`;

    card.innerHTML = `
      <div class="media-wrapper">
        ${mediaElement}
        <span class="badge">${item.type}</span>
      </div>
      <div class="card-body">
        <div>
          <div class="card-title">${item.name}</div>
          <p class="card-desc">${item.description}</p>
        </div>
        <div class="card-footer">
          <span>${new Date(item.timestamp).toLocaleDateString()}</span>
          <button class="btn-delete" onclick="deleteMedia(${item.id})">Delete</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 7. Handle Upload Form Submission
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("fileInput");
  const descInput = document.getElementById("descInput");
  const files = Array.from(fileInput.files);

  if (!files.length) return;

  for (const file of files) {
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    await saveMediaItem({
      name: file.name,
      description: descInput.value.trim(),
      type: mediaType,
      fileBlob: file,
      timestamp: Date.now(),
    });
  }

  fileInput.value = "";
  descInput.value = "";
  runSearch();
});

// 8. Live Search & Filter Event Listeners
document.getElementById("searchInput").addEventListener("input", runSearch);

document.querySelectorAll(".pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    runSearch();
  });
});

// Initialize app on load
initDB().then(runSearch);
