const MAX_STUDENT_BORROWS = 3;

function getMyActiveBorrowTransactions() {
  if (!currentUser?.id) return [];
  const my = (transactions || []).filter((t) => t.student_uid === currentUser.id);
  return my.filter(
    (t) =>
      t.type === "borrow" &&
      !my.some((r) => r.type === "return" && r.book_id === t.book_id && new Date(r.timestamp) > new Date(t.timestamp))
  );
}

function isBookCheckedOutByMe(bookId) {
  return getMyActiveBorrowTransactions().some((t) => t.book_id === bookId);
}

function atLimitBorrow() {
  return getMyActiveBorrowTransactions().length >= MAX_STUDENT_BORROWS;
}

function renderMyBooks() {
  const tb = document.getElementById("mybooks-tbody");
  if (!tb) return;
  const my = transactions.filter(t => t.student_uid === currentUser.id);
  const borrowed = my.filter(t => t.type === "borrow" && !my.find(r => r.type === "return" && r.book_id === t.book_id && new Date(r.timestamp) > new Date(t.timestamp)));
  const returned = my.filter(t => t.type === "return");
  renderBorrowSummary(borrowed);
  const all = [...borrowed.map(t => ({ ...t, currentStatus: "borrowed" })), ...returned.map(t => ({ ...t, currentStatus: "returned" }))];
  document.getElementById("mybooks-count").textContent = all.length + " records";
  if (!all.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No history</td></tr>`;
    return;
  }
  tb.innerHTML = "";
  all.forEach(t => {
    const dd = t.dueDate ? daysUntil(t.dueDate) : null;
    const isOverdue = t.currentStatus === "borrowed" && dd !== null && dd < 0;
    const statusCell = t.currentStatus === "borrowed"
      ? (isOverdue ? `<span class="badge overdue">${Math.abs(dd)}d overdue</span>` : `<span class="badge borrow">${dd}d left</span>`)
      : `<span class="badge return">returned</span>`;
    const actionCell = t.currentStatus === "borrowed"
      ? `<button class="btn btn-green btn-sm" onclick="stuReturnBook('${t.book_id}')">Return</button>`
      : "—";
    tb.innerHTML += `<tr><td class="mono muted-cell">${t.book_id}</td><td class="bold-cell">${t.book_title}</td><td class="mono">${relTime(t.timestamp)}</td><td class="mono">${t.dueDate || "—"}</td><td>${statusCell}</td><td>${actionCell}</td></tr>`;
  });
}

function renderBorrowSummary(activeBorrows) {
  const badge = document.getElementById("borrow-summary-badge");
  if (badge) {
    badge.textContent = `${activeBorrows.length} active / ${MAX_STUDENT_BORROWS} max`;
  }

  const dueSoonBox = document.getElementById("due-soon-list");
  if (!dueSoonBox) return;
  const dueSoon = activeBorrows
    .map(t => ({ ...t, daysLeft: daysUntil(t.dueDate) }))
    .filter(t => t.daysLeft !== null && t.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!dueSoon.length) {
    dueSoonBox.innerHTML = `<div class="empty-state"><div class="icon">✅</div><p>No books due in the next 3 days.</p></div>`;
    return;
  }

  dueSoonBox.innerHTML = dueSoon.map(t => {
    const urgency = t.daysLeft < 0 ? "overdue" : t.daysLeft === 0 ? "today" : `${t.daysLeft} day${t.daysLeft > 1 ? "s" : ""}`;
    return `<div class="alert-item"><div class="alert-icon warning">⏰</div><div style="flex:1"><div class="alert-text"><strong>${t.book_title}</strong> (${t.book_id})</div><div class="alert-time">Due ${t.dueDate} · ${urgency}</div></div></div>`;
  }).join("");
}

function updateCatalogUserStatus() {
  const el = document.getElementById("catalog-user-status");
  if (!el) return;
  if (!currentUser?.id) {
    el.innerHTML = "";
    return;
  }
  const active = getMyActiveBorrowTransactions();
  const n = active.length;
  const left = Math.max(0, MAX_STUDENT_BORROWS - n);
  const atLimit = n >= MAX_STUDENT_BORROWS;
  el.innerHTML = atLimit
    ? `<strong>Your borrowing status:</strong> ${n} / ${MAX_STUDENT_BORROWS} books out — you are at the limit. Return a book to borrow another.`
    : `<strong>Your borrowing status:</strong> ${n} / ${MAX_STUDENT_BORROWS} books out — ${left} slot${left !== 1 ? "s" : ""} left.`;
}

function renderCatalog() {
  updateCatalogUserStatus();
  const g = document.getElementById("catalog-grid");
  if (!g) return;
  const q = (document.getElementById("catalog-search")?.value || "").toLowerCase();
  const list = q ? books.filter(b => b.title.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || (b.barcode || "").toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.category.toLowerCase().includes(q)) : books;
  g.innerHTML = "";
  if (!list.length) {
    g.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>No books found</p></div>';
    return;
  }
  const limit = atLimitBorrow();
  list.forEach(b => {
    const available = b.available > 0 && b.status !== "missing";
    const onMe = isBookCheckedOutByMe(b.id);
    const outBadge = onMe ? `<div class="catalog-out-badge">On your account</div>` : "";
    const btnLabel = onMe ? "Already borrowed" : !available ? "Unavailable" : limit ? "Borrow limit" : "Borrow";
    const canBorrow = available && !onMe && !limit;
    g.innerHTML += `<div class="book-card"><div class="book-card-title">${b.title}</div><div class="book-card-id">${b.id} · ${b.category}</div><div class="book-card-meta">by ${b.author}</div><div class="book-card-bottom"><span class="badge ${available ? "available-b" : "checked-out-b"}">${available ? b.available + " available" : (b.status === "missing" ? "Missing" : "All out")}</span><span class="book-qty">${b.qty} total</span></div>${outBadge}<div style="margin-top:10px"><button class="btn btn-blue btn-sm" ${canBorrow ? "" : "disabled"} onclick="stuBorrowBook('${b.id}')">${btnLabel}</button></div></div>`;
  });
}

async function stuBorrowBook(bookId) {
  if (!currentUser?.id) return;
  if (!window.studentBorrowBook) return showToast("Borrow service unavailable", "danger");
  try {
    await window.studentBorrowBook(currentUser.id, bookId);
    showToast("Book borrowed successfully!", "success");
    renderTab();
  } catch (err) {
    showToast(err.message || "Borrow failed", "danger");
  }
}

async function stuReturnBook(bookId) {
  if (!currentUser?.id) return;
  if (!window.studentReturnBook) return showToast("Return service unavailable", "danger");
  try {
    await window.studentReturnBook(currentUser.id, bookId);
    showToast("Book returned successfully!", "success");
    renderTab();
  } catch (err) {
    showToast(err.message || "Return failed", "danger");
  }
}

function notifyDueSoonBooks() {
  if (!currentUser || currentUser.role !== "student") return;
  const userKey = `${currentUser.id}-due-soon`;
  if (window._dueSoonNotifiedKey === userKey) return;

  const my = (transactions || []).filter(t => t.student_uid === currentUser.id);
  const activeBorrows = my.filter(t =>
    t.type === "borrow" &&
    !my.some(r => r.type === "return" && r.book_id === t.book_id && new Date(r.timestamp) > new Date(t.timestamp))
  );
  const dueSoon = activeBorrows.filter(t => {
    const left = daysUntil(t.dueDate);
    return left !== null && left <= 3;
  });

  if (dueSoon.length) {
    const titles = dueSoon.slice(0, 2).map(t => t.book_title).join(", ");
    const more = dueSoon.length > 2 ? ` +${dueSoon.length - 2} more` : "";
    showToast(`Reminder: ${dueSoon.length} book(s) due in 3 days or less (${titles}${more}).`, "warning", 7000);
  }

  window._dueSoonNotifiedKey = userKey;
}

window.notifyDueSoonBooks = notifyDueSoonBooks;
