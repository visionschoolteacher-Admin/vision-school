"use strict";

/* =========================================================
   VISION SCHOOL - FINAL MULTI-DEVICE APP
   IMPORTANT:
   - The Supabase client variable is named "db".
   - Do NOT create another variable named "supabase".
   - Attendance INSERT intentionally does NOT send "level".
     Your attendance table does not have a level column.
   ========================================================= */

const SUPABASE_URL = "https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

let db = null;

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  console.error("Supabase library did not load.");
} else {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

const STUDENTS_TABLE = "students";
const ATTENDANCE_TABLE = "attendance";
const GUESTS_TABLE = "guests";
const GUEST_LOGS_TABLE = "guest_logs";

let studentsCache = [];
let attendanceCache = [];
let guestsCache = [];
let guestLogsCache = [];
let guestTableAvailable = true;
let guestLogsAvailable = true;
let currentStudent = null;
let selectedPickup = null;
let qrScanner = null;
let scannerRunning = false;
let realtimeChannel = null;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function attr(v) { return esc(v).replace(/`/g, "&#96;"); }

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(window.__visionToast);
  window.__visionToast = setTimeout(() => el.style.display = "none", 3000);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function now() {
  return new Date().toLocaleTimeString([], {
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
}

function updateClock() {
  const clock = document.getElementById("clock");
  const date = document.getElementById("dateText");
  const d = new Date();

  if (clock) {
    clock.textContent = d.toLocaleTimeString([], {
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }
  if (date) {
    date.textContent = d.toLocaleDateString([], {
      weekday:"short", year:"numeric", month:"short", day:"numeric"
    });
  }
}

function updateOnlineStatus() {
  const badge = document.getElementById("onlineBadge");
  const text = document.getElementById("connectionText");
  const dot = document.getElementById("statusDot");
  const online = navigator.onLine;

  if (badge) {
    badge.textContent = online ? "ONLINE" : "OFFLINE";
    badge.className = "badge " + (online ? "online" : "offline");
  }
  if (text) text.textContent = online ? "Connected" : "No internet connection";
  if (dot) dot.classList.toggle("online", online);
}

function show(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.screen === screenId)
  );

  document.getElementById(screenId)?.classList.add("active");

  const titles = {
    home:"Dashboard",
    scanner:"Scan QR Code",
    students:"Students",
    addStudent:"Add Student",
    student:"Student Details",
    pickup:"Pickup / Time Out",
    guests:"Guests",
    reports:"Reports",
    about:"About System"
  };

  const title = document.getElementById("pageTitle");
  if (title) title.textContent = titles[screenId] || "Vision School";

  if (screenId !== "scanner") stopScanner();

  if (screenId === "home") refreshDashboard();
  if (screenId === "students") renderStudents();
  if (screenId === "guests") renderGuests();
  if (screenId === "reports") renderReports();

  window.scrollTo({top:0, behavior:"smooth"});
}

function normalizeStudent(s) {
  return {
    ...s,
    id: String(s.id ?? "").trim(),
    name: String(s.name ?? "").trim(),
    level: String(s.level ?? "").trim(),
    parent: String(s.parent ?? "").trim(),
    phone: String(s.phone ?? "").trim(),
    authorized: Array.isArray(s.authorized) ? s.authorized : []
  };
}

function normalizeAttendance(a) {
  return {
    ...a,
    student_id: a.student_id ?? a.studentId ?? "",
    student_name: a.student_name ?? a.studentName ?? "",
    date: a.date ?? "",
    time_in: a.time_in ?? a.timeIn ?? "",
    time_out: a.time_out ?? a.timeOut ?? "",
    pickup_person: a.pickup_person ?? a.pickupPerson ?? "",
    pickup_relationship: a.pickup_relationship ?? a.pickupRelationship ?? "",
    pickup_phone: a.pickup_phone ?? a.pickupPhone ?? "",
    pickup_option: a.pickup_option ?? a.pickupOption ?? "",
    staff: a.staff ?? "",
    approver: a.approver ?? "",
    notes: a.notes ?? ""
  };
}

function normalizeGuest(g) {
  return {
    ...g,
    id: g.id,
    guest_name: String(g.guest_name ?? "").trim(),
    contact_number: String(g.contact_number ?? "").trim(),
    purpose: String(g.purpose ?? "").trim()
  };
}

async function ensureDb() {
  if (!db) {
    toast("Supabase library did not load. Please refresh the page.");
    return false;
  }
  if (!navigator.onLine) {
    toast("You are offline. Please reconnect to the internet.");
    return false;
  }
  return true;
}

async function loadStudents() {
  if (!db) return;
  const result = await db.from(STUDENTS_TABLE).select("*").order("name", {ascending:true});
  if (result.error) {
    console.error("STUDENTS ERROR:", result.error);
    throw result.error;
  }
  studentsCache = (result.data || []).map(normalizeStudent);
}

async function loadAttendance() {
  if (!db) return;
  const result = await db.from(ATTENDANCE_TABLE).select("*").order("created_at", {ascending:false});
  if (result.error) {
    console.error("ATTENDANCE ERROR:", result.error);
    throw result.error;
  }
  attendanceCache = (result.data || []).map(normalizeAttendance);
}

async function loadGuests() {
  if (!db) return;
  const result = await db.from(GUESTS_TABLE).select("*").order("created_at", {ascending:false});
  if (result.error) {
    guestTableAvailable = false;
    guestsCache = [];
    console.warn("Guest table unavailable:", result.error);
    return;
  }
  guestTableAvailable = true;
  guestsCache = (result.data || []).map(normalizeGuest);
}

async function loadGuestLogs() {
  if (!db) return;
  const result = await db.from(GUEST_LOGS_TABLE).select("*").order("created_at", {ascending:false});
  if (result.error) {
    guestLogsAvailable = false;
    guestLogsCache = [];
    console.warn("Guest logs unavailable:", result.error);
    return;
  }
  guestLogsAvailable = true;
  guestLogsCache = result.data || [];
}

async function refreshAll() {
  if (!(await ensureDb())) return;

  try {
    console.log("Loading Vision School database...");
    await loadStudents();
    await loadAttendance();
    await loadGuests();
    await loadGuestLogs();

    refreshDashboard();
    renderStudents();
    renderGuests();
    renderReports();

    console.log("✓ Vision School database loading completed.");
  } catch (error) {
    console.error("DATABASE LOAD ERROR:", error);
    toast("Could not load database. Check Supabase RLS policies.");
  }
}

function setupRealtime() {
  if (!db || realtimeChannel) return;

  realtimeChannel = db.channel("vision-school-live")
    .on("postgres_changes", {
      event:"*", schema:"public", table:STUDENTS_TABLE
    }, async () => {
      await loadStudents();
      refreshDashboard();
      renderStudents();
      if (currentStudent) await refreshCurrentStudent();
    })
    .on("postgres_changes", {
      event:"*", schema:"public", table:ATTENDANCE_TABLE
    }, async () => {
      await loadAttendance();
      refreshDashboard();
      if (currentStudent) await refreshCurrentStudent();
      renderReports();
    })
    .on("postgres_changes", {
      event:"*", schema:"public", table:GUESTS_TABLE
    }, async () => {
      await loadGuests();
      refreshDashboard();
      renderGuests();
    })
    .on("postgres_changes", {
      event:"*", schema:"public", table:GUEST_LOGS_TABLE
    }, async () => {
      await loadGuestLogs();
      renderReports();
    })
    .subscribe(status => {
      console.log("Vision School realtime status:", status);
    });
}

function refreshDashboard() {
  const date = today();
  const todays = attendanceCache.filter(a => a.date === date);
  const timeIn = todays.filter(a => a.time_in);
  const picked = todays.filter(a => a.time_out);

  const set = (id, value) => {
    const e = document.getElementById(id);
    if (e) e.textContent = value;
  };

  set("totalStudents", studentsCache.length);
  set("timeInCount", timeIn.length);
  set("inSchoolCount", todays.filter(a => a.time_in && !a.time_out).length);
  set("pickedCount", picked.length);
  set("notInCount", Math.max(0, studentsCache.length - timeIn.length));

  const activity = document.getElementById("activity");
  if (!activity) return;

  const studentRows = todays
    .slice()
    .sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0,6)
    .map(a => `
      <div class="activity-row">
        <b>${esc(a.student_name)}</b> — ${a.time_out ? "PICKED UP" : "IN SCHOOL"}
        <br><span class="muted">${esc(a.time_in || "")}${a.time_out ? ` → ${esc(a.time_out)}` : ""}${a.pickup_person ? ` • ${esc(a.pickup_person)}` : ""}</span>
      </div>
    `);

  const guestRows = guestsCache.slice(0,3).map(g => `
    <div class="activity-row">
      <b>GUEST: ${esc(g.guest_name)}</b> — REGISTERED
      <br><span class="muted">${esc(g.purpose)}</span>
    </div>
  `);

  activity.innerHTML = studentRows.concat(guestRows).join("") ||
    '<p class="muted">No activity yet.</p>';
}

function addPickupPersonField() {
  const container = document.getElementById("pickupPeopleContainer");
  if (!container) return;

  const card = document.createElement("div");
  card.className = "student-card";
  card.innerHTML = `
    <div class="row">
      <b>Authorized Person</b>
      <button type="button" class="danger" onclick="this.closest('.student-card').remove()">Remove</button>
    </div>
    <label>Full Name</label>
    <input class="pickup-name" placeholder="Full name">
    <label>Relationship</label>
    <input class="pickup-relationship" placeholder="Mother, Father, Aunt...">
    <label>Contact Number</label>
    <input class="pickup-phone" placeholder="Phone number">
  `;
  container.appendChild(card);
}

function clearStudentForm() {
  [
    "studentIdInput",
    "studentNameInput",
    "studentLevelInput",
    "studentParentInput",
    "studentPhoneInput"
  ].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = "";
  });

  const c = document.getElementById("pickupPeopleContainer");
  if (c) c.innerHTML = "";

  const m = document.getElementById("studentMessage");
  if (m) m.innerHTML = "";

  addPickupPersonField();
}

function showStudentMessage(message, type="success") {
  const e = document.getElementById("studentMessage");
  if (!e) return;
  e.innerHTML = `<div class="${type === "warning" ? "warning" : "success"}">${esc(message)}</div>`;
  setTimeout(() => { e.innerHTML = ""; }, 3500);
}

async function addStudent(event) {
  if (event) event.preventDefault();
  if (!(await ensureDb())) return;

  const id = document.getElementById("studentIdInput")?.value.trim().toUpperCase();
  const name = document.getElementById("studentNameInput")?.value.trim();
  const level = document.getElementById("studentLevelInput")?.value.trim();
  const parent = document.getElementById("studentParentInput")?.value.trim();
  const phone = document.getElementById("studentPhoneInput")?.value.trim();

  if (!id || !name || !level || !parent) {
    showStudentMessage("Please complete Student ID, Name, Level/Grade, and Parent/Guardian.", "warning");
    return;
  }

  if (studentsCache.some(s => s.id.toUpperCase() === id)) {
    showStudentMessage("This Student ID already exists.", "warning");
    return;
  }

  const authorized = [...document.querySelectorAll("#pickupPeopleContainer .student-card")]
    .map(card => ({
      name: card.querySelector(".pickup-name")?.value.trim() || "",
      relationship: card.querySelector(".pickup-relationship")?.value.trim() || "",
      phone: card.querySelector(".pickup-phone")?.value.trim() || ""
    }))
    .filter(p => p.name);

  const result = await db.from(STUDENTS_TABLE).insert({
    id, name, level, parent, phone, authorized
  });

  if (result.error) {
    console.error("STUDENT SAVE ERROR:", result.error);
    showStudentMessage("Save failed: " + result.error.message, "warning");
    return;
  }

  showStudentMessage(`${name} was added successfully.`);
  clearStudentForm();
  await loadStudents();
  renderStudents();
  refreshDashboard();
  toast("Student added to shared database.");
}

function renderStudents() {
  const container = document.getElementById("studentList");
  if (!container) return;

  const q = (document.getElementById("studentSearch")?.value || "").toLowerCase().trim();

  const rows = studentsCache
    .filter(s =>
      !q ||
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.level.toLowerCase().includes(q)
    )
    .sort((a,b) => a.name.localeCompare(b.name));

  if (!rows.length) {
    container.innerHTML = '<p class="muted">No students found.</p>';
    return;
  }

  container.innerHTML = rows.map(s => `
    <div class="student-card">
      <div class="student-title">
        <div>
          <h3>${esc(s.name)}</h3>
          <div>${esc(s.id)} • ${esc(s.level)}</div>
          <div class="muted">Parent: ${esc(s.parent)}</div>
        </div>
        <span class="pill">${(s.authorized || []).length} authorized</span>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="primary" onclick="generateStudentQR('${attr(s.id)}')">🔲 Generate QR</button>
        <button class="secondary" onclick="viewStudent('${attr(s.id)}')">👁 View</button>
        <button class="danger" onclick="deleteStudent('${attr(s.id)}')">🗑 Remove</button>
      </div>
    </div>
  `).join("");
}

async function deleteStudent(id) {
  if (!(await ensureDb())) return;
  const s = studentsCache.find(x => x.id === id);
  if (!s) return;

  if (!confirm(`Remove ${s.name} (${s.id})?`)) return;

  const result = await db.from(STUDENTS_TABLE).delete().eq("id", id);

  if (result.error) {
    toast("Delete failed: " + result.error.message);
    return;
  }

  toast("Student removed.");
  await loadStudents();
  refreshDashboard();
  renderStudents();
}

async function viewStudent(id) {
  currentStudent = studentsCache.find(s => s.id === id) || null;
  if (!currentStudent) {
    toast("Student not found.");
    return;
  }
  renderStudent(currentStudent);
  show("student");
}

function generateStudentQR(id) {
  document.getElementById("qrModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "qrModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-box">
      <h2>Student QR Code</h2>
      <p class="muted">Student ID</p>
      <h2>${esc(id)}</h2>
      <div id="qrCodeBox" style="display:flex;justify-content:center;margin:18px"></div>
      <p class="muted">This QR contains only the Student ID.</p>
      <div class="row">
        <button class="primary" onclick="downloadStudentQR('${attr(id)}')">💾 Download</button>
        <button class="secondary" onclick="document.getElementById('qrModal')?.remove()">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  try {
    if (typeof QRCode === "undefined") throw new Error("QRCode library unavailable");

    new QRCode(document.getElementById("qrCodeBox"), {
      text:id,
      width:250,
      height:250,
      correctLevel:QRCode.CorrectLevel.H
    });
  } catch (error) {
    console.error(error);
    document.getElementById("qrCodeBox").innerHTML =
      '<div class="warning">QR generator failed to load. Check internet connection.</div>';
  }
}

function downloadStudentQR(id) {
  const box = document.getElementById("qrCodeBox");
  const canvas = box?.querySelector("canvas");
  const img = box?.querySelector("img");

  if (canvas) {
    const a = document.createElement("a");
    a.download = `${id}_QR.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  } else if (img) {
    const a = document.createElement("a");
    a.download = `${id}_QR.png`;
    a.href = img.src;
    a.click();
  } else {
    toast("QR code is not ready.");
  }
}

function attendanceFor(id) {
  return attendanceCache.find(a =>
    a.date === today() && String(a.student_id) === String(id)
  );
}

async function refreshCurrentStudent() {
  if (!currentStudent) return;
  const fresh = studentsCache.find(s => s.id === currentStudent.id);
  if (fresh) {
    currentStudent = fresh;
    renderStudent(fresh);
  }
}

function renderStudent(s) {
  const record = attendanceFor(s.id);
  const auth = s.authorized || [];
  const status = record?.time_out
    ? "PICKED UP"
    : record?.time_in
      ? "IN SCHOOL"
      : "NOT CHECKED IN";

  const cls = record?.time_out
    ? "status-out"
    : record?.time_in
      ? "status-in"
      : "status-none";

  const card = document.getElementById("studentCard");
  if (!card) return;

  card.innerHTML = `
    <h2>Student Details</h2>
    <h2>${esc(s.name)}</h2>
    <p><b>Student ID:</b> ${esc(s.id)}</p>
    <p><b>Level / Grade:</b> ${esc(s.level)}</p>
    <p><b>Parent / Guardian:</b> ${esc(s.parent)}</p>
    <p><b>Parent Phone:</b> ${esc(s.phone || "-")}</p>
    <p><b>Authorized Pickup People:</b> ${auth.length}</p>
    ${
      auth.length
      ? `<div class="student-card">${auth.map((p,i) =>
          `<div><b>${i+1}. ${esc(p.name)}</b> — ${esc(p.relationship || "")}${p.phone ? ` • ${esc(p.phone)}` : ""}</div>`
        ).join("")}</div>`
      : `<p class="muted">No authorized pickup people registered.</p>`
    }
    <p><b>Status:</b> <span class="pill ${cls}">${status}</span></p>
    ${record?.time_in ? `<p><b>Time In:</b> ${esc(record.time_in)}</p>` : ""}
    ${record?.time_out ? `<p><b>Time Out:</b> ${esc(record.time_out)}</p><p><b>Pickup:</b> ${esc(record.pickup_person || "-")}</p>` : ""}
    <div class="row" style="margin-top:16px">
      ${
        !record?.time_in
        ? '<button class="primary" onclick="timeIn()">⏱️ TIME IN</button>'
        : !record?.time_out
          ? '<button class="primary" onclick="openPickup()">🚗 PICKUP / TIME OUT</button>'
          : ""
      }
      <button class="secondary" onclick="show('scanner')">← Scan Another</button>
    </div>
  `;
}

/* =========================
   TIME IN
   ========================= */

async function timeIn() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  if (!(await ensureDb())) return;

  const existing = attendanceFor(currentStudent.id);

  if (existing?.time_in) {
    toast(`Already checked in at ${existing.time_in}.`);
    return;
  }

  /*
    IMPORTANT:
    Do NOT include "level" here.
    Your attendance table does not have a level column.
  */
  const payload = {
    date: today(),
    student_id: currentStudent.id,
    student_name: currentStudent.name,
    time_in: now(),
    time_out: null,
    pickup_person: null,
    pickup_relationship: null,
    pickup_phone: null,
    pickup_option: null,
    staff: "Staff",
    approver: null,
    notes: null
  };

  console.log("Saving Time In:", payload);

  const result = await db.from(ATTENDANCE_TABLE).insert(payload);

  if (result.error) {
    console.error("TIME IN ERROR:", result.error);
    toast("Time In failed: " + result.error.message);
    return;
  }

  await loadAttendance();
  renderStudent(currentStudent);
  refreshDashboard();
  toast("TIME IN SUCCESSFUL");
}

