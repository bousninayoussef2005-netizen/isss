const expiringReservations = new Set();
const expiringAwayTimers = new Set();
function awaySecondsLeft(t) { return Math.max(0, Math.floor(((t.expiresAt || 0) - Date.now()) / 1000)); }

function tickTimers() {
  awayTimers.forEach(async (t) => {
    const left = awaySecondsLeft(t);
    if (left === TIMER_WARNING && currentUser.role === "student" && currentUser.id === t.studentId) showToast(`⚠️ ${formatTime(TIMER_WARNING)} left!`, "warning", 6000);
    if (left <= 0 && !expiringAwayTimers.has(t.firebaseId)) {
      expiringAwayTimers.add(t.firebaseId);
      try {
        if (window.collectSeatByAdmin) await window.collectSeatByAdmin(t.seatId, t.studentId);
        if (window.clearAwayTimer) await window.clearAwayTimer(t.seatId, t.studentId, "collect");
        if (currentUser.role === "student" && currentUser.id === t.studentId) { currentUser.seatId = null; currentUser.status = "collected"; showToast("🚫 Time up! Belongings collected.", "danger", 6000); }
        alerts.push({ id: alerts.length + 100, table_id: t.seatId, type: "collected", studentId: t.studentId, timestamp: new Date().toLocaleString(), resolved: false });
      } catch (err) {
        console.error("Away timer expire error:", err);
      } finally {
        setTimeout(() => expiringAwayTimers.delete(t.firebaseId), 5000);
      }
    }
  });
  reservations.forEach(async (r) => {
    if (!r || !r.active) return;
    const secondsLeft = Math.floor(((r.expiresAt || 0) - Date.now()) / 1000);
    if (secondsLeft <= 0 && window.cancelSeatReservation && !expiringReservations.has(r.firebaseId)) {
      expiringReservations.add(r.firebaseId);
      try {
        await window.cancelSeatReservation(r.seatId, r.studentId, "expire");
        if (currentUser.role === "student" && currentUser.id === r.studentId) {
          currentUser.reservationId = null;
          showToast("Reservation expired.", "warning");
        }
      } catch (err) {
        console.error("Reservation expire error:", err);
      } finally {
        setTimeout(() => expiringReservations.delete(r.firebaseId), 5000);
      }
    }
  });
  if (currentTab === "s-seats") { updateSeatsStats(); renderSeatsAdmin(); renderAdminTimers(); }
  if (currentTab === "s-students") filterStudents();
  if (currentTab === "u-seat") { renderStudentSeatView(); renderHourlyChart(); }
}

async function stuSit(seatId) {
  const s = seats.find(x => x.id === seatId);
  const awayOnSeat = awayTimers.find(t => t.seatId === seatId && awaySecondsLeft(t) > 0);
  if (awayOnSeat && awayOnSeat.studentId !== currentUser.id) return showToast("Seat is temporarily away-locked by another student.", "warning");
  if (!s || s.occupied) return showToast("Taken!", "danger");
  const alreadySeatedElsewhere = currentUser.status === "seated" && currentUser.seatId && currentUser.seatId !== seatId;
  if (alreadySeatedElsewhere) return showToast(`You are already seated at ${currentUser.seatId}.`, "warning");

  if (window.occupySeatByStudent) {
    try {
      await window.occupySeatByStudent(seatId, currentUser.id);
      const myRes = reservations.find(r => r && r.active && r.seatId === seatId && r.studentId === currentUser.id);
      if (myRes && window.cancelSeatReservation) await window.cancelSeatReservation(seatId, currentUser.id, "claim");
    } catch (err) {
      console.error("Seat occupy error:", err);
      return showToast("Could not reserve this seat in database", "danger");
    }
  }

  awayTimers = awayTimers.filter(t => t.studentId !== currentUser.id);
  reservations.forEach(r => { if (r && r.studentId === currentUser.id) r.active = false; });
  s.occupied = true;
  s.studentId = currentUser.id;
  currentUser.seatId = seatId;
  currentUser.status = "seated";
  currentUser.reservationId = null;
  showToast(`Seated at ${seatId}`, "success");
  renderTab();
}

