const STAFF_TABS = [{ id: "s-seats", label: "Seats", s: "Seats" }, { id: "s-books", label: "BOOKS", s: "BOOKS" }, { id: "s-students", label: "Students", s: "Students" }, { id: "s-alerts", label: "Alerts", s: "Alerts" }, { id: "s-issues", label: "Issues", s: "Issues" }, { id: "s-settings", label: "Settings", s: "Settings" }];
const STUDENT_TABS = [{ id: "u-seat", label: "My Seat", s: "My Seat" }, { id: "u-books", label: "My Books", s: "My Books" }, { id: "u-catalog", label: "Catalog", s: "Catalog" }];
const TAB_PARTIALS = {
  "s-seats": "partials/seats.html",
  "s-books": "partials/books.html",
  "s-students": "partials/students.html",
  "s-alerts": "partials/alerts.html",
  "s-issues": "partials/issues.html",
  "s-settings": "partials/settings.html"
};
const tabTemplateCache = {};
let renderSeq = 0;

function getCurrentTabs() {
  return currentUser?.role === "staff" ? STAFF_TABS : STUDENT_TABS;
}

function getTabFromHash() {
  const hash = (window.location.hash || "").replace(/^#/, "");
  return hash || null;
}

function isTabAllowed(tabId) {
  return getCurrentTabs().some(t => t.id === tabId);
}

function enterDashboard() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "block";
  document.getElementById("display-name").textContent = currentUser.name;
  document.getElementById("display-role").textContent = currentUser.role === "staff" ? "STAFF" : `${currentUser.id} · ${currentUser.institution === "MSB" ? "MSB" : (currentUser.department || currentUser.institution || "")}`;
  buildTabs();
  timerInterval = setInterval(tickTimers, 1000);
  if (window._startFirebaseListeners) window._startFirebaseListeners();
}

function buildTabs() {
  const row = document.getElementById("tab-row"); row.innerHTML = "";
  const tabs = getCurrentTabs();
  tabs.forEach((t, i) => { const b = document.createElement("button"); b.className = "tab" + (i === 0 ? " active" : ""); b.textContent = t.label; b.onclick = () => switchTab(t.id, t.s); row.appendChild(b); });

  // Prefer tab from URL hash if valid for current role
  const requestedTab = getTabFromHash();
  const target = tabs.find(t => t.id === requestedTab) || tabs[0];
  switchTab(target.id, target.s);
}

function switchTab(id, s) {
  currentTab = id;
  window.currentTab = id;
  const tabs = getCurrentTabs();
  document.querySelectorAll(".tab-row .tab").forEach((b, i) => b.classList.toggle("active", tabs[i]?.id === id));
  document.getElementById("header-section").textContent = s;

  // Keep URL in sync with current tab
  const nextHash = `#${id}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = id;
  }

  renderTab();
}

async function loadTabTemplate(tabId) {
  const path = TAB_PARTIALS[tabId];
  if (!path) return "";
  if (!tabTemplateCache[path]) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    tabTemplateCache[path] = await res.text();
  }
  return tabTemplateCache[path];
}

async function renderTab() {
  const m = document.getElementById("main-content");
  const seq = ++renderSeq;
  window.currentTab = currentTab;
  if (TAB_PARTIALS[currentTab]) {
    try {
      m.innerHTML = await loadTabTemplate(currentTab);
      if (seq !== renderSeq) return;
    } catch (err) {
      m.innerHTML = `<div class="card"><div class="card-body">Failed to load interface.</div></div>`;
      console.error(err);
      return;
    }
  } else {
    const r = renderers[currentTab];
    if (r) {
      const keepSeatShell =
        currentTab === "u-seat" &&
        currentUser?.role === "student" &&
        document.getElementById("stu-seats") &&
        document.getElementById("hourly-chart") &&
        document.getElementById("seat-status-area");
      if (!keepSeatShell) m.innerHTML = r();
    }
  }
  if (currentTab === "s-seats") { updateSeatsStats(); renderSeatsAdmin(); renderAdminTimers(); renderHourlyChart(); }
  if (currentTab === "s-books") { bindBookSearch(); bindTxSearch(); }
  if (currentTab === "s-students") bindStudentSearch();
  if (currentTab === "s-alerts") renderAlertsList();
  if (currentTab === "s-issues") renderIssuesList();
  if (currentTab === "u-seat") { renderStudentSeatView(); renderHourlyChart(); }
  if (currentTab === "u-books") renderMyBooks();
  if (currentTab === "u-catalog") renderCatalog();
}

const renderers = {
  "u-seat": () => `<div class="welcome-banner" id="stu-welcome"></div><div id="seat-status-area"></div><div class="grid-2col" style="margin-bottom:12px"><div class="card"><div class="card-header"><div class="card-title">My Reservations</div><div class="card-subtitle">Active</div></div><div class="card-body" id="my-reservations-list"></div></div><div class="card"><div class="card-header"><div class="card-title">My Borrowed Books</div><div class="card-subtitle">Currently borrowed</div></div><div class="card-body" id="my-seat-borrowed-list"></div></div></div><div class="card" style="margin-bottom:12px"><div class="card-header"><div class="card-title">Seat Map</div><div class="card-subtitle">Real-time</div></div><div class="card-body"><div class="seats-grid" id="stu-seats"></div></div></div><div class="card"><div class="card-header"><div class="card-title">Busiest Hours (Today)</div></div><div class="card-body"><div class="chart-bar-container" id="hourly-chart"></div></div></div>`,
  "u-books": () => `<div class="card" style="margin-bottom:12px"><div class="card-header"><div class="card-title">Borrow Summary</div><div class="card-subtitle" id="borrow-summary-badge"></div></div><div class="card-body"><div id="due-soon-list"></div></div></div><div class="card"><div class="card-header"><div class="card-title">My Borrowed Books</div><div class="card-subtitle" id="mybooks-count"></div></div><div class="card-body" style="padding:16px 8px"><table class="data-table"><thead><tr><th>Book ID</th><th>Title</th><th>Borrowed</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead><tbody id="mybooks-tbody"></tbody></table></div></div>`,
  "u-catalog": () => `<div class="card" style="margin-bottom:14px"><div class="card-body catalog-user-status" id="catalog-user-status" style="padding:14px 18px"></div></div><input type="text" class="search-bar" id="catalog-search" placeholder="Search books by title, ID, barcode, author, or category..." oninput="renderCatalog()"><div class="book-grid" id="catalog-grid"></div>`
};

window.addEventListener("hashchange", () => {
  if (!currentUser) return;
  const tabId = getTabFromHash();
  if (!tabId || !isTabAllowed(tabId) || tabId === currentTab) return;
  const t = getCurrentTabs().find(x => x.id === tabId);
  if (t) switchTab(t.id, t.s);
});
