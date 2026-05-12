function showToast(m, t = "info", d = 4000) { const el = document.getElementById("toast"); el.textContent = m; el.className = "toast " + t; el.style.display = "block"; setTimeout(() => el.style.display = "none", d); }
function formatTime(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function relTime(ts) { const d = new Date(ts), now = new Date(), diff = Math.floor((now - d) / 1000); if (diff < 60) return "just now"; if (diff < 3600) return Math.floor(diff / 60) + "m ago"; if (diff < 86400) return Math.floor(diff / 3600) + "h ago"; return Math.floor(diff / 86400) + "d ago"; }
function daysUntil(date) { if (!date) return null; const d = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24)); return d; }
function nextId(arr, prefix) { const nums = arr.map(x => parseInt(x.id.replace(/\D/g, "")) || 0); return prefix + String(Math.max(...nums, 0) + 1).padStart(3, "0"); }

function openModal(title, bodyHtml, footerHtml = "") {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-footer").innerHTML = footerHtml;
  document.getElementById("modal-overlay").classList.add("open");
}
function closeModal() { document.getElementById("modal-overlay").classList.remove("open"); }
function confirmAction(title, msg, onYes) {
  openModal(title, `<p class="confirm-text">${msg}</p>`, `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-red" onclick="closeModal();(${onYes.toString()})()">Confirm</button>`);
}

window.nextId = nextId;