async function stuLeave() {
  if (!currentUser.seatId) return;

  if (window.addSeatTransaction) {
    try {
      await window.addSeatTransaction(currentUser.seatId, currentUser.id, "leave");
    } catch (err) {
      console.error("Seat leave error:", err);
      return showToast("Could not log leave action in database", "danger");
    }
  }

  const s = seats.find(x => x.id === currentUser.seatId);
  if (s) {
    s.occupied = true;
    s.studentId = currentUser.id;
  }
  currentUser.status = "away";
  if (window.startAwayTimer) {
    try {
      await window.startAwayTimer(currentUser.seatId, currentUser.id);
    } catch (err) {
      console.error("Away timer start error:", err);
    }
  }
  showToast(`Timer started: ${formatTime(TIMER_TOTAL)}`, "warning", 5000);
  renderTab();
}

async function stuReturn() {
  const timersSrc = Array.isArray(window.awayTimers) ? window.awayTimers : awayTimers;
  const seatList = Array.isArray(window.seats) ? window.seats : seats;
  const activeAway = timersSrc.find(t => t.studentId === currentUser.id && awaySecondsLeft(t) > 0);
  const occupiedSeat = seatList.find(s => s.occupied && s.studentId === currentUser.id);
  const seatId = currentUser.seatId || (activeAway ? activeAway.seatId : null) || (occupiedSeat ? occupiedSeat.id : null);
  if (!seatId) return showToast("Seat not found. Please refresh and try again.", "warning");
  currentUser.seatId = seatId;

  if (window.returnToSeatByStudent) {
    try {
      await window.returnToSeatByStudent(seatId, currentUser.id);
    } catch (err) {
      console.error("Seat return error:", err);
      return showToast("Could not update seat in database", "danger");
    }
  }

  const s = seatList.find(x => x.id === seatId);
  if (s) { s.occupied = true; s.studentId = currentUser.id; }
  if (window.clearAwayTimer) {
    try {
      await window.clearAwayTimer(seatId, currentUser.id, "return");
    } catch (err) {
      console.error("Away timer clear error:", err);
    }
  }
  currentUser.status = "seated";
  showToast(`Back at ${seatId}!`, "success");
  renderTab();
}

function stuGrabStuff() { currentUser.seatId = null; currentUser.status = "no-seat"; currentUser.reservationId = null; awayTimers = awayTimers.filter(t => t.studentId !== currentUser.id); showToast("Pick a seat.", "info"); renderTab(); }

async function stuReserve(seatId) {
  if (currentUser.reservationId) return showToast("You already have a reservation.", "warning");
  if (currentUser.status === "seated" && currentUser.seatId) return showToast(`You are already using ${currentUser.seatId}. You cannot reserve another seat.`, "warning");
  if (currentUser.status === "away" && currentUser.seatId) return showToast(`You are still assigned to ${currentUser.seatId}. Return or give it up first.`, "warning");
  const s = seats.find(x => x.id === seatId);
  const awayOnSeat = awayTimers.find(t => t.seatId === seatId && awaySecondsLeft(t) > 0);
  if (awayOnSeat && awayOnSeat.studentId !== currentUser.id) return showToast("Seat is temporarily away-locked by another student.", "warning");
  if (!s || s.occupied) return showToast("Seat taken!", "danger");
  try {
    if (window.createSeatReservation) await window.createSeatReservation(seatId, currentUser.id, currentUser.name || "");
    currentUser.reservationId = seatId;
    showToast(`Reserved ${seatId} for ${formatTime(RESERVE_TIME)}`, "info");
    renderTab();
  } catch (err) {
    console.error("Reserve seat error:", err);
    showToast(err.message || "Could not reserve seat", "danger");
  }
}

async function stuCancelRes() {
  try {
    const myRes = reservations.find(r => r && r.active && r.studentId === currentUser.id);
    if (myRes && window.cancelSeatReservation) await window.cancelSeatReservation(myRes.seatId, currentUser.id, "cancel");
    currentUser.reservationId = null;
    showToast("Reservation cancelled.", "info");
    renderTab();
  } catch (err) {
    console.error("Cancel reservation error:", err);
    showToast("Could not cancel reservation", "danger");
  }
}

async function adminCollect(seatId, studentId) {
  if (window.collectSeatByAdmin) {
    try {
      await window.collectSeatByAdmin(seatId, studentId);
    } catch (err) {
      console.error("Admin collect error:", err);
      return showToast("Could not collect seat in database", "danger");
    }
  }

  if (window.clearAwayTimer) await window.clearAwayTimer(seatId, studentId, "collect");
  const s = seats.find(x => x.id === seatId);
  if (s) { s.occupied = false; s.studentId = null; }
  alerts.push({ id: alerts.length + 100, table_id: seatId, type: "collected", studentId, timestamp: new Date().toLocaleString(), resolved: false });
  showToast(`Collected from ${seatId}`, "info");
  renderTab();
}

