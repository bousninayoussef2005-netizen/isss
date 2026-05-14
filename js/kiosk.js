/**
 * Library kiosk: listen for Pi-written kiosk_auth_events (action rfid_scan),
 * sign the student in like email login, auto log out after KIOSK_SESSION_SECONDS.
 * Requires Firestore read on kiosk_auth_events — see hardware/pi/FIRESTORE-LAB.md.
 */
window._kioskDisplayMode = false;

let _kioskCountdownInterval = null;

function setKioskLoginLayout(waiting) {
  const normal = document.getElementById("normal-login-flow");
  const wait = document.getElementById("kiosk-wait-panel");
  const entry = document.getElementById("kiosk-entry-row");
  if (normal) normal.style.display = waiting ? "none" : "block";
  if (wait) wait.style.display = waiting ? "block" : "none";
  if (entry) entry.style.display = waiting ? "none" : "block";
}

function setKioskWaitStatus(msg) {
  const el = document.getElementById("kiosk-wait-status");
  if (el) el.textContent = msg || "";
}

function onKioskRfidPayload(payload) {
  if (typeof currentUser !== "undefined" && currentUser && currentUser.role === "student") return;
  void beginKioskSessionForStudent(payload.studentId);
}

window.enterKioskWaitScreen = function () {
  window._kioskDisplayMode = true;
  setKioskLoginLayout(true);
  if (window._startFirebaseListeners) window._startFirebaseListeners();
  const attach = () => {
    if (window.startKioskRfidListener) {
      setKioskWaitStatus("Listening for card scan…");
      window.startKioskRfidListener(onKioskRfidPayload);
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
};

window.exitKioskToNormalLogin = function () {
  window._kioskDisplayMode = false;
  if (window.stopKioskRfidListener) window.stopKioskRfidListener();
  setKioskLoginLayout(false);
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
  window._kioskDisplayMode = true;
  setKioskLoginLayout(true);
  setKioskWaitStatus("Listening for card scan…");
  if (window.stopKioskRfidListener) window.stopKioskRfidListener();
  if (window.startKioskRfidListener) window.startKioskRfidListener(onKioskRfidPayload);
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
          ? `Kiosk session · scan a book barcode in Catalog (search box), then Enter · ${left}s until sign-out`
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
  if (typeof switchTab === "function") switchTab("u-catalog", "Catalog");
  startKioskSessionCountdown();
  if (window.showToast) {
    window.showToast(`Hello, ${u.name || u.id} — scan a book barcode in the catalog search box (scanner sends Enter).`, "success", 5000);
  }
  setTimeout(() => {
    const inp = document.getElementById("catalog-search");
    if (inp) {
      inp.focus();
      inp.select();
    }
  }, 350);
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
    if (window.startKioskRfidListener) {
      enterKioskWaitScreen();
      return;
    }
    setTimeout(go, 80);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go, { once: true });
  } else go();
}

tryAutoKioskFromUrl();
