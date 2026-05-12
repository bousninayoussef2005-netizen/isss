const BOOK_SEARCH_DEFAULT_PLACEHOLDER =
  "Search by title, ID, barcode, author, or category...";

/** USB scanners often end with Enter, or deliver the whole code in one input burst. */
function bindBarcodeScanAdvance(barcodeId, nextFieldId) {
  const bc = document.getElementById(barcodeId);
  const next = document.getElementById(nextFieldId);
  if (!bc || !next) return;
  let prevLen = 0;
  bc.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next.focus();
    }
  });
  bc.addEventListener("input", () => {
    const len = bc.value.length;
    const delta = len - prevLen;
    prevLen = len;
    if (delta >= 4 && len >= 6) {
      requestAnimationFrame(() => next.focus());
    }
  });
}

function focusBookSearchByBarcode() {
  const el = document.getElementById("book-search");
  if (!el) return;
  el.value = "";
  el.dataset.barcodeScanMode = "1";
  el.placeholder = "Scan barcode to search…";
  filterBooks();
  el.focus();
  showToast("Scan the book barcode to search", "info");
}

function onBookSearchBlur() {
  const el = document.getElementById("book-search");
  if (!el || el.dataset.barcodeScanMode !== "1") return;
  el.dataset.barcodeScanMode = "";
  el.placeholder = BOOK_SEARCH_DEFAULT_PLACEHOLDER;
}

function updateBooksStaffStats() {
  const copiesEl = document.getElementById("stat-total-copies");
  const availableEl = document.getElementById("stat-available-books");
  const titlesEl = document.getElementById("stat-total-titles");
  const mostEl = document.getElementById("stat-most-borrowed");
  const metaEl = document.getElementById("stat-most-borrowed-meta");
  if (!copiesEl) return;
  const list = books || [];
  const totalCopies = list.reduce((s, b) => s + (Number(b.qty) || 0), 0);
  const totalAvailable = list.reduce((s, b) => s + (Number(b.available) || 0), 0);
  copiesEl.textContent = String(totalCopies);
  if (availableEl) availableEl.textContent = String(totalAvailable);
  if (titlesEl) titlesEl.textContent = `${list.length} title${list.length !== 1 ? "s" : ""} in catalog`;
  if (!mostEl) return;
  const borrows = (transactions || []).filter((t) => t.type === "borrow");
  const counts = {};
  borrows.forEach((t) => {
    if (!t.book_id) return;
    counts[t.book_id] = (counts[t.book_id] || 0) + 1;
  });
  let best = 0;
  Object.values(counts).forEach((c) => {
    if (c > best) best = c;
  });
  const topIds = Object.keys(counts).filter((id) => counts[id] === best);
  if (best === 0 || !topIds.length) {
    mostEl.textContent = "—";
    if (metaEl) metaEl.textContent = "No borrow transactions yet";
    return;
  }
  const names = topIds.map((id) => {
    const b = list.find((x) => x.id === id);
    return b ? b.title : id;
  });
  mostEl.textContent = names.length > 2 ? `${names.slice(0, 2).join(" · ")} (+${names.length - 2} tied)` : names.join(" · ");
  if (metaEl) metaEl.textContent = `${best} borrow${best !== 1 ? "s" : ""} recorded${topIds.length > 1 ? " (tied)" : ""}`;
}

function renderBookTable(list) {
  const t = document.getElementById("books-tbody"); if (!t) return; t.innerHTML = "";
  list.forEach(b => {
    t.innerHTML += `<tr>
      <td class="mono muted-cell">${b.id}</td>
      <td class="bold-cell">${b.title}</td>
      <td class="mono">${b.barcode || "-"}</td>
      <td>${b.author}</td>
      <td>${b.category}</td>
      <td class="mono">${b.qty}</td>
      <td class="mono">${b.available}</td>
      <td><span class="badge ${b.status === "missing" ? "missing-b" : "available-b"}">${b.status}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openEditBook('${b.id}')">Edit</button>
        <button class="btn btn-red btn-sm" onclick="deleteBook('${b.id}')">Del</button>
        ${b.status !== "missing" ? `<button class="btn btn-amber btn-sm" onclick="markMissing('${b.id}')">Missing</button>` : ""}
      </td>
    </tr>`;
  });
}

function markMissing(id) { const b = books.find(x => x.id === id); if (!b) return; b.status = "missing"; if (window._updateBookStatus) window._updateBookStatus(b.firebaseId, "missing"); renderTab(); showToast("Reported missing", "warning"); }
function bindBookSearch() {
  const c = document.getElementById("books-count");
  if (c) c.textContent = `${books.length} books`;
  updateBooksStaffStats();
  renderBookTable(books);
  const s = document.getElementById("book-search");
  if (s) {
    s.oninput = () => filterBooks();
    s.onblur = onBookSearchBlur;
  }
}
function filterBooks() { const q = (document.getElementById("book-search")?.value || "").toLowerCase(); renderBookTable(books.filter(b => b.title.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || (b.barcode || "").toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.category.toLowerCase().includes(q))); }

function openAddBookModal() {
  openModal("Add New Book", `
    <div class="form-group"><label>Barcode</label><input type="text" id="nb-barcode" placeholder="Scan barcode here"></div>
    <div class="form-group"><label>Title</label><input type="text" id="nb-title" placeholder="Book title"></div>
    <div class="form-group"><label>Author</label><input type="text" id="nb-author" placeholder="Author name"></div>
    <div class="form-row">
      <div class="form-group"><label>Category</label><select id="nb-cat">${CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select></div>
      <div class="form-group"><label>Quantity</label><input type="number" id="nb-qty" value="1" min="1"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-green" onclick="addBook()">Add Book</button>`
  );
  setTimeout(() => {
    document.getElementById("nb-barcode")?.focus();
    bindBarcodeScanAdvance("nb-barcode", "nb-title");
  }, 0);
}

function openEditBook(id) {
  const b = books.find(x => x.id === id);
  if (!b) return;
  openModal("Edit Book", `
    <div class="form-group"><label>Barcode</label><input type="text" id="eb-barcode" value="${b.barcode || ""}"></div>
    <div class="form-group"><label>Title</label><input type="text" id="eb-title" value="${b.title}"></div>
    <div class="form-group"><label>Author</label><input type="text" id="eb-author" value="${b.author}"></div>
    <div class="form-row">
      <div class="form-group"><label>Category</label><select id="eb-cat">${CATEGORIES.map(c => `<option ${c === b.category ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="form-group"><label>Quantity</label><input type="number" id="eb-qty" value="${b.qty}" min="1"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-green" onclick="saveEditBook('${id}')">Save</button>`
  );
  setTimeout(() => bindBarcodeScanAdvance("eb-barcode", "eb-title"), 0);
}