/* =========================
   PICKUP
   ========================= */

async function openPickup() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  const record = attendanceFor(currentStudent.id);

  if (!record?.time_in) {
    toast("WARNING: Student has no TIME IN today.");
    return;
  }

  if (record.time_out) {
    toast("Student already picked up.");
    return;
  }

  selectedPickup = null;

  const auth = currentStudent.authorized || [];
  const card = document.getElementById("pickupCard");
  if (!card) return;

  card.innerHTML = `
    <h2>🚗 Secure Pickup / Time Out</h2>
    <h3>${esc(currentStudent.name)}</h3>
    <p>${esc(currentStudent.id)} • ${esc(currentStudent.level)}</p>
    <hr>
    <h3>Authorized Pickup Person</h3>
    <div class="option-grid">
      ${
        auth.length
        ? auth.map((p,i) => `
          <div id="authOption${i}" class="option" onclick="selectAuth(${i})">
            <b>${esc(p.name)}</b><br>
            ${esc(p.relationship || "")}${p.phone ? ` • ${esc(p.phone)}` : ""}
          </div>
        `).join("")
        : '<div class="warning">No authorized pickup persons are registered.</div>'
      }
    </div>

    <label>Pickup Option</label>
    <select id="pickupOption" onchange="optionChanged()">
      <option value="">Select an option...</option>
      <option value="AUTHORIZED">Authorized pickup person</option>
      <option value="UNAUTHORIZED_APPROVAL">Unauthorized person — Admin Approval</option>
      <option value="EMERGENCY_APPROVAL">Emergency / Parent Phone Confirmation</option>
      <option value="OTHER_APPROVAL">Other — Admin Approval</option>
    </select>

    <div id="unauthorizedFields"></div>

    <div class="row">
      <button class="secondary" onclick="show('student')">Cancel</button>
      <button class="primary" onclick="confirmPickup()">CONFIRM PICKUP</button>
    </div>
  `;

  card.dataset.authorized = JSON.stringify(auth);
  show("pickup");
}

