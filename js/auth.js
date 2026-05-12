function switchRole(r) { selectedRole = r; document.getElementById("role-student-btn").classList.toggle("active", r === "student"); document.getElementById("role-staff-btn").classList.toggle("active", r === "staff"); document.getElementById("student-auth").style.display = r === "student" ? "block" : "none"; document.getElementById("staff-auth").style.display = r === "staff" ? "block" : "none"; hideErr(); }
function switchAuthMode(m) { authMode = m; document.getElementById("stu-signin-btn").classList.toggle("active", m === "signin"); document.getElementById("stu-signup-btn").classList.toggle("active", m === "signup"); document.getElementById("student-signin").style.display = m === "signin" ? "block" : "none"; document.getElementById("student-signup").style.display = m === "signup" ? "block" : "none"; hideErr(); if (m === "signup") updateSignupInstitutionUI(); }

function toggleSignupPassword() {
  const input = document.getElementById("su-pw");
  const btn = document.getElementById("su-pw-toggle");
  if (!input || !btn) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  btn.textContent = showing ? "Show password" : "Hide password";
}
function hideErr() { document.getElementById("login-error").style.display = "none"; document.getElementById("login-error-staff").style.display = "none"; }
function showErr(id, m) { const el = document.getElementById(id); el.textContent = m; el.style.display = "block"; }

function isMedtechStudentEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@medtech\.tn$/.test((email || "").trim().toLowerCase());
}

function isMsbStudentEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@msb\.tn$/.test((email || "").trim().toLowerCase());
}

function _suIdFormatHandler(e) {
  formatStudentIdInput(e.target);
}

function updateSignupInstitutionUI() {
  const medtechEl = document.getElementById("su-inst-medtech");
  const idEl = document.getElementById("su-id");
  const emailEl = document.getElementById("su-email");
  const deptWrap = document.getElementById("su-dept-wrap");
  if (!medtechEl || !idEl || !emailEl || !deptWrap) return;
  const medtech = medtechEl.checked;
  deptWrap.style.display = medtech ? "" : "none";
  idEl.removeEventListener("input", _suIdFormatHandler);
  idEl.addEventListener("input", _suIdFormatHandler);
  idEl.maxLength = 8;
  idEl.placeholder = "123-4567";
  idEl.setAttribute("inputmode", "numeric");
  emailEl.placeholder = medtech ? "name@medtech.tn" : "name@msb.tn";
  _suIdPrevDigitLen = 0;
}

let _suIdPrevDigitLen = 0;

/** Digits only (max 7). Inserts "-" right after the 3rd digit; keeps backspace from sticking on "123-". */
function formatStudentIdInput(el) {
  const d = el.value.replace(/\D/g, "").slice(0, 7);
  const prev = _suIdPrevDigitLen;
  _suIdPrevDigitLen = d.length;
  if (d.length === 0) {
    el.value = "";
    return;
  }
  if (d.length <= 3) {
    const hyphenAfterThird = d.length === 3 && prev === 2;
    el.value = hyphenAfterThird ? d + "-" : d;
  } else {
    el.value = d.slice(0, 3) + "-" + d.slice(3);
  }
}

async function studentSignIn() {
  const email = document.getElementById("si-email").value.trim().toLowerCase(), pw = document.getElementById("si-pw").value;
  if (!email || !pw) return showErr("login-error", "Enter email and password.");
  let u = (window.students || []).find(s => s.email.toLowerCase() === email && s.password === pw);
  if (!u && window.findStudentByCredentials) {
    try {
      u = await window.findStudentByCredentials(email, pw);
      if (u && window.students && !window.students.find(s => s.id === u.id)) window.students.push(u);
    } catch (err) {
      console.error("Sign-in query error:", err);
    }
  }
  if (!u) return showErr("login-error", "Invalid credentials.");
  if (u.status === "banned") return showErr("login-error", "Unfortunately, you are banned. Please check with the administration.");
  window._dueSoonNotifiedKey = null;
  currentUser = { ...u, role: "student", seatId: null, status: "no-seat", reservationId: null };
  const s = seats.find(x => x.studentId === u.id); if (s) { currentUser.seatId = s.id; currentUser.status = s.occupied ? "seated" : "away"; }
  enterDashboard();
}

