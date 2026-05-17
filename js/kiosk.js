/**
 * Library kiosk on iPad:
 *  - Checkout: scan book barcode → scan RFID → borrow or return (no full dashboard session).
 *  - Seats: scan RFID → short session to pick a seat (optional link).
 * Requires Firestore read on kiosk_auth_events — see hardware/pi/FIRESTORE-LAB.md.
 */
window._kioskDisplayMode = false;
window._kioskMode = null; // "checkout" | "seat"

let _kioskCountdownInterval = null;
let _kioskPendingBarcode = null;

function setKioskPanelVisible(which) {
  const choice = document.getElementById("kiosk-choice-panel");
  const wait = document.getElementById("kiosk-wait-panel");
  const normal = document.getElementById("normal-login-flow");
  if (choice) choice.style.display = which === "choice" ? "block" : "none";
  if (wait) wait.style.display = which === "wait" ? "block" : "none";
  if (normal) {
    if (which === "choice" && window._kioskHideEmailLogin) normal.style.display = "none";
    else if (which === "choice") normal.style.display = "block";
    else normal.style.display = "none";
  }
}

function setKioskWaitTitle(text) {
  const el = document.getElementById("kiosk-wait-title");
  if (el) el.textContent = text || "Library kiosk";
}

function setKioskWaitStatus(msg) {
  const el = document.getElementById("kiosk-wait-status");
  if (el) el.textContent = msg || "";
}

function setKioskCheckoutStep(step) {
  const s1 = document.getElementById("kiosk-step-barcode");
  const s2 = document.getElementById("kiosk-step-card");
  if (s1) s1.classList.toggle("kiosk-step-active", step === 1);
  if (s2) s2.classList.toggle("kiosk-step-active", step === 2);
}

function applyKioskPendingBarcode(code) {
  const book = findBookByBarcode(code);
  if (!book) {
    setKioskWaitStatus("Unknown barcode — check the catalog or try again.");
    if (window.showToast) window.showToast("No book matches that barcode.", "warning");
    return false;
  }
  _kioskPendingBarcode = code;
  const inp = document.getElementById("kiosk-barcode-input");
  if (inp) {
    inp.value = code;
    inp.disabled = true;
  }
  setKioskCheckoutStep(2);
  setKioskWaitStatus(`Step 2: Scan your student card — ${book.title}`);
  return true;
}

function resetKioskCheckoutUi() {
  _kioskPendingBarcode = null;
  const inp = document.getElementById("kiosk-barcode-input");
  if (inp) {
    inp.value = "";
    inp.disabled = false;
  }
  setKioskCheckoutStep(1);
  setKioskWaitStatus("Step 1: Scan the book on the Pi barcode scanner (then scan your card).");
}

function onKioskCheckoutBarcode(payload) {
  if (window._kioskMode !== "checkout") return;
  if (_kioskPendingBarcode) return;
  applyKioskPendingBarcode(payload.barcode);
}

function findBookByBarcode(raw) {
  const code = String(raw || "").trim().toLowerCase();
  const list = window.books || (typeof books !== "undefined" ? books : []) || [];
  return list.find((b) => String(b.barcode || "").trim().toLowerCase() === code) || null;
}

function hasActiveBorrowForStudent(studentId, bookId) {
  const my = (window.transactions || []).filter((t) => t.student_uid === studentId);
  return my.some(
    (t) =>
      t.type === "borrow" &&
      t.book_id === bookId &&
      !my.some(
        (r) =>
          r.type === "return" &&
          r.book_id === bookId &&
          new Date(r.timestamp) > new Date(t.timestamp)
      )
  );
}

async function completeKioskCheckout(studentId, barcodeRaw) {
  const book = findBookByBarcode(barcodeRaw);
  if (!book) {
    if (window.showToast) window.showToast("No book matches that barcode.", "warning");
    return false;
  }
  if (!window.fetchStudentById) {
    if (window.showToast) window.showToast("Firebase not ready.", "warning");
    return false;
  }
  const u = await window.fetchStudentById(studentId);
  if (!u) {
    if (window.showToast) window.showToast("Unknown student for this card.", "warning", 6000);
    return false;
  }
  if (u.status === "banned") {
    if (window.showToast) window.showToast("This account is banned.", "danger");
    return false;
  }

  const onLoan = hasActiveBorrowForStudent(studentId, book.id);

  try {
    if (onLoan) {
      if (!window.studentReturnBook) throw new Error("Return service unavailable");
      await window.studentReturnBook(studentId, book.id);
      if (window.showToast) window.showToast(`Returned: ${book.title}`, "success", 5000);
    } else {
      if (!window.studentBorrowBook) throw new Error("Borrow service unavailable");
      await window.studentBorrowBook(studentId, book.id);
      if (window.showToast) window.showToast(`Borrowed: ${book.title}`, "success", 5000);
    }
    return true;
  } catch (err) {
    if (window.showToast) window.showToast(err.message || (onLoan ? "Return failed" : "Borrow failed"), "danger", 6000);
    return false;
  }
}