function selectAuth(index) {
  const auth = JSON.parse(
    document.getElementById("pickupCard")?.dataset.authorized || "[]"
  );
  const person = auth[index];
  if (!person) return;

  selectedPickup = {...person, option:"AUTHORIZED"};

  document.getElementById("pickupOption").value = "AUTHORIZED";
  document.getElementById("unauthorizedFields").innerHTML = "";

  document.querySelectorAll(".option").forEach(x => x.classList.remove("selected"));
  document.getElementById(`authOption${index}`)?.classList.add("selected");
}

function optionChanged() {
  const value = document.getElementById("pickupOption")?.value;
  const fields = document.getElementById("unauthorizedFields");

  selectedPickup = null;
  if (!fields) return;

  if (value === "AUTHORIZED" || !value) {
    fields.innerHTML = "";
    return;
  }

  fields.innerHTML = `
    <label>Pickup Person Full Name *</label>
    <input id="upName" placeholder="Full name">
    <label>Relationship</label>
    <input id="upRel" placeholder="Aunt, Grandparent...">
    <label>Contact Number</label>
    <input id="upPhone" placeholder="Phone number">
    <label>Vehicle Plate Number <span class="muted">(optional)</span></label>
    <input id="upPlate" placeholder="e.g. 1234 ABC">
    <label>Reason / Notes</label>
    <textarea id="upReason" rows="3" placeholder="Explain why this person is picking up the student."></textarea>
    <label>Approving Staff *</label>
    <input id="approver" placeholder="Admin / authorized staff name">
    <div class="warning"><b>⚠ APPROVAL REQUIRED</b><br>Do not release the student until authorized staff approves this request.</div>
  `;
}

