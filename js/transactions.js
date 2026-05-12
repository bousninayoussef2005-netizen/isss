function renderTxTable(list) { const t = document.getElementById("tx-tbody"); if (!t) return; t.innerHTML = ""; list.forEach(tx => { const dd = tx.dueDate ? daysUntil(tx.dueDate) : null; const isOverdue = tx.type === "borrow" && dd !== null && dd < 0; t.innerHTML += `<tr><td class="mono bold-cell">${tx.student_uid}</td><td class="mono muted-cell">${tx.book_id}</td><td>${tx.book_title}</td><td><span class="badge ${tx.type}">${tx.type}</span></td><td class="mono" title="${tx.timestamp}">${relTime(tx.timestamp)}</td><td class="mono">${tx.dueDate || "—"}</td><td>${isOverdue ? `<span class="badge overdue">${Math.abs(dd)}d overdue</span>` : dd !== null ? `${dd}d left` : ""}</td></tr>`; }); const cnt = document.getElementById("tx-count"); if (cnt) cnt.textContent = list.length + " results"; }
function bindTxSearch() { renderTxTable(transactions); }
function filterTx() { const q = (document.getElementById("tx-search")?.value || "").toLowerCase(); renderTxTable(transactions.filter(t => t.student_uid.toLowerCase().includes(q) || t.book_id.toLowerCase().includes(q) || t.book_title.toLowerCase().includes(q) || t.type.includes(q))); }

function openManualCheckout() {
  const stuOpts = students.filter(s => s.status === "active").map(s => `<option value="${s.id}">${s.id} — ${s.name}</option>`).join("");
  const bookOpts = books.filter(b => b.available > 0 && b.status !== "missing").map(b => `<option value="${b.id}">${b.id} — ${b.title} (${b.available} left)</option>`).join("");
  if (!bookOpts) return showToast("No books available for checkout", "warning");
  openModal("Manual Checkout", `
    <div class="form-group"><label>Student</label><select id="mc-stu">${stuOpts}</select></div>
    <div class="form-group"><label>Book</label><select id="mc-book">${bookOpts}</select></div>
    <div class="form-group"><label>Due Date</label><input type="date" id="mc-due"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-blue" onclick="doCheckout()">Checkout</button>`
  );
  document.getElementById("mc-due").valueAsDate = new Date(Date.now() + 14 * 86400000);
}

function openManualReturn() {
  const borrowed = transactions.filter(t => t.type === "borrow" && !transactions.find(r => r.type === "return" && r.book_id === t.book_id && r.student_uid === t.student_uid && new Date(r.timestamp) > new Date(t.timestamp)));
  const opts = borrowed.map(t => `<option value="${t.student_uid}|${t.book_id}">${t.student_uid} → ${t.book_id} (${t.book_title})</option>`).join("");
  if (!opts) return showToast("No active borrows to return", "warning");
  openModal("Manual Return", `<div class="form-group"><label>Select Borrow Record</label><select id="mr-sel">${opts}</select></div>`, `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-green" onclick="doReturn()">Return</button>`);
}