function updateSeatsStats() {
  rebuildHourlyDataFromSeatTransactions();
  const free = seats.filter(s =>
    !s.occupied &&
    !awayTimers.find(t => t.seatId === s.id && awaySecondsLeft(t) > 0) &&
    !reservations.find(r => r && r.seatId === s.id && r.active)
  ).length;
  const activeTimers = awayTimers.filter(t => awaySecondsLeft(t) > 0).length;
  const activeReservations = reservations.filter(r => r && r.active).length;
  const currentLoad = hourlyData[Math.floor((new Date().getHours() - 8))] || 0;
  const a = document.getElementById("seats-free-count"), b = document.getElementById("seats-total-count"), c = document.getElementById("seats-active-timers"), d = document.getElementById("seats-reservations"), e = document.getElementById("seats-current-load");
  if (a) a.textContent = String(free);
  if (b) b.textContent = `of ${seats.length} seats`;
  if (c) c.textContent = String(activeTimers);
  if (d) d.textContent = String(activeReservations);
  if (e) e.textContent = `${currentLoad}%`;
}

function renderSeatsAdmin() {
  const g = document.getElementById("admin-seats"); if (!g) return;
  g.innerHTML = "";
  seats.forEach(s => {
    const d = document.createElement("div");
    const t = awayTimers.find(x => x.seatId === s.id && awaySecondsLeft(x) > 0);
    const res = reservations.find(r => r && r.seatId === s.id && r.active && ((r.expiresAt || 0) - Date.now()) > 0);
    if (t) { const left = awaySecondsLeft(t); const u = left <= TIMER_WARNING; d.className = "seat warning-seat"; d.innerHTML = `<span class="seat-icon">⏱️</span>${s.id}<span class="seat-label">${t.studentId}</span><div class="seat-timer-badge ${u ? "urgent" : ""}">${formatTime(left)}</div>`; }
    else if (res) {
      const left = Math.max(0, Math.floor(((res.expiresAt || 0) - Date.now()) / 1000));
      d.className = "seat reserved";
      d.innerHTML = `<span class="seat-icon">📅</span>${s.id}<span class="seat-label">Reserved · ${res.studentId}</span><div class="seat-timer-badge">${formatTime(left)}</div>`;
    }
    else if (s.occupied) { d.className = "seat occupied"; d.innerHTML = `<span class="seat-icon">●</span>${s.id}<span class="seat-label">${s.studentId || ""}</span>`; }
    else { d.className = "seat free"; d.innerHTML = `<span class="seat-icon">●</span>${s.id}<span class="seat-label">${s.type}</span>`; }
    d.ondblclick = () => confirmAction("Remove Seat", `Delete ${s.id}?`, () => deleteSeat(s.id));
    d.innerHTML += `<span class="seat-type-badge">${(s.type || "R")[0]}</span>`;
    g.appendChild(d);
  });
}

function renderAdminTimers() { const p = document.getElementById("admin-timers"); if (!p) return; const a = awayTimers.filter(t => awaySecondsLeft(t) > 0); const lbl = document.getElementById("timers-label"); if (lbl) lbl.textContent = a.length + " running"; if (!a.length) { p.innerHTML = '<div class="empty-state"><div class="icon">✅</div><p>All clear</p></div>'; return; } p.innerHTML = ""; a.forEach(t => { const left = awaySecondsLeft(t); const u = left <= TIMER_WARNING; const d = document.createElement("div"); d.className = "timer-row " + (u ? "urgent-row" : left <= TIMER_TOTAL / 2 ? "warning-row" : ""); d.innerHTML = `<div class="timer-info"><strong>${t.seatId}</strong> · <span>${t.studentId}</span></div><div class="timer-countdown ${u ? "urgent" : left <= TIMER_TOTAL / 2 ? "warn" : "normal"}">${formatTime(left)}</div><button class="btn btn-purple btn-sm" onclick="adminCollect('${t.seatId}','${t.studentId}')">Collect</button>`; p.appendChild(d); }); }