async function confirmPickup() {
  if (!currentStudent) return;
  if (!(await ensureDb())) return;

  const option = document.getElementById("pickupOption")?.value;
  if (!option) {
    toast("Please select a pickup option.");
    return;
  }

  let pickup = selectedPickup;

  if (option === "AUTHORIZED") {
    if (!pickup) {
      toast("Please select an authorized pickup person.");
      return;
    }
  } else {
    const name = document.getElementById("upName")?.value.trim();
    const relationship = document.getElementById("upRel")?.value.trim();
    const phone = document.getElementById("upPhone")?.value.trim();
    const plate = document.getElementById("upPlate")?.value.trim();
    const reason = document.getElementById("upReason")?.value.trim();
    const approver = document.getElementById("approver")?.value.trim();

    if (!name || !approver) {
      toast("Pickup person name and approving staff are required.");
      return;
    }

    pickup = {name, relationship, phone, plate, reason, approver, option};

    if (!confirm("Confirm ADMIN APPROVAL and release this student?")) return;
  }

  const record = attendanceFor(currentStudent.id);

  if (!record || !record.time_in || record.time_out) {
    toast("Attendance record is not ready for pickup.");
    return;
  }

  const notes = [
    record.notes || "",
    pickup.plate ? `Plate: ${pickup.plate}` : "",
    pickup.reason || ""
  ].filter(Boolean).join(" | ");

  const payload = {
    time_out: now(),
    pickup_person: pickup.name || null,
    pickup_relationship: pickup.relationship || null,
    pickup_phone: pickup.phone || null,
    pickup_option: option,
    approver: pickup.approver || null,
    notes: notes || null
  };

  const result = await db
    .from(ATTENDANCE_TABLE)
    .update(payload)
    .eq("id", record.id);

  if (result.error) {
    console.error("PICKUP ERROR:", result.error);
    toast("Pickup failed: " + result.error.message);
    return;
  }

  await loadAttendance();
  currentStudent = null;
  refreshDashboard();
  show("home");
  toast("PICKUP SUCCESSFUL");
}