function onKioskCheckoutRfid(payload) {
  if (window._kioskMode !== "checkout") return;
  const code = _kioskPendingBarcode;
  if (!code) {
    setKioskWaitStatus("Scan the book barcode first, then your card.");
    return;
  }
  setKioskWaitStatus("Processing…");
  void completeKioskCheckout(payload.studentId, code).finally(() => {
    resetKioskCheckoutUi();
  });
}

function onKioskSeatRfid(payload) {
  if (typeof currentUser !== "undefined" && currentUser && currentUser.role === "student") return;
  void beginKioskSessionForStudent(payload.studentId);
}

window.onKioskBarcodeKeydown = function (e) {
  if (e.key !== "Enter" || window._kioskMode !== "checkout") return;
  if (_kioskPendingBarcode) return;
  const el = document.getElementById("kiosk-barcode-input");
  const v = (el && el.value ? el.value : "").trim();
  if (!v) return;
  e.preventDefault();
  applyKioskPendingBarcode(v);
};

function attachKioskRfidListener(handler) {
  if (window._startFirebaseListeners) window._startFirebaseListeners();
  const attach = () => {
    if (window.startKioskRfidListener) {
      window.startKioskRfidListener(handler);
      return true;
    }
    return false;
  };
  if (!attach()) {
    setKioskWaitStatus("Loading…");
    let n = 0;
    const w = setInterval(() => {
      if (attach() || ++n > 150) clearInterval(w);
    }, 100);
  }
}

function attachKioskCheckoutListeners() {
  if (window._startFirebaseListeners) window._startFirebaseListeners();
  const attach = () => {
    if (window.startKioskEventsListener) {
      window.startKioskEventsListener({
        onRfidScan: onKioskCheckoutRfid,
        onBarcodeScan: onKioskCheckoutBarcode,
      });
      return true;
    }
    return false;
  };
  if (!attach()) {
    setKioskWaitStatus("Loading…");
    let n = 0;
    const w = setInterval(() => {
      if (attach() || ++n > 150) clearInterval(w);
    }, 100);
  }
}

/** Home screen: Enter the library vs borrow/return. */
window.enterKioskChoiceScreen = function (opts) {
  window._kioskDisplayMode = true;
  window._kioskMode = null;
  window._kioskHideEmailLogin = !!(opts && opts.hideEmailLogin);
  _kioskPendingBarcode = null;
  if (window.stopKioskRfidListener) window.stopKioskRfidListener();
  setKioskPanelVisible("choice");
};

window.backToKioskChoice = function () {
  if (window.stopKioskRfidListener) window.stopKioskRfidListener();
  enterKioskChoiceScreen({ hideEmailLogin: window._kioskHideEmailLogin });
};

/** Borrow / return: barcode then RFID. */
window.enterKioskCheckoutScreen = function () {
  window._kioskDisplayMode = true;
  window._kioskMode = "checkout";
  const seatBlock = document.getElementById("kiosk-seat-hint");
  const checkoutBlock = document.getElementById("kiosk-checkout-block");
  if (seatBlock) seatBlock.style.display = "none";
  if (checkoutBlock) checkoutBlock.style.display = "block";
  setKioskWaitTitle("Borrow or return a book");
  setKioskPanelVisible("wait");
  resetKioskCheckoutUi();
  attachKioskCheckoutListeners();
};