const ALLOWED_DEPTS = ["CSE", "SE", "RE"];

async function studentSignUp() {
  const medtech = document.getElementById("su-inst-medtech").checked;
  const institution = medtech ? "MEDTECH" : "MSB";
  const name = document.getElementById("su-name").value.trim();
  const email = document.getElementById("su-email").value.trim().toLowerCase();
  const id = document.getElementById("su-id").value.trim();
  const dept = medtech ? document.getElementById("su-dept").value : "";
  const pw = document.getElementById("su-pw").value;

  if (!name || !email || !id || !pw) return showErr("login-error", "Fill in all fields.");
  if (medtech && !dept) return showErr("login-error", "Select a department.");
  if (pw.length < 6) return showErr("login-error", "Password: min 6 characters.");

  if (medtech) {
    if (!isMedtechStudentEmail(email)) return showErr("login-error", "Email must be your @medtech.tn address.");
    if (!ALLOWED_DEPTS.includes(dept)) return showErr("login-error", "Choose a valid department (CSE, SE, or RE).");
  } else {
    if (!isMsbStudentEmail(email)) return showErr("login-error", "Email must be your @msb.tn address.");
  }
  if (!/^\d{3}-\d{4}$/.test(id)) return showErr("login-error", "Student ID format: 3 digits, hyphen, 4 digits (e.g. 042-1234).");

  if ((window.students || []).find(s => s.email === email)) return showErr("login-error", "You already have an account with this email.");
  if ((window.students || []).find(s => s.id === id)) return showErr("login-error", "This ID is already used. Please enter your own ID number.");

  let created;
  if (window.createStudentAccount) {
    try {
      created = await window.createStudentAccount({ id, name, email, password: pw, department: dept, institution });
      if (window.students && !window.students.find(s => s.id === created.id)) window.students.push(created);
    } catch (err) {
      return showErr("login-error", err.message || "Failed to create account.");
    }
  } else {
    created = { id, name, email, password: pw, department: dept, institution, status: "active" };
    if (window.students) window.students.push(created);
  }

  window._dueSoonNotifiedKey = null;
  currentUser = { id: created.id, name: created.name, email: created.email, department: created.department, institution: created.institution, role: "student", seatId: null, status: "no-seat", reservationId: null, password: created.password };
  showToast("Account created!", "success");
  enterDashboard();
}

function loginStaff() {
  const email = document.getElementById("staff-email").value.trim().toLowerCase(), pw = document.getElementById("staff-pw").value;
  if (!email || !pw) return showErr("login-error-staff", "Enter email and password.");
  const m = STAFF_ACCOUNTS.find(a => a.email.toLowerCase() === email && a.password === pw);
  if (!m) return showErr("login-error-staff", "Invalid credentials.");
  window._dueSoonNotifiedKey = null;
  currentUser = { id: "STAFF", name: m.name, email: m.email, role: "staff" };
  enterDashboard();
}

function logout() {
  currentUser = null;
  window._dueSoonNotifiedKey = null;
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.querySelectorAll("#login-screen input").forEach(i => { if (i.type !== "radio") i.value = ""; });
  document.querySelectorAll("#login-screen select").forEach(s => { s.selectedIndex = 0; });
  const mt = document.getElementById("su-inst-medtech"), msb = document.getElementById("su-inst-msb");
  if (mt && msb) { mt.checked = true; msb.checked = false; updateSignupInstitutionUI(); }
  hideErr();
  if (window.location.hash) window.location.hash = "";
}

document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || document.getElementById("login-screen").style.display === "none") return;
  selectedRole === "staff" ? loginStaff() : authMode === "signin" ? studentSignIn() : studentSignUp();
});

if (document.getElementById("su-inst-medtech")) updateSignupInstitutionUI();