/* =========================
   QR SCANNER
   ========================= */

async function startScanner() {
  if (typeof Html5Qrcode === "undefined") {
    toast("QR scanner library did not load.");
    return;
  }

  if (scannerRunning) return;

  const reader = document.getElementById("reader");
  if (!reader) return;

  reader.innerHTML = "";
  qrScanner = new Html5Qrcode("reader");

  try {
    await qrScanner.start(
      {facingMode:"environment"},
      {fps:10, qrbox:{width:250,height:250}},
      text => handleScan(text),
      () => {}
    );

    scannerRunning = true;

    const message = document.getElementById("scanMessage");
    if (message) {
      message.innerHTML = '<div class="success">Camera is ready. Point it at the QR code.</div>';
    }
  } catch (error) {
    console.error("CAMERA ERROR:", error);
    scannerRunning = false;
    toast("Camera could not start. Allow camera permission and try again.");
  }
}

async function stopScanner() {
  if (!qrScanner) {
    scannerRunning = false;
    return;
  }

  try {
    if (scannerRunning) await qrScanner.stop();
  } catch (_) {}

  try {
    await qrScanner.clear();
  } catch (_) {}

  qrScanner = null;
  scannerRunning = false;
}

async function handleScan(raw) {
  const id = String(raw || "").trim().toUpperCase();

  if (!id) {
    toast("No Student ID detected.");
    return;
  }

  await stopScanner();

  const student = studentsCache.find(s => s.id.toUpperCase() === id);

  if (!student) {
    const message = document.getElementById("scanMessage");
    if (message) {
      message.innerHTML = `
        <div class="warning">
          Student ID not found: <b>${esc(id)}</b><br><br>
          Please add this student first.
        </div>
      `;
    }
    return;
  }

  currentStudent = student;
  renderStudent(student);
  show("student");
}