/** Enter the library: RFID → short session → pick a seat. */
window.enterKioskSeatScreen = function () {
  window._kioskDisplayMode = true;
  window._kioskMode = "seat";
  _kioskPendingBarcode = null;
  const seatBlock = document.getElementById("kiosk-seat-hint");
  const checkoutBlock = document.getElementById("kiosk-checkout-block");
  if (seatBlock) seatBlock.style.display = "block";
  if (checkoutBlock) checkoutBlock.style.display = "none";
  setKioskWaitTitle("Enter the library");
  setKioskPanelVisible("wait");
  setKioskWaitStatus("Scan your student card on the RFID reader…");
  attachKioskRfidListener(onKioskSeatRfid);
};

window.enterKioskWaitScreen = window.enterKioskChoiceScreen;

window.exitKioskToNormalLogin = function () {
  window._kioskDisplayMode = false;
  window._kioskMode = null;
  window._kioskHideEmailLogin = false;
  _kioskPendingBarcode = null;
  if (window.stopKioskRfidListener) window.stopKioskRfidListener();
  const choice = document.getElementById("kiosk-choice-panel");
  const wait = document.getElementById("kiosk-wait-panel");
  const normal = document.getElementById("normal-login-flow");
  if (choice) choice.style.display = "block";
  if (wait) wait.style.display = "none";
  if (normal) normal.style.display = "block";
  setKioskWaitStatus("");
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("kiosk")) {
      u.searchParams.delete("kiosk");
      window.history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
    }
  } catch (_) {}
};

window.showKioskWaitAfterSessionEnd = function () {
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  if (window.stopKioskRfidListener) window.stopKioskRfidListener();
  enterKioskChoiceScreen({ hideEmailLogin: true });
};

window.clearKioskSessionTimers = function () {
  if (_kioskCountdownInterval) {
    clearInterval(_kioskCountdownInterval);
    _kioskCountdownInterval = null;
  }
  try {
    window._kioskSessionEndAt = null;
  } catch (_) {}
  const banner = document.getElementById("kiosk-session-banner");
  if (banner) {
    banner.style.display = "none";
    banner.textContent = "";
  }
};

function startKioskSessionCountdown() {
  window.clearKioskSessionTimers();
  const sec = Math.max(5, Number(window.KIOSK_SESSION_SECONDS) || 15);
  const endAt = Date.now() + sec * 1000;
  window._kioskSessionEndAt = endAt;
  const banner = document.getElementById("kiosk-session-banner");
  if (banner) banner.style.display = "block";
  const tick = () => {
    if (typeof currentUser === "undefined" || !currentUser || currentUser.role !== "student") {
      window.clearKioskSessionTimers();
      return;
    }
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (banner) {
      banner.textContent =
        left > 0
          ? `Kiosk session · pick your seat · ${left}s until sign-out`
          : "Signing out…";
    }
    if (left <= 0) {
      window.clearKioskSessionTimers();
      logout();
    }
  };
  tick();
  _kioskCountdownInterval = setInterval(tick, 300);
}

async function beginKioskSessionForStudent(studentId) {
  if (!window.fetchStudentById) {
    if (window.showToast) window.showToast("Firebase not ready yet.", "warning");
    return;
  }
  const u = await window.fetchStudentById(studentId);
  if (!u) {
    if (window.showToast) window.showToast("Unknown student for this card. Check RFID map on the Pi.", "warning", 6000);
    return;
  }
  if (u.status === "banned") {
    if (window.showToast) window.showToast("This account is banned.", "danger");
    return;
  }
  window._dueSoonNotifiedKey = null;
  currentUser = { ...u, role: "student", seatId: null, status: "no-seat", reservationId: null };
  const seatList = window.seats || seats || [];
  const s = seatList.find((x) => x.studentId === u.id);
  if (s) {
    currentUser.seatId = s.id;
    currentUser.status = s.occupied ? "seated" : "away";
  }
  enterDashboard();
  if (typeof switchTab === "function") switchTab("u-seat", "My Seat");
  startKioskSessionCountdown();
  if (window.showToast) window.showToast(`Hello, ${u.name || u.id} — choose a seat.`, "success", 4000);
}

function tryAutoKioskFromUrl() {
  let sp;
  try {
    sp = new URLSearchParams(window.location.search);
  } catch (_) {
    return;
  }
  if (sp.get("kiosk") !== "1" && sp.get("kiosk") !== "true") return;
  const go = () => {
    if (window.startKioskEventsListener || window.startKioskRfidListener) {
      enterKioskChoiceScreen({ hideEmailLogin: true });
      return;
    }
    setTimeout(go, 80);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go, { once: true });
  } else go();
}

tryAutoKioskFromUrl();