function rebuildHourlyDataFromSeatTransactions() {
  const base = Array(12).fill(0);
  const txs = window.seatTransactions || [];
  const now = new Date();
  const seatCount = Math.max((seats || []).length, 1);

  txs.forEach((t) => {
    if (!["sit", "return"].includes(t.type)) return;
    const ts = new Date(t.timestamp);
    if (Number.isNaN(ts.getTime())) return;
    if (ts.getFullYear() !== now.getFullYear() || ts.getMonth() !== now.getMonth() || ts.getDate() !== now.getDate()) return;
    const hour = ts.getHours();
    if (hour < 8 || hour > 19) return;
    base[hour - 8] += 1;
  });

  hourlyData = base.map((count) => Math.min(100, Math.round((count / seatCount) * 100)));
}

function renderHourlyChart() {
  rebuildHourlyDataFromSeatTransactions();
  const c = document.getElementById("hourly-chart");
  if (!c) return;
  c.innerHTML = "";
  const peak = Math.max(...hourlyData, 1);
  hourlyData.forEach((v, i) => {
    const h = Math.max((v / peak) * 140, 4);
    const isPeak = v >= peak * 0.9 && v > 0;
    c.innerHTML += `<div class="chart-bar-wrapper"><div class="chart-value">${v}%</div><div class="chart-bar${isPeak ? " peak" : ""}" style="height:${h}px"></div><div class="chart-label">${i + 8}:00</div></div>`;
  });
}

