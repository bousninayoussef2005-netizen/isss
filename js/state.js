// Shared app state and constants
let currentUser = null, currentTab = null, timerInterval = null, selectedRole = "student", authMode = "signin";
const TIMER_TOTAL = 60, TIMER_WARNING = 15, RESERVE_TIME = 10;

var books = [];
var seats = [];
var transactions = [];
var seatTransactions = [];

let students = [
  { id: "042-0042", name: "Youssef Bousnina", email: "youssef@medtech.tn", password: "pass123", department: "CSE", institution: "MEDTECH", status: "active" },
  { id: "017-0017", name: "Saif Frioui", email: "saif@medtech.tn", password: "pass123", department: "SE", institution: "MEDTECH", status: "active" },
  { id: "091-0091", name: "Wajih Selmi", email: "wajih@medtech.tn", password: "pass123", department: "CSE", institution: "MEDTECH", status: "active" },
  { id: "008-0008", name: "Zeineb Sassi", email: "zeineb@medtech.tn", password: "pass123", department: "RE", institution: "MEDTECH", status: "active" },
  { id: "055-0055", name: "Ahmed Ben Ali", email: "ahmed@medtech.tn", password: "pass123", department: "RE", institution: "MEDTECH", status: "active" },
  { id: "023-0023", name: "Fatma Trabelsi", email: "fatma@medtech.tn", password: "pass123", department: "SE", institution: "MEDTECH", status: "active" }
];

let alerts = [
  { id: 1, table_id: "Table 3", type: "unattended", timestamp: "2026-04-01 14:10", resolved: false },
  { id: 2, table_id: "Table 7", type: "unattended", timestamp: "2026-04-01 13:42", resolved: false }
];

let issues = [
  { id: 1, component: "FSR Sensor - S04", description: "Intermittent readings, may need recalibration", priority: "Medium", status: "Open", date: "2026-04-01 10:00" }
];

let emailLog = [];
var awayTimers = [];
var reservations = [];
const STAFF_ACCOUNTS = [{ name: "Admin", email: "admin@smartlib.edu", password: "admin123" }];
const CATEGORIES = ["Computer Science", "Software Engineering", "Mathematics", "Physics", "Electrical Engineering", "Literature", "Business", "Medicine", "General"];
const SEAT_TYPES = ["Regular", "Quiet Zone", "Computer", "Group Study"];
let hourlyData = Array(12).fill(0);

window.books = books;
window.seats = seats;
window.transactions = transactions;
window.seatTransactions = seatTransactions;
window.reservations = reservations;
window.awayTimers = awayTimers;
window.students = students;
window.RESERVE_TIME = RESERVE_TIME;
window.TIMER_TOTAL = TIMER_TOTAL;
window.TIMER_WARNING = TIMER_WARNING;