/* =========================
   GUEST REGISTER
   ========================= */

function openGuestForm() {
  const card = document.getElementById("guestFormCard");
  if (!card) return;

  card.innerHTML = `
    <h2>Register Guest</h2>
    <p class="muted">Enter the visitor's information for school monitoring.</p>

    <div class="form-grid">
      <div class="form-group">
        <label for="guestName">Guest Name *</label>
        <input id="guestName" placeholder="Full name" autocomplete="off">
      </div>

      <div class="form-group">
        <label for="guestContact">Contact Number *</label>
        <input id="guestContact" placeholder="Phone number" autocomplete="off">
      </div>

      <div class="form-group" style="grid-column:1/-1">
        <label for="guestPurpose">Purpose *</label>
        <textarea id="guestPurpose" rows="3" placeholder="Reason for visiting Vision School"></textarea>
      </div>
    </div>

    <div class="form-actions">
      <button type="button" class="secondary-btn" onclick="clearGuestForm()">Clear</button>
      <button type="button" class="primary-btn" onclick="saveGuest()">✓ Save Guest</button>
    </div>
  `;

  show("guests");
  document.getElementById("guestName")?.focus();
}

function clearGuestForm() {
  ["guestName","guestContact","guestPurpose"].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = "";
  });
}

async function saveGuest() {
  if (!(await ensureDb())) return;

  const name = document.getElementById("guestName")?.value.trim();
  const contact = document.getElementById("guestContact")?.value.trim();
  const purpose = document.getElementById("guestPurpose")?.value.trim();

  if (!name || !contact || !purpose) {
    toast("Guest Name, Contact Number, and Purpose are required.");
    return;
  }

  if (!guestTableAvailable) {
    toast("Guest table is not available. Run guest_setup.sql in Supabase.");
    return;
  }

  const result = await db
    .from(GUESTS_TABLE)
    .insert({
      guest_name:name,
      contact_number:contact,
      purpose
    })
    .select()
    .single();

  if (result.error) {
    console.error("GUEST SAVE ERROR:", result.error);
    toast("Guest save failed: " + result.error.message);
    return;
  }

  const guestId = result.data?.id || null;

  if (guestLogsAvailable) {
    const logResult = await db.from(GUEST_LOGS_TABLE).insert({
      guest_id:guestId,
      guest_name:name,
      contact_number:contact,
      purpose,
      action:"ADDED"
    });

    if (logResult.error) {
      console.warn("Guest log failed:", logResult.error);
    }
  }

  clearGuestForm();
  await loadGuests();
  await loadGuestLogs();
  renderGuests();
  refreshDashboard();
  toast("Guest registered successfully.");
}