function renderStudentSeatView() {
  const seatList = Array.isArray(window.seats) ? window.seats : seats;
  const timersSrc = Array.isArray(window.awayTimers) ? window.awayTimers : awayTimers;
  const occupiedSeat = seatList.find(s => s.occupied && s.studentId === currentUser.id);
  const activeAway = timersSrc.find(t => t.studentId === currentUser.id && awaySecondsLeft(t) > 0);
  if (activeAway) {
    currentUser.seatId = activeAway.seatId;
    currentUser.status = "away";
  } else if (currentUser.status === "away" && currentUser.seatId) {
    /* Keep away while timer writes / snapshot catches up; do not require occupiedSeat match */
    currentUser.status = "away";
  } else if (occupiedSeat) {
    currentUser.seatId = occupiedSeat.id;
    currentUser.status = "seated";
  } else if (currentUser.status !== "collected") {
    currentUser.seatId = null;
    currentUser.status = "no-seat";
  }

  const myRes = reservations.find(r => r && r.active && r.studentId === currentUser.id && ((r.expiresAt || 0) - Date.now()) > 0);
  currentUser.reservationId = myRes ? myRes.seatId : null;
  const w = document.getElementById("stu-welcome"); if (w) { const f = seatList.filter(s => !s.occupied && !timersSrc.find(t => t.seatId === s.id && awaySecondsLeft(t) > 0) && !reservations.find(r => r && r.seatId === s.id && r.active && ((r.expiresAt || 0) - Date.now()) > 0)).length; const deptLine = currentUser.institution === "MSB" ? `MSB · ${currentUser.id}` : `${currentUser.department || ""} · ${currentUser.id}`; w.innerHTML = `<h2>Welcome, ${currentUser.name} 👋</h2><p>${f} seat${f !== 1 ? "s" : ""} available.</p><div class="welcome-dept">${deptLine}</div>`; }
  const myReservationsList = document.getElementById("my-reservations-list");
  if (myReservationsList) {
    const mine = reservations
      .filter(r => r && r.active && r.studentId === currentUser.id && ((r.expiresAt || 0) - Date.now()) > 0)
      .sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
    if (!mine.length) {
      myReservationsList.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>No active reservations.</p></div>`;
    } else {
      myReservationsList.innerHTML = mine.map(r => {
        const left = Math.max(0, Math.floor(((r.expiresAt || 0) - Date.now()) / 1000));
        return `<div class="alert-item"><div class="alert-icon warning">📅</div><div style="flex:1"><div class="alert-text"><strong>${r.seatId}</strong> reserved</div><div class="alert-time">${formatTime(left)} remaining</div></div><div><button class="btn btn-green btn-sm" onclick="stuSit('${r.seatId}')">Claim</button> <button class="btn btn-red btn-sm" onclick="stuCancelRes()">Cancel</button></div></div>`;
      }).join("");
    }
  }
  const mySeatBorrowedList = document.getElementById("my-seat-borrowed-list");
  if (mySeatBorrowedList) {
    const my = (transactions || []).filter(t => t.student_uid === currentUser.id);
    const borrowed = my
      .filter(t => t.type === "borrow" && !my.find(r => r.type === "return" && r.book_id === t.book_id && new Date(r.timestamp) > new Date(t.timestamp)))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!borrowed.length) {
      mySeatBorrowedList.innerHTML = `<div class="empty-state"><div class="icon">📚</div><p>No books currently borrowed.</p></div>`;
    } else {
      mySeatBorrowedList.innerHTML = borrowed.map(t => {
        const dd = t.dueDate ? daysUntil(t.dueDate) : null;
        const status = dd === null ? "Borrowed" : dd < 0 ? `${Math.abs(dd)}d overdue` : `${dd}d left`;
        const badgeClass = dd !== null && dd < 0 ? "badge overdue" : "badge borrow";
        return `<div class="alert-item"><div class="alert-icon warning">📖</div><div style="flex:1"><div class="alert-text"><strong>${t.book_title}</strong> (${t.book_id})</div><div class="alert-time">Due: ${t.dueDate || "—"}</div></div><div><span class="${badgeClass}">${status}</span></div></div>`;
      }).join("");
    }
  }
  const a = document.getElementById("seat-status-area"); if (a) {
    if (currentUser.status === "no-seat" && !currentUser.reservationId) a.innerHTML = `<div class="seat-status-banner no-seat"><div class="seat-status-left"><h3>📍 No Seat</h3><p>Tap a green seat to sit, or long-press to reserve.</p></div></div>`;
    else if (currentUser.status === "no-seat" && currentUser.reservationId) { const r = reservations.find(x => x && x.seatId === currentUser.reservationId && x.active && ((x.expiresAt || 0) - Date.now()) > 0); const left = r ? Math.floor((r.expiresAt - Date.now()) / 1000) : 0; a.innerHTML = r ? `<div class="seat-status-banner reserved-banner"><div class="seat-status-left"><h3>📅 Reserved: ${r.seatId}</h3><p>Claim it before time runs out.</p><button class="seat-action-btn btn-sit" onclick="stuSit('${r.seatId}')">Claim Seat</button> <button class="seat-action-btn btn-cancel-res" onclick="stuCancelRes()" style="margin-left:8px">Cancel</button></div><div class="seat-timer-display warning-time">${formatTime(Math.max(0,left))}</div></div>` : `<div class="seat-status-banner no-seat"><div class="seat-status-left"><h3>📍 No Seat</h3><p>Tap a green seat to sit.</p></div></div>`; }
    else if (currentUser.status === "collected") a.innerHTML = `<div class="seat-status-banner collected-banner"><div class="seat-status-left"><h3>📦 Belongings Collected</h3><p>Pick up at front desk.</p><button class="seat-action-btn btn-return" onclick="stuGrabStuff()">Got my stuff</button></div></div>`;
    else if (currentUser.status === "seated") a.innerHTML = `<div class="seat-status-banner seated"><div class="seat-status-left"><h3>✅ Seated at ${currentUser.seatId}</h3><p>Timer starts if you leave.</p><button class="seat-action-btn btn-leave" onclick="stuLeave()">I'm leaving</button></div></div>`;
    else if (currentUser.status === "away") {
      let t = timersSrc.find(x => x.studentId === currentUser.id && x.seatId === currentUser.seatId && awaySecondsLeft(x) > 0);
      if (!t) t = timersSrc.find(x => x.studentId === currentUser.id && awaySecondsLeft(x) > 0);
      if (!t) {
        a.innerHTML = `<div class="seat-status-banner away"><div class="seat-status-left"><h3>⏱️ Away from ${currentUser.seatId}</h3><p>Starting timer...</p><button class="seat-action-btn btn-return" onclick="stuReturn()">I'm back</button></div><div class="seat-timer-display warning-time">${formatTime(TIMER_TOTAL)}</div></div>`;
      } else {
        const left = awaySecondsLeft(t);
        if (left <= 0) { currentUser.status = "collected"; renderStudentSeatView(); return; }
        const u = left <= TIMER_WARNING;
        a.innerHTML = `<div class="seat-status-banner ${u ? "away-urgent" : "away"}"><div class="seat-status-left"><h3>${u ? "🚨" : "⏱️"} Away from ${currentUser.seatId}</h3><p>${u ? "Hurry!" : "Return before time runs out."}</p><button class="seat-action-btn btn-return" onclick="stuReturn()">I'm back</button></div><div class="seat-timer-display ${u ? "urgent-time" : "warning-time"}">${formatTime(left)}</div></div>`;
      }
    }
  }
  const g = document.getElementById("stu-seats"); if (!g) return; g.innerHTML = ""; seatList.forEach(s => { const d = document.createElement("div"); const t = timersSrc.find(x => x.seatId === s.id && awaySecondsLeft(x) > 0); const res = reservations.find(r => r && r.seatId === s.id && r.active && ((r.expiresAt || 0) - Date.now()) > 0); const isMine = currentUser.seatId === s.id;
    if (isMine && currentUser.status === "away") {
      const tMine = timersSrc.find(x => x.seatId === s.id && x.studentId === currentUser.id && awaySecondsLeft(x) > 0);
      const left = tMine ? awaySecondsLeft(tMine) : TIMER_TOTAL;
      const u = left <= TIMER_WARNING;
      d.className = `seat mine warning-seat${u ? " urgent-away" : ""}`;
      d.innerHTML = `<span class="seat-icon">⏱️</span>${s.id}<span class="seat-label">Away · your seat</span><div class="seat-timer-badge ${u ? "urgent" : ""}">${formatTime(left)}</div>`;
      d.innerHTML += `<button class="btn btn-green btn-sm" style="margin-top:6px" onclick="event.stopPropagation();stuReturn()">I'm back</button>`;
    }
    else if (isMine && currentUser.status === "seated") { d.className = "seat mine"; d.innerHTML = `<span class="seat-icon">🔵</span>${s.id}<span class="seat-label">Your seat</span>`; }
    else if (t) {
      const left = awaySecondsLeft(t);
      const awayIsMine = t.studentId === currentUser.id;
      d.className = awayIsMine ? "seat mine" : "seat warning-seat";
      d.innerHTML = `<span class="seat-icon">⏱️</span>${s.id}<span class="seat-label">${awayIsMine ? "Your seat (Away)" : "Away"}</span><div class="seat-timer-badge ${left <= TIMER_WARNING ? "urgent" : ""}">${formatTime(left)}</div>`;
      if (awayIsMine) {
        d.innerHTML += `<button class="btn btn-green btn-sm" style="margin-top:6px" onclick="event.stopPropagation();stuReturn()">I'm back</button>`;
      }
    }
    else if (res) {
      const left = Math.max(0, Math.floor(((res.expiresAt || 0) - Date.now()) / 1000));
      d.className = "seat reserved";
      d.innerHTML = `<span class="seat-icon">📅</span>${s.id}<span class="seat-label">Reserved</span><div class="seat-timer-badge">${formatTime(left)}</div>`;
      if (res.studentId === currentUser.id) {
        d.style.cursor = "default";
        d.innerHTML += `<button class="btn btn-green btn-sm" style="margin-top:6px" onclick="event.stopPropagation();stuSit('${s.id}')">Claim</button>`;
        d.innerHTML += `<button class="btn btn-red btn-sm" style="margin-top:6px;margin-left:6px" onclick="event.stopPropagation();stuCancelRes()">Cancel Reservation</button>`;
      }
    }
    else if (s.occupied) { d.className = "seat occupied"; d.innerHTML = `<span class="seat-icon">●</span>${s.id}<span class="seat-label">In use</span>`; }
    else {
      d.className = "seat free";
      const canSit = currentUser.status === "no-seat" || currentUser.status === "collected";
      if (canSit) {
        d.style.cursor = "pointer";
        d.onclick = () => stuSit(s.id);
        d.innerHTML = `<span class="seat-icon">●</span>${s.id}<span class="seat-label">Tap=Sit</span>`;
        d.innerHTML += `<button class="btn btn-blue btn-sm" style="margin-top:6px" onclick="event.stopPropagation();stuReserve('${s.id}')">Reserve</button>`;
      } else {
        d.innerHTML = `<span class="seat-icon">●</span>${s.id}<span class="seat-label">Free</span>`;
      }
    }
    d.innerHTML += `<span class="seat-type-badge">${(s.type || "R")[0]}</span>`; g.appendChild(d); });
}

function openAddSeatModal() {
  openModal("Add Seat", `
    <div class="form-row">
      <div class="form-group"><label>Seat ID</label><input type="text" id="ns-id" placeholder="e.g. S11"></div>
      <div class="form-group"><label>Type</label><select id="ns-type">${SEAT_TYPES.map(t => `<option>${t}</option>`).join("")}</select></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-green" onclick="addSeat()">Add</button>`
  );
}
