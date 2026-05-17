import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  setDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDazui5ckctTmAYdHOv2OqCXhmYSLv8PX0",
  authDomain: "smart-library-system-b9ba9.firebaseapp.com",
  databaseURL: "https://smart-library-system-b9ba9-default-rtdb.firebaseio.com",
  projectId: "smart-library-system-b9ba9",
  storageBucket: "smart-library-system-b9ba9.firebasestorage.app",
  messagingSenderId: "856093139775",
  appId: "1:856093139775:web:7f23baae653c2cc136a98a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const MAX_ACTIVE_BORROWS = 3;

function listenBooks() {
  onSnapshot(collection(db, "books"), (snapshot) => {
    window.books = [];
    snapshot.forEach((docSnap) => {
      window.books.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    if (window.renderTab) window.renderTab();
  }, (err) => {
    console.error("Books listener error:", err);
    window.showToast("Error loading books from database", "danger");
  });
}

function listenSeats() {
  onSnapshot(collection(db, "seats"), (snapshot) => {
    window.seats = [];
    snapshot.forEach((docSnap) => {
      window.seats.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    if (window.renderTab) window.renderTab();
  }, (err) => {
    console.error("Seats listener error:", err);
    window.showToast("Error loading seats from database", "danger");
  });
}

function listenTransactions() {
  onSnapshot(collection(db, "transactions"), (snapshot) => {
    window.transactions = [];
    snapshot.forEach((docSnap) => {
      window.transactions.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    if (window.notifyDueSoonBooks) window.notifyDueSoonBooks();
    if (window.renderTab) window.renderTab();
  }, (err) => {
    console.error("Transactions listener error:", err);
    window.showToast("Error loading transactions from database", "danger");
  });
}

function listenSeatTransactions() {
  onSnapshot(collection(db, "seat_transactions"), (snapshot) => {
    window.seatTransactions = [];
    snapshot.forEach((docSnap) => {
      window.seatTransactions.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    if (window.rebuildHourlyDataFromSeatTransactions) window.rebuildHourlyDataFromSeatTransactions();
    if (window.renderTab && (window.currentTab === "s-seats" || window.currentTab === "u-seat")) window.renderTab();
  }, (err) => {
    console.error("Seat transactions listener error:", err);
    window.showToast("Error loading seat transactions", "danger");
  });
}

function listenReservations() {
  onSnapshot(collection(db, "reservations"), (snapshot) => {
    if (!window.reservations) window.reservations = [];
    window.reservations.length = 0;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      window.reservations.push({ firebaseId: docSnap.id, ...data });
    });
    if (window.renderTab && (window.currentTab === "s-seats" || window.currentTab === "u-seat")) window.renderTab();
  }, (err) => {
    console.error("Reservations listener error:", err);
    window.showToast("Error loading reservations", "danger");
  });
}

function listenAwayTimers() {
  onSnapshot(collection(db, "away_timers"), (snapshot) => {
    if (!window.awayTimers) window.awayTimers = [];
    window.awayTimers.length = 0;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.active) window.awayTimers.push({ firebaseId: docSnap.id, ...data });
    });
    if (window.renderTab && (window.currentTab === "s-seats" || window.currentTab === "u-seat")) window.renderTab();
  }, (err) => {
    console.error("Away timers listener error:", err);
  });
}

function listenStudents() {
  onSnapshot(collection(db, "students"), (snapshot) => {
    if (!window.students) window.students = [];
    window.students.length = 0;
    snapshot.forEach((docSnap) => {
      window.students.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    if (window.renderTab && window.currentUser?.role === "staff" && window.currentTab === "s-students") {
      window.renderTab();
    }
  }, (err) => {
    console.error("Students listener error:", err);
    window.showToast("Error loading students from database", "danger");
  });
}

window._startFirebaseListeners = function () {
  if (window._firebaseListenersStarted) return;
  window._firebaseListenersStarted = true;
  listenBooks();
  listenSeats();
  listenTransactions();
  listenSeatTransactions();
  listenReservations();
  listenAwayTimers();
  listenStudents();
};

/** Seconds for RFID-driven “kiosk” student session (pick a seat). */
window.KIOSK_SESSION_SECONDS = 15;

let _kioskRfidUnsub = null;
let _kioskRfidInitialSync = true;
const _kioskSeenEventDocIds = new Set();

function resetKioskRfidListenerState() {
  _kioskRfidInitialSync = true;
  _kioskSeenEventDocIds.clear();
}

window.stopKioskRfidListener = function () {
  if (_kioskRfidUnsub) {
    try {
      _kioskRfidUnsub();
    } catch (_) {}
    _kioskRfidUnsub = null;
  }
  resetKioskRfidListenerState();
};

/**
 * Listen for new kiosk_auth_events (rfid_scan, barcode_scan from Pi). Requires Firestore rules
 * to allow client read on kiosk_auth_events (see hardware/pi/FIRESTORE-LAB.md).
 */
window.startKioskEventsListener = function ({ onRfidScan, onBarcodeScan } = {}) {
  window.stopKioskRfidListener();
  resetKioskRfidListenerState();
  const q = query(collection(db, "kiosk_auth_events"), orderBy("timestamp", "desc"), limit(25));
  _kioskRfidUnsub = onSnapshot(
    q,
    (snap) => {
      if (_kioskRfidInitialSync) {
        _kioskRfidInitialSync = false;
        return;
      }
      snap.docChanges().forEach((ch) => {
        if (ch.type !== "added" && ch.type !== "modified") return;
        const docId = ch.doc.id;
        if (_kioskSeenEventDocIds.has(docId)) return;
        const d = ch.doc.data() || {};
        _kioskSeenEventDocIds.add(docId);
        if (_kioskSeenEventDocIds.size > 400) {
          _kioskSeenEventDocIds.clear();
        }
        if (d.action === "rfid_scan" && d.student_id && onRfidScan) {
          onRfidScan({
            studentId: String(d.student_id).trim(),
            uid: d.uid || "",
            docId,
            raw: d,
          });
          return;
        }
        if (d.action === "barcode_scan" && d.barcode && onBarcodeScan) {
          onBarcodeScan({
            barcode: String(d.barcode).trim(),
            intent: d.intent || "borrow",
            docId,
            raw: d,
          });
        }
      });
    },
    (err) => {
      console.error("kiosk_auth_events listener error:", err);
      if (window.showToast) {
        window.showToast(
          "Kiosk: cannot read kiosk_auth_events (Firestore rules / index). See FIRESTORE-LAB.md.",
          "danger",
          8000
        );
      }
    }
  );
};

/** RFID-only listener (seat kiosk). */
window.startKioskRfidListener = function (onRfidScan) {
  window.startKioskEventsListener({ onRfidScan });
};

window.fetchStudentById = async function (studentId) {
  const id = String(studentId || "").trim();
  if (!id) return null;
  const local = (window.students || []).find((s) => s.id === id);
  if (local) return local;
  const r = await getDoc(doc(db, "students", id));
  if (!r.exists()) return null;
  return { firebaseId: r.id, ...r.data() };
};

window.createStudentAccount = async function ({ id, name, email, password, department, institution }) {
  const inst = institution === "MSB" ? "MSB" : "MEDTECH";
  email = (email || "").trim().toLowerCase();
  if (inst === "MEDTECH") {
    if (!/^[a-zA-Z0-9._%+-]+@medtech\.tn$/.test(email)) throw new Error("Email must end with @medtech.tn");
    if (!["CSE", "SE", "RE"].includes(department)) throw new Error("Department must be CSE, SE, or RE");
  } else {
    if (!/^[a-zA-Z0-9._%+-]+@msb\.tn$/.test(email)) throw new Error("Email must end with @msb.tn");
  }
  if (!/^\d{3}-\d{4}$/.test(id || "")) throw new Error("ID format: 123-4567");

  const studentDocRef = doc(db, "students", id);
  const byId = await getDoc(studentDocRef);
  if (byId.exists()) {
    throw new Error("This ID is already used. Please enter your own ID number.");
  }

  const q = query(collection(db, "students"), where("email", "==", email));
  const byEmail = await getDocs(q);
  if (!byEmail.empty) {
    throw new Error("You already have an account with this email.");
  }

  const payload = {
    id,
    name,
    email,
    password,
    institution: inst,
    status: "active"
  };
  if (inst === "MEDTECH") {
    payload.department = department;
  } else {
    payload.department = "";
  }

  await setDoc(studentDocRef, payload);

  return { id, name, email, password, department: payload.department, institution: inst, status: "active" };
};

window.findStudentByCredentials = async function (email, password) {
  const q = query(collection(db, "students"), where("email", "==", email), where("password", "==", password));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { firebaseId: d.id, ...d.data() };
};

window.updateStudentStatusInFirestore = async function (studentId, status) {
  await updateDoc(doc(db, "students", studentId), { status });
};

window.addBook = async function () {
  const barcode = document.getElementById("nb-barcode")?.value.trim() || "";
  const title = document.getElementById("nb-title").value.trim();
  const author = document.getElementById("nb-author").value.trim();
  const cat = document.getElementById("nb-cat").value;
  const qty = parseInt(document.getElementById("nb-qty").value, 10) || 1;
  if (!barcode || !title || !author) return window.showToast("Please fill in barcode, title and author", "danger");
  if (window.books.find((b) => (b.barcode || "").toLowerCase() === barcode.toLowerCase())) {
    return window.showToast("Barcode already exists", "danger");
  }
  const newId = window.nextId(window.books, "BK-");
  try {
    await addDoc(collection(db, "books"), { id: newId, barcode, title, author, category: cat, qty, available: qty, status: "available" });
    window.closeModal();
    window.showToast("Book added successfully!", "success");
  } catch (err) {
    console.error("Add book error:", err);
    window.showToast("Failed to add book: " + err.message, "danger");
  }
};

window.saveEditBook = async function (bookId) {
  const book = window.books.find((b) => b.id === bookId);
  if (!book) return window.showToast("Book not found", "danger");
  const newBarcode = document.getElementById("eb-barcode")?.value.trim() || "";
  const newTitle = document.getElementById("eb-title").value.trim();
  const newAuthor = document.getElementById("eb-author").value.trim();
  const newCat = document.getElementById("eb-cat").value;
  const newQty = parseInt(document.getElementById("eb-qty").value, 10) || 1;
  if (!newBarcode || !newTitle || !newAuthor) return window.showToast("Barcode, title and author are required", "danger");
  if (window.books.find((b) => b.id !== bookId && (b.barcode || "").toLowerCase() === newBarcode.toLowerCase())) {
    return window.showToast("Barcode already exists", "danger");
  }
  const diff = newQty - book.qty;
  const newAvailable = Math.max(0, (book.available || 0) + diff);
  try {
    await updateDoc(doc(db, "books", book.firebaseId), { barcode: newBarcode, title: newTitle, author: newAuthor, category: newCat, qty: newQty, available: newAvailable });
    window.closeModal();
    window.showToast("Book updated successfully!", "success");
  } catch (err) {
    console.error("Edit book error:", err);
    window.showToast("Failed to update book: " + err.message, "danger");
  }
};

window.deleteBook = async function (bookId) {
  const book = window.books.find((b) => b.id === bookId);
  if (!book) return window.showToast("Book not found", "danger");
  if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "books", book.firebaseId));
    window.showToast("Book deleted successfully!", "success");
  } catch (err) {
    console.error("Delete book error:", err);
    window.showToast("Failed to delete book: " + err.message, "danger");
  }
};

window._updateBookStatus = async function (firebaseId, status) {
  try {
    await updateDoc(doc(db, "books", firebaseId), { status });
  } catch (err) {
    console.error("Update book status error:", err);
  }
};

window.addSeat = async function () {
  const seatId = document.getElementById("ns-id").value.trim().toUpperCase();
  const seatType = document.getElementById("ns-type").value;
  if (!seatId) return window.showToast("Please enter a seat ID", "danger");
  if (window.seats.find((s) => s.id === seatId)) return window.showToast("Seat ID already exists", "danger");
  try {
    await setDoc(doc(db, "seats", seatId), { id: seatId, type: seatType, occupied: false, studentId: null });
    window.closeModal();
    window.showToast("Seat added successfully!", "success");
  } catch (err) {
    console.error("Add seat error:", err);
    window.showToast("Failed to add seat: " + err.message, "danger");
  }
};

window.deleteSeat = async function (seatId) {
  try {
    await addDoc(collection(db, "seat_transactions"), { seatId, studentId: null, type: "delete", timestamp: new Date().toISOString() });
    await deleteDoc(doc(db, "seats", seatId));
    window.showToast("Seat deleted successfully!", "success");
  } catch (err) {
    console.error("Delete seat error:", err);
    window.showToast("Failed to delete seat: " + err.message, "danger");
  }
};

window.occupySeatByStudent = async function (seatId, studentId) {
  const seat = (window.seats || []).find((s) => s.id === seatId);
  if (!seat) throw new Error("Seat not found");
  const activeAway = (window.awayTimers || []).find((t) => t.seatId === seatId && t.active && (t.expiresAt || 0) > Date.now());
  if (activeAway && activeAway.studentId !== studentId) throw new Error("Seat is temporarily locked while student is away");
  if (seat.occupied && seat.studentId !== studentId) throw new Error("Seat is already occupied");
  const occupiedBySameStudent = (window.seats || []).find((s) => s.id !== seatId && s.occupied && s.studentId === studentId);
  if (occupiedBySameStudent) throw new Error(`You are already using ${occupiedBySameStudent.id}. Leave it first.`);
  const now = Date.now();
  const reservedByOther = (window.reservations || []).find(
    (r) => r && r.active && r.seatId === seatId && r.studentId !== studentId && (r.expiresAt || 0) > now
  );
  if (reservedByOther) throw new Error("Seat is reserved by another student");
  const seatDocId = seat.firebaseId || seatId;

  await updateDoc(doc(db, "seats", seatDocId), {
    occupied: true,
    studentId,
    fsrPresence: "present"
  });

  await addDoc(collection(db, "seat_transactions"), {
    seatId,
    studentId,
    type: "sit",
    timestamp: new Date().toISOString()
  });
};

window.releaseSeatByStudent = async function (seatId, studentId) {
  const seat = (window.seats || []).find((s) => s.id === seatId);
  if (!seat) throw new Error("Seat not found");
  const seatDocId = seat.firebaseId || seatId;

  await updateDoc(doc(db, "seats", seatDocId), {
    occupied: false,
    studentId: null,
    fsrPresence: null
  });

  await addDoc(collection(db, "seat_transactions"), {
    seatId,
    studentId: studentId || null,
    type: "leave",
    timestamp: new Date().toISOString()
  });
};

window.returnToSeatByStudent = async function (seatId, studentId) {
  const seat = (window.seats || []).find((s) => s.id === seatId);
  if (!seat) throw new Error("Seat not found");
  if (seat.occupied && seat.studentId && seat.studentId !== studentId) {
    throw new Error("Seat is currently assigned to another student");
  }
  const seatDocId = seat.firebaseId || seatId;

  await updateDoc(doc(db, "seats", seatDocId), {
    occupied: true,
    studentId,
    fsrPresence: "present"
  });

  await addDoc(collection(db, "seat_transactions"), {
    seatId,
    studentId,
    type: "return",
    timestamp: new Date().toISOString()
  });
};

window.collectSeatByAdmin = async function (seatId, studentId) {
  const seat = (window.seats || []).find((s) => s.id === seatId);
  if (!seat) throw new Error("Seat not found");
  const seatDocId = seat.firebaseId || seatId;

  await updateDoc(doc(db, "seats", seatDocId), {
    occupied: false,
    studentId: null,
    fsrPresence: null
  });

  await addDoc(collection(db, "seat_transactions"), {
    seatId,
    studentId: studentId || null,
    type: "collect",
    timestamp: new Date().toISOString()
  });
};

window.createSeatReservation = async function (seatId, studentId, studentName = "") {
  const seat = (window.seats || []).find((s) => s.id === seatId);
  if (!seat) throw new Error("Seat not found");
  const activeAway = (window.awayTimers || []).find((t) => t.seatId === seatId && t.active && (t.expiresAt || 0) > Date.now());
  if (activeAway && activeAway.studentId !== studentId) throw new Error("Seat is temporarily locked while student is away");
  if (seat.occupied) throw new Error("Seat already occupied");
  const occupiedBySameStudent = (window.seats || []).find((s) => s.occupied && s.studentId === studentId);
  if (occupiedBySameStudent) throw new Error(`You are already using ${occupiedBySameStudent.id}. You cannot reserve while using a seat.`);
  const existing = (window.reservations || []).find((r) => r && r.active && r.studentId === studentId && (r.expiresAt || 0) > Date.now());
  if (existing) throw new Error("You already have an active reservation");

  const reserveSeconds = Number(window.RESERVE_TIME || 10);
  const now = Date.now();
  const expiresAt = now + reserveSeconds * 1000;
  const seatDocId = seat.firebaseId || seatId;
  const newResRef = doc(collection(db, "reservations"));

  await runTransaction(db, async (transaction) => {
    const slotRef = doc(db, "reservation_slots", seatId);
    const slotSnap = await transaction.get(slotRef);
    if (slotSnap.exists) {
      const sd = slotSnap.data() || {};
      if (sd.active && sd.expiresAt > now && sd.studentId !== studentId) {
        throw new Error("Seat already reserved");
      }
    }
    const seatRef = doc(db, "seats", seatDocId);
    const seatSnap = await transaction.get(seatRef);
    if (!seatSnap.exists || seatSnap.data()?.occupied) {
      throw new Error("Seat not available");
    }
    transaction.set(newResRef, {
      seatId,
      studentId,
      studentName,
      active: true,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      durationSeconds: reserveSeconds
    });
    transaction.set(
      slotRef,
      {
        seatId,
        studentId,
        studentName,
        active: true,
        expiresAt,
        createdAt: new Date(now).toISOString()
      },
      { merge: true }
    );
  });

  await addDoc(collection(db, "seat_transactions"), {
    seatId,
    studentId,
    type: "reserve",
    timestamp: new Date().toISOString()
  });
};

window.cancelSeatReservation = async function (seatId, studentId, reason = "cancel") {
  const reservation = (window.reservations || []).find((r) => r && r.active && r.seatId === seatId && r.studentId === studentId);
  if (!reservation) return;
  await updateDoc(doc(db, "reservations", reservation.firebaseId), { active: false, cancelledAt: new Date().toISOString(), reason });
  try {
    await deleteDoc(doc(db, "reservation_slots", seatId));
  } catch (e) {
    /* slot may not exist for legacy data */
  }
  const txType = reason === "expire" ? "expire" : reason === "claim" ? "claim" : "cancel";
  await addDoc(collection(db, "seat_transactions"), {
    seatId,
    studentId,
    type: txType,
    timestamp: new Date().toISOString()
  });
};

window.startAwayTimer = async function (seatId, studentId) {
  const seat = (window.seats || []).find((s) => s.id === seatId);
  if (!seat) throw new Error("Seat not found");
  if (!seat.occupied || seat.studentId !== studentId) {
    throw new Error("You can only start away timer for your own occupied seat");
  }
  const existing = (window.awayTimers || []).find(
    (t) => t.active && t.seatId === seatId && t.studentId === studentId && (t.expiresAt || 0) > Date.now()
  );
  if (existing) return;
  const awaySeconds = Number(window.TIMER_TOTAL || 60);
  await addDoc(collection(db, "away_timers"), {
    seatId,
    studentId,
    active: true,
    startedAt: Date.now(),
    expiresAt: Date.now() + (awaySeconds * 1000)
  });
};

window.clearAwayTimer = async function (seatId, studentId, reason = "return") {
  const timer = (window.awayTimers || []).find((t) => t.active && t.seatId === seatId && t.studentId === studentId);
  if (!timer) return;
  if (reason === "return") {
    const seat = (window.seats || []).find((s) => s.id === seatId);
    if (!seat || (seat.studentId && seat.studentId !== studentId)) {
      throw new Error("Only the assigned student can clear this away timer");
    }
  }
  await updateDoc(doc(db, "away_timers", timer.firebaseId), {
    active: false,
    endedAt: Date.now(),
    reason
  });
};

window.doCheckout = async function () {
  const sid = document.getElementById("mc-stu").value;
  const bid = document.getElementById("mc-book").value;
  const due = document.getElementById("mc-due").value;
  if (!sid || !bid) return window.showToast("Select student and book", "danger");
  const book = window.books.find((b) => b.id === bid);
  if (!book) return window.showToast("Book not found", "danger");
  if (book.available <= 0) return window.showToast("No copies available", "danger");
  try {
    await addDoc(collection(db, "transactions"), { student_uid: sid, book_id: bid, book_title: book.title, type: "borrow", timestamp: new Date().toLocaleString(), dueDate: due });
    const nextAvailable = book.available - 1;
    const nextStatus = book.status === "missing" ? "missing" : (nextAvailable > 0 ? "available" : "checked-out");
    await updateDoc(doc(db, "books", book.firebaseId), { available: nextAvailable, status: nextStatus });
    window.closeModal();
    window.showToast("Book checked out successfully!", "success");
  } catch (err) {
    console.error("Checkout error:", err);
    window.showToast("Failed to checkout: " + err.message, "danger");
  }
};

window.doReturn = async function () {
  const value = document.getElementById("mr-sel").value;
  if (!value) return window.showToast("Select a borrow record", "danger");
  const [sid, bid] = value.split("|");
  const book = window.books.find((b) => b.id === bid);
  if (!book) return window.showToast("Book not found", "danger");
  try {
    await addDoc(collection(db, "transactions"), { student_uid: sid, book_id: bid, book_title: book.title, type: "return", timestamp: new Date().toLocaleString(), dueDate: null });
    const nextAvailable = Math.min(book.qty, (book.available || 0) + 1);
    const nextStatus = book.status === "missing" ? "missing" : (nextAvailable > 0 ? "available" : "checked-out");
    await updateDoc(doc(db, "books", book.firebaseId), { available: nextAvailable, status: nextStatus });
    window.closeModal();
    window.showToast("Book returned successfully!", "success");
  } catch (err) {
    console.error("Return error:", err);
    window.showToast("Failed to process return: " + err.message, "danger");
  }
};

window.addSeatTransaction = async function (seatId, studentId, type) {
  try {
    await addDoc(collection(db, "seat_transactions"), { seatId, studentId: studentId || null, type, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Seat transaction log error:", err);
  }
};

window.studentBorrowBook = async function (studentId, bookId) {
  const book = (window.books || []).find((b) => b.id === bookId);
  if (!book) throw new Error("Book not found");
  if (book.status === "missing") throw new Error("Book is marked missing");
  if ((book.available || 0) <= 0) throw new Error("No copies available");

  const activeBorrowCount = (window.transactions || []).filter((t) =>
    t.student_uid === studentId &&
    t.type === "borrow" &&
    !(window.transactions || []).some((r) =>
      r.type === "return" &&
      r.student_uid === studentId &&
      r.book_id === t.book_id &&
      new Date(r.timestamp) > new Date(t.timestamp)
    )
  ).length;
  if (activeBorrowCount >= MAX_ACTIVE_BORROWS) {
    throw new Error(`Borrow limit reached (${MAX_ACTIVE_BORROWS} books). Return one book first.`);
  }

  const alreadyBorrowed = (window.transactions || []).some((t) =>
    t.student_uid === studentId &&
    t.book_id === bookId &&
    t.type === "borrow" &&
    !(window.transactions || []).some((r) =>
      r.type === "return" &&
      r.student_uid === studentId &&
      r.book_id === bookId &&
      new Date(r.timestamp) > new Date(t.timestamp)
    )
  );
  if (alreadyBorrowed) throw new Error("You already borrowed this book");

  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  await addDoc(collection(db, "transactions"), {
    student_uid: studentId,
    book_id: book.id,
    book_title: book.title,
    type: "borrow",
    timestamp: new Date().toLocaleString(),
    dueDate
  });

  const nextAvailable = (book.available || 0) - 1;
  const nextStatus = book.status === "missing" ? "missing" : (nextAvailable > 0 ? "available" : "checked-out");
  await updateDoc(doc(db, "books", book.firebaseId), {
    available: nextAvailable,
    status: nextStatus
  });
};

window.studentReturnBook = async function (studentId, bookId) {
  const book = (window.books || []).find((b) => b.id === bookId);
  if (!book) throw new Error("Book not found");

  const hasActiveBorrow = (window.transactions || []).some((t) =>
    t.student_uid === studentId &&
    t.book_id === bookId &&
    t.type === "borrow" &&
    !(window.transactions || []).some((r) =>
      r.type === "return" &&
      r.student_uid === studentId &&
      r.book_id === bookId &&
      new Date(r.timestamp) > new Date(t.timestamp)
    )
  );
  if (!hasActiveBorrow) throw new Error("No active borrow found");

  await addDoc(collection(db, "transactions"), {
    student_uid: studentId,
    book_id: book.id,
    book_title: book.title,
    type: "return",
    timestamp: new Date().toLocaleString(),
    dueDate: null
  });

  const nextAvailable = Math.min(book.qty, (book.available || 0) + 1);
  const nextStatus = book.status === "missing" ? "missing" : (nextAvailable > 0 ? "available" : "checked-out");
  await updateDoc(doc(db, "books", book.firebaseId), {
    available: nextAvailable,
    status: nextStatus
  });
};