async function deleteGuest(id) {
  if (!(await ensureDb())) return;

  const guest = guestsCache.find(g => String(g.id) === String(id));
  if (!guest) return;

  if (!confirm(
    `Remove guest ${guest.guest_name} from the active guest list?\n\n` +
    `The monitoring record will be kept in Guest Audit Records.`
  )) return;

  if (guestLogsAvailable) {
    const logResult = await db.from(GUEST_LOGS_TABLE).insert({
      guest_id:guest.id,
      guest_name:guest.guest_name,
      contact_number:guest.contact_number,
      purpose:guest.purpose,
      action:"REMOVED"
    });

    if (logResult.error) {
      toast("Could not record guest removal: " + logResult.error.message);
      return;
    }
  }

  const result = await db.from(GUESTS_TABLE).delete().eq("id", id);

  if (result.error) {
    toast("Guest removal failed: " + result.error.message);
    return;
  }

  await loadGuests();
  await loadGuestLogs();
  renderGuests();
  refreshDashboard();
  toast("Guest removed from active list. Audit record kept.");
}

function renderGuests() {
  const list = document.getElementById("guestList");
  const count = document.getElementById("guestCountLabel");

  if (!list) return;

  if (count) {
    count.textContent =
      `${guestsCache.length} active guest${guestsCache.length === 1 ? "" : "s"}`;
  }

  if (!guestTableAvailable) {
    list.innerHTML = `
      <div class="warning">
        <b>Guest database is not ready.</b><br>
        Run guest_setup.sql in Supabase SQL Editor, then refresh this app.
      </div>
    `;
    return;
  }

  if (!guestsCache.length) {
    list.innerHTML = '<p class="muted">No active guests right now.</p>';
    return;
  }

  list.innerHTML = guestsCache.map(g => `
    <div class="guest-card">
      <div>
        <h3>${esc(g.guest_name)}</h3>
        <p><b>Contact:</b> ${esc(g.contact_number)}</p>
        <p><b>Purpose:</b> ${esc(g.purpose)}</p>
        <small class="muted">
          Registered ${g.created_at ? esc(new Date(g.created_at).toLocaleString()) : ""}
        </small>
      </div>
      <button class="danger" onclick="deleteGuest('${attr(g.id)}')">🗑 Remove</button>
    </div>
  `).join("");
}

/* =========================
   REPORTS + CSV
   ========================= */

