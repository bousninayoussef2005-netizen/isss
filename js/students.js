function getStudentCurrentSeat(studentId) {
  const seat = (seats || []).find((s) => s.occupied && s.studentId === studentId);
  return seat ? seat.id : null;
}

function getStudentAwayTimer(studentId) {
  return (awayTimers || []).find((t) => t.studentId === studentId && awaySecondsLeft(t) > 0);
}

function getStudentPresence(studentId) {
  const timer = getStudentAwayTimer(studentId);
  if (timer) return { kind: "away", seatId: timer.seatId, timerLeft: awaySecondsLeft(timer), label: "Away" };
  const seatId = getStudentCurrentSeat(studentId);
  if (seatId) return { kind: "in", seatId, label: "In library" };
  return { kind: "offline", seatId: null, label: "Not here" };
}

function sortStudentsByPresence(list) {
  const rank = { in: 0, away: 1, offline: 2 };
  return [...list].sort((a, b) => {
    const pa = getStudentPresence(a.id).kind;
    const pb = getStudentPresence(b.id).kind;
    const diff = (rank[pa] ?? 99) - (rank[pb] ?? 99);
    if (diff !== 0) return diff;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function getStudentActiveBorrows(studentId) {
  return (transactions || []).filter((tx) =>
    tx.student_uid === studentId &&
    tx.type === "borrow" &&
    !(transactions || []).find((r) =>
      r.type === "return" &&
      r.book_id === tx.book_id &&
      r.student_uid === tx.student_uid &&
      new Date(r.timestamp) > new Date(tx.timestamp)
    )
  );
}

async function setStudentStatus(studentId, status) {
  const student = students.find((x) => x.id === studentId);
  if (!student) return;
  student.status = status;
  if (window.updateStudentStatusInFirestore) {
    try {
      await window.updateStudentStatusInFirestore(studentId, status);
    } catch (err) {
      console.error("Update student status error:", err);
      showToast("Could not sync student status to database", "warning");
    }
  }
  showToast(status === "banned" ? "Student banned" : "Student unbanned", status === "banned" ? "warning" : "success");
  renderTab();
}

async function kickStudentFromSeat(studentId) {
  const s = students.find((x) => x.id === studentId);
  if (!s) return;
  const presence = getStudentPresence(studentId);
  if (presence.kind === "offline") return showToast("Student is not currently in the library", "info");
  try {
    if (typeof adminCollect === "function" && presence.seatId) {
      await adminCollect(presence.seatId, studentId);
    } else {
      const seat = (seats || []).find((x) => x.id === presence.seatId);
      if (seat) {
        seat.occupied = false;
        seat.studentId = null;
      }
      awayTimers = (awayTimers || []).filter((t) => !(t.studentId === studentId && t.seatId === presence.seatId));
      showToast(`Removed ${s.name} from ${presence.seatId}`, "info");
      renderTab();
    }
    closeModal();
  } catch (err) {
    console.error("Kick student error:", err);
    showToast("Failed to remove student from seat", "danger");
  }
}

function renderStudentTable(list) {
  const t = document.getElementById("stu-tbody");
  if (!t) return;
  t.innerHTML = "";
  list.forEach((s) => {
    const activeBorrows = getStudentActiveBorrows(s.id);
    const bOut = activeBorrows.length;
    const overdue = activeBorrows.filter((tx) => tx.dueDate && daysUntil(tx.dueDate) < 0).length;
    const presence = getStudentPresence(s.id);
    const timerText = presence.kind === "away" ? ` (${formatTime(presence.timerLeft)})` : "";
    t.innerHTML += `<tr><td class="mono bold-cell">${s.id}</td><td>${s.name}</td><td class="muted-cell">${s.email}</td><td>${s.institution || "—"}</td><td>${s.department || "—"}</td><td class="mono">${bOut}</td><td class="mono">${overdue > 0 ? `<span class="badge overdue">${overdue}</span>` : "0"}</td><td><span class="presence-dot ${presence.kind === "in" ? "online" : presence.kind === "away" ? "away" : "offline"}"></span>${presence.kind === "in" ? "In library" : presence.kind === "away" ? "Away" : "Not here"}${timerText}</td><td><span class="badge ${s.status === "banned" ? "banned" : "active-badge"}">${s.status}</span></td><td><button class="btn btn-ghost btn-sm" onclick="viewStudentHistory('${s.id}')">History</button> <button class="btn btn-blue btn-sm" onclick="viewStudentDetails('${s.id}')">Details</button> ${s.status === "active" ? `<button class="btn btn-red btn-sm" onclick="confirmAction('Ban Student','Ban ${s.name}? They won\\'t be able to sign in.',()=>setStudentStatus('${s.id}','banned'))">Ban</button>` : `<button class="btn btn-green btn-sm" onclick="setStudentStatus('${s.id}','active')">Unban</button>`} ${overdue > 0 ? `<button class="btn btn-amber btn-sm" onclick="sendOverdueEmail('${s.id}')">Email</button>` : ""}</td></tr>`;
  });
}
function bindStudentSearch() { const c = document.getElementById("students-count"); if (c) c.textContent = `${students.length} students`; renderStudentTable(sortStudentsByPresence(students)); }
function filterStudents() { const q = (document.getElementById("stu-search")?.value || "").toLowerCase(); const filtered = students.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.institution || "").toLowerCase().includes(q) || (s.department || "").toLowerCase().includes(q)); renderStudentTable(sortStudentsByPresence(filtered)); }

function viewStudentDetails(sid) {
  const s = students.find((x) => x.id === sid);
  if (!s) return;
  const presence = getStudentPresence(sid);
  const entries = (seatTransactions || []).filter((tx) => tx.studentId === sid && tx.type === "sit").length;
  const activeBorrows = getStudentActiveBorrows(sid);
  const borrowRows = activeBorrows.length
    ? activeBorrows.map((tx) => `<tr><td>${tx.book_id}</td><td>${tx.book_title}</td><td class="mono">${tx.dueDate || "—"}</td></tr>`).join("")
    : `<tr><td colspan="3" class="muted-cell">No books currently borrowed.</td></tr>`;
  const seatText = presence.kind === "in"
    ? `Currently seated at <strong>${presence.seatId}</strong>.`
    : presence.kind === "away"
      ? `Temporarily away from <strong>${presence.seatId}</strong> · ${formatTime(presence.timerLeft)} left.`
      : "Student is not here (no seat occupied).";
  openModal(
    `${s.name} — Details`,
    `<div class="grid-3col" style="margin-bottom:14px">
      <div class="card"><div class="card-body" style="padding:14px"><div class="stat-label">Total entries</div><div class="stat-value" style="font-size:24px">${entries}</div></div></div>
      <div class="card"><div class="card-body" style="padding:14px"><div class="stat-label">Presence</div><div style="margin-top:6px"><span class="presence-dot ${presence.kind === "in" ? "online" : presence.kind === "away" ? "away" : "offline"}"></span>${presence.kind === "in" ? "In library" : presence.kind === "away" ? `Away (${formatTime(presence.timerLeft)})` : "Not here"}</div></div></div>
      <div class="card"><div class="card-body" style="padding:14px"><div class="stat-label">Current seat</div><div style="margin-top:6px">${presence.seatId || "—"}</div></div></div>
    </div>
    <p style="margin-bottom:12px;color:var(--text-muted)">${seatText}</p>
    <table class="data-table"><thead><tr><th>Book ID</th><th>Title</th><th>Due Date</th></tr></thead><tbody>${borrowRows}</tbody></table>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Close</button>${presence.kind !== "offline" ? `<button class="btn btn-red" onclick="confirmAction('Kick Student', 'Remove ${s.name} from seat ${presence.seatId}?', ()=>kickStudentFromSeat('${sid}'))">Kick from seat</button>` : ""}`
  );
}

function viewStudentHistory(sid) { const s = students.find(x => x.id === sid); const tx = transactions.filter(t => t.student_uid === sid); const meta = `${s.institution || "—"}${s.department ? " · " + s.department : ""} · ${s.email}`; openModal(`${s.name} — History`, `<p style="margin-bottom:12px;color:var(--text-muted)">${meta}</p><table class="data-table"><thead><tr><th>Book</th><th>Type</th><th>Date</th><th>Due</th></tr></thead><tbody>${tx.map(t => `<tr><td>${t.book_id} — ${t.book_title}</td><td><span class="badge ${t.type}">${t.type}</span></td><td class="mono">${relTime(t.timestamp)}</td><td class="mono">${t.dueDate || "—"}</td></tr>`).join("")}</tbody></table>`, `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`); }
function sendOverdueEmail(sid) { const s = students.find(x => x.id === sid); const od = transactions.filter(tx => tx.student_uid === sid && tx.type === "borrow" && tx.dueDate && daysUntil(tx.dueDate) < 0); const bookList = od.map(t => `• ${t.book_title} (${t.book_id}) — due ${t.dueDate}`).join("<br>"); emailLog.push({ to: s.email, subject: "Overdue Books", date: new Date().toLocaleString() }); openModal("Email Preview", `<div class="email-preview"><div class="ep-to">To: ${s.email}</div><div class="ep-subject">Subject: Overdue Library Books — Action Required</div><div class="ep-body">Dear ${s.name},<br><br>The following books are overdue:<br><br>${bookList}<br><br>Please return them at your earliest convenience.<br><br>— SmartLib Team</div></div>`, `<button class="btn btn-ghost" onclick="closeModal()">Close</button><button class="btn btn-blue" onclick="closeModal();showToast('Email sent (simulated)','success')">Send Email</button>`); }