function renderReports() {
  const container = document.getElementById("reportTable");
  if (!container) return;

  const attendanceHtml = `
    <h3>Attendance Records</h3>
    ${
      attendanceCache.length
      ? `<div class="table-wrap"><table>
        <thead>
          <tr>
            <th>Date</th><th>Student</th><th>ID</th><th>Time In</th>
            <th>Time Out</th><th>Pickup</th><th>Option</th><th>Approver</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${attendanceCache.map(r => `
            <tr>
              <td>${esc(r.date)}</td>
              <td>${esc(r.student_name || "")}</td>
              <td>${esc(r.student_id || "")}</td>
              <td>${esc(r.time_in || "-")}</td>
              <td>${esc(r.time_out || "-")}</td>
              <td>${esc(r.pickup_person || "-")}</td>
              <td>${esc(r.pickup_option || "-")}</td>
              <td>${esc(r.approver || "-")}</td>
              <td>${esc(r.notes || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>`
      : '<p class="muted">No attendance records yet.</p>'
    }
  `;

  const guestHtml = `
    <h3 style="margin-top:24px">Guest Audit Records</h3>
    ${
      guestLogsCache.length
      ? `<div class="table-wrap"><table>
        <thead>
          <tr><th>Date</th><th>Time</th><th>Guest Name</th><th>Contact</th><th>Purpose</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${guestLogsCache.map(g => {
            const d = g.created_at ? new Date(g.created_at) : null;
            return `
              <tr>
                <td>${d ? esc(d.toLocaleDateString()) : "-"}</td>
                <td>${d ? esc(d.toLocaleTimeString()) : "-"}</td>
                <td>${esc(g.guest_name || "")}</td>
                <td>${esc(g.contact_number || "")}</td>
                <td>${esc(g.purpose || "")}</td>
                <td>${esc(g.action || "")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table></div>`
      : '<p class="muted">No guest audit records yet.</p>'
    }
  `;

  container.innerHTML = attendanceHtml + guestHtml;
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"','""')}"`;
}

function exportCSV() {
  const headers = [
    "Record Type","Date","Time","Student ID","Student Name","Level",
    "Time In","Time Out","Pickup Person","Relationship","Phone",
    "Pickup Option","Staff","Approver","Notes",
    "Guest Name","Guest Contact","Guest Purpose","Guest Action"
  ];

  const lines = [headers.map(csv).join(",")];

  attendanceCache.forEach(r => {
    const student = studentsCache.find(s => String(s.id) === String(r.student_id));
    lines.push([
      "ATTENDANCE", r.date, "", r.student_id, r.student_name,
      student?.level || "", r.time_in, r.time_out,
      r.pickup_person, r.pickup_relationship, r.pickup_phone,
      r.pickup_option, r.staff, r.approver, r.notes,
      "","","",""
    ].map(csv).join(","));
  });

  guestLogsCache.forEach(g => {
    const d = g.created_at ? new Date(g.created_at) : null;
    lines.push([
      "GUEST AUDIT",
      d ? d.toLocaleDateString() : "",
      d ? d.toLocaleTimeString() : "",
      "","","","","","","","","","","","",
      g.guest_name, g.contact_number, g.purpose, g.action
    ].map(csv).join(","));
  });

  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + lines.join("\n")], {type:"text/csv;charset=utf-8"})
  );

  a.href = url;
  a.download = `vision_school_monitoring_${today()}.csv`;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================
   BUTTONS
   ========================= */

function setupButtonEvents() {
  document.querySelectorAll("[data-screen]").forEach(button => {
    button.addEventListener("click", () => {
      show(button.dataset.screen);

      if (document.getElementById("sidebar")?.classList.contains("open")) {
        document.getElementById("sidebar").classList.remove("open");
      }
    });
  });

  document.getElementById("startCamera")?.addEventListener("click", startScanner);
  document.getElementById("stopCamera")?.addEventListener("click", stopScanner);

  document.getElementById("manualOpen")?.addEventListener("click", () => {
    handleScan(document.getElementById("manualId")?.value || "");
  });

  document.getElementById("studentForm")?.addEventListener("submit", addStudent);
  document.getElementById("addPickup")?.addEventListener("click", addPickupPersonField);
  document.getElementById("clearForm")?.addEventListener("click", clearStudentForm);
  document.getElementById("studentSearch")?.addEventListener("input", renderStudents);

  document.getElementById("refreshStudents")?.addEventListener("click", async () => {
    try {
      await loadStudents();
      renderStudents();
      toast("Student list refreshed.");
    } catch (e) {
      toast("Could not refresh students.");
    }
  });

  document.getElementById("exportCsv")?.addEventListener("click", exportCSV);

  document.getElementById("closeQr")?.addEventListener("click", () => {
    document.getElementById("qrModal")?.remove();
  });

  document.getElementById("mobileMenu")?.addEventListener("click", () => {
    document.getElementById("sidebar")?.classList.toggle("open");
  });

  document.getElementById("guestAddButton")?.addEventListener("click", openGuestForm);
}

window.addEventListener("online", () => {
  updateOnlineStatus();
  refreshAll();
});

window.addEventListener("offline", updateOnlineStatus);

/* Expose only the functions needed by HTML onclick handlers. */
window.show = show;
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.handleScan = handleScan;
window.addStudent = addStudent;
window.timeIn = timeIn;
window.openPickup = openPickup;
window.confirmPickup = confirmPickup;
window.selectAuth = selectAuth;
window.optionChanged = optionChanged;
window.exportCSV = exportCSV;
window.addPickupPersonField = addPickupPersonField;
window.deleteStudent = deleteStudent;
window.renderStudents = renderStudents;
window.generateStudentQR = generateStudentQR;
window.downloadStudentQR = downloadStudentQR;
window.viewStudent = viewStudent;
window.openGuestForm = openGuestForm;
window.saveGuest = saveGuest;
window.deleteGuest = deleteGuest;
window.clearGuestForm = clearGuestForm;
window.renderGuests = renderGuests;

window.addEventListener("DOMContentLoaded", async () => {
  console.log("Vision School starting...");

  updateOnlineStatus();
  updateClock();
  setInterval(updateClock, 1000);

  setupButtonEvents();
  clearStudentForm();

  await refreshAll();
  setupRealtime();

  console.log("Vision School application started successfully.");
});
