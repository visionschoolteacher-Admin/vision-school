/* =========================================================
   VISION SCHOOL - STUDENT ATTENDANCE SYSTEM
   Complete replacement app.js
   Existing Supabase tables:
   students:
     id, name, level, parent, phone, authorized, created_at
   attendance:
     id, student_id, student_name, date, time_in, time_out,
     pickup_person, Pickup_relationship, pickup_phone,
     pickup_option, approver, notes, created_at

   IMPORTANT:
   - This version does NOT use attendance.level.
   - It supports up to 3 authorized pickup people using the
     existing students.parent and students.phone columns.
   - For 2-3 people, enter names separated by "|" in Parent/
     Guardian and matching phone numbers separated by "|".
     Example:
       parent = "Maria Santos|John Santos|Ana Santos"
       phone  = "02012345678|02098765432|02055555555"
   ========================================================= */

const SUPABASE_URL = "https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let students = [];
let attendanceRecords = [];
let currentStudent = null;
let html5QrCode = null;
let scannerRunning = false;
let realtimeChannel = null;
let toastTimer = null;

/* =========================================================
   START
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  initializeNavigation();
  initializeMobileMenu();
  initializeClock();
  initializeStudentModal();
  initializeScanner();
  initializeSearch();
  initializeReports();
  initializeModalClosing();

  await checkSupabaseConnection();
  await loadStudents();
  await loadTodayAttendance();
  initializeRealtime();
});

/* =========================================================
   CLOCK - VIENTIANE
   ========================================================= */

function initializeClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();

  const time = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Vientiane",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  const date = now.toLocaleDateString("en-US", {
    timeZone: "Asia/Vientiane",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const shortDate = now.toLocaleDateString("en-US", {
    timeZone: "Asia/Vientiane",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  document.getElementById("liveTime")?.replaceChildren(document.createTextNode(time));
  document.getElementById("liveDate")?.replaceChildren(document.createTextNode(date));
  document.getElementById("dashboardDate")?.replaceChildren(document.createTextNode(shortDate));
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function initializeNavigation() {
  document.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });
}

function showSection(sectionId) {
  document.querySelectorAll(".page-section").forEach(section => {
    section.classList.remove("active");
  });

  document.getElementById(sectionId)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.section === sectionId);
  });

  const titles = {
    dashboard: ["Dashboard", "Student attendance overview"],
    students: ["Students", "Manage Vision School students"],
    scanner: ["QR Scanner", "Scan student QR codes"],
    attendance: ["Attendance", "Today's attendance records"],
    reports: ["Reports", "Attendance reports and exports"]
  };

  const title = titles[sectionId] || titles.dashboard;
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");

  if (pageTitle) pageTitle.textContent = title[0];
  if (pageSubtitle) pageSubtitle.textContent = title[1];

  if (sectionId === "students") renderStudents();
  if (sectionId === "attendance") renderAttendance();
}

function initializeMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  const sidebar = document.getElementById("sidebar");

  menu?.addEventListener("click", () => sidebar?.classList.toggle("open"));

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => sidebar?.classList.remove("open"));
  });
}

/* =========================================================
   SUPABASE
   ========================================================= */

async function checkSupabaseConnection() {
  const dot = document.getElementById("connectionDot");
  const text = document.getElementById("connectionText");

  try {
    const { error } = await supabaseClient.from("students").select("id").limit(1);
    if (error) throw error;

    dot?.classList.add("connected");
    dot?.classList.remove("offline");
    if (text) text.textContent = "Connected";
  } catch (error) {
    console.error("Supabase connection error:", error);
    dot?.classList.remove("connected");
    dot?.classList.add("offline");
    if (text) text.textContent = "Connection Error";
    showToast("Supabase connection failed. Check the publishable key.", "error");
  }
}

/* =========================================================
   STUDENTS
   ========================================================= */

async function loadStudents() {
  try {
    const { data, error } = await supabaseClient
      .from("students")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    students = data || [];
    const total = document.getElementById("totalStudents");
    if (total) total.textContent = students.length;

    populateLevelFilter();
    renderStudents();
  } catch (error) {
    console.error("Unable to load students:", error);
    showToast("Unable to load students.", "error");
  }
}

function populateLevelFilter() {
  const filter = document.getElementById("levelFilter");
  if (!filter) return;

  const currentValue = filter.value;
  const levels = [...new Set(students.map(s => s.level).filter(Boolean))].sort();

  filter.innerHTML = `<option value="">All Levels</option>`;
  levels.forEach(level => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level;
    filter.appendChild(option);
  });
  filter.value = currentValue;
}

function renderStudents() {
  const body = document.getElementById("studentsBody");
  if (!body) return;

  const search = document.getElementById("studentSearch")?.value?.toLowerCase()?.trim() || "";
  const level = document.getElementById("levelFilter")?.value || "";

  const filtered = students.filter(student => {
    const searchable = [
      student.id, student.name, student.level, student.parent, student.phone
    ].filter(Boolean).join(" ").toLowerCase();

    return (!search || searchable.includes(search)) &&
           (!level || student.level === level);
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-state">No students found.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(student => {
    const authorized = student.authorized !== false;
    const people = getAuthorizedPeople(student);

    return `
      <tr>
        <td><strong>${escapeHtml(student.id)}</strong></td>
        <td>${escapeHtml(student.name)}</td>
        <td>${escapeHtml(student.level || "-")}</td>
        <td>${escapeHtml(student.parent || "-")}</td>
        <td>${escapeHtml(student.phone || "-")}</td>
        <td>
          <span class="status ${authorized ? "authorized" : "not-authorized"}">
            ${authorized ? "Authorized" : "Unauthorized"}
          </span>
        </td>
        <td>${people.length}</td>
        <td>
          <button class="small-button view-student" data-id="${escapeAttribute(student.id)}">View</button>
          <button class="small-button edit-student" data-id="${escapeAttribute(student.id)}">Edit</button>
          <button class="small-button remove-student" data-id="${escapeAttribute(student.id)}">Remove</button>
        </td>
        <td>
          <button class="small-button generate-qr" data-id="${escapeAttribute(student.id)}">QR</button>
        </td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll(".view-student").forEach(button => {
    button.addEventListener("click", () => {
      const student = findStudent(button.dataset.id);
      if (student) showStudentProfile(student);
    });
  });

  body.querySelectorAll(".edit-student").forEach(button => {
    button.addEventListener("click", () => {
      const student = findStudent(button.dataset.id);
      if (student) editStudent(student);
    });
  });

  body.querySelectorAll(".remove-student").forEach(button => {
    button.addEventListener("click", () => {
      const student = findStudent(button.dataset.id);
      if (student) removeStudent(student);
    });
  });

  body.querySelectorAll(".generate-qr").forEach(button => {
    button.addEventListener("click", () => {
      const student = findStudent(button.dataset.id);
      if (student) showStudentQr(student);
    });
  });
}

function findStudent(id) {
  return students.find(student =>
    String(student.id).trim().toLowerCase() === String(id).trim().toLowerCase()
  );
}

/* =========================================================
   AUTHORIZED PEOPLE
   Existing schema compatible:
   parent and phone can contain multiple entries separated by |
   ========================================================= */

function getAuthorizedPeople(student) {
  const names = String(student?.parent || "")
    .split("|")
    .map(v => v.trim())
    .filter(Boolean);

  const phones = String(student?.phone || "")
    .split("|")
    .map(v => v.trim());

  return names.slice(0, 3).map((name, index) => ({
    name,
    phone: phones[index] || ""
  }));
}

function getAuthorizationStatus(student) {
  return student?.authorized === false ? "Unauthorized" : "Authorized";
}

/* =========================================================
   ADD / EDIT STUDENT
   ========================================================= */

function initializeStudentModal() {
  document.getElementById("addStudentButton")?.addEventListener("click", () => {
    resetStudentForm();
    document.getElementById("studentModal")?.classList.add("show");
  });

  document.getElementById("studentForm")?.addEventListener("submit", saveStudent);
}

function resetStudentForm() {
  document.getElementById("studentForm")?.reset();

  const authorized = document.getElementById("studentAuthorized");
  if (authorized) authorized.checked = true;

  const id = document.getElementById("studentId");
  if (id) id.disabled = false;

  const title = document.querySelector("#studentModal .modal-header h2");
  if (title) title.textContent = "Add Student";

  const submit = document.querySelector("#studentForm button[type='submit']");
  if (submit) submit.textContent = "Save Student";

  currentStudent = null;
}

function editStudent(student) {
  currentStudent = student;

  document.getElementById("studentId").value = student.id || "";
  document.getElementById("studentName").value = student.name || "";
  document.getElementById("studentLevel").value = student.level || "";
  document.getElementById("studentParent").value = student.parent || "";
  document.getElementById("studentPhone").value = student.phone || "";
  document.getElementById("studentAuthorized").checked = student.authorized !== false;

  const title = document.querySelector("#studentModal .modal-header h2");
  if (title) title.textContent = "Edit Student";

  const submit = document.querySelector("#studentForm button[type='submit']");
  if (submit) submit.textContent = "Update Student";

  document.getElementById("studentId").disabled = true;
  document.getElementById("studentModal")?.classList.add("show");
}

async function saveStudent(event) {
  event.preventDefault();

  const id = document.getElementById("studentId").value.trim();
  const name = document.getElementById("studentName").value.trim();
  const level = document.getElementById("studentLevel").value.trim();
  const parent = document.getElementById("studentParent").value.trim();
  const phone = document.getElementById("studentPhone").value.trim();
  const authorized = document.getElementById("studentAuthorized").checked;

  if (!id || !name || !level) {
    showToast("Please complete the required fields.", "error");
    return;
  }

  // Allow up to 3 people in the existing columns.
  const people = parent.split("|").map(v => v.trim()).filter(Boolean);
  const phones = phone.split("|").map(v => v.trim()).filter(Boolean);

  if (people.length > 3) {
    showToast("Please enter a maximum of 3 authorized pickup people.", "error");
    return;
  }

  if (phones.length > 3) {
    showToast("Please enter a maximum of 3 phone numbers.", "error");
    return;
  }

  try {
    let result;

    if (currentStudent) {
      result = await supabaseClient.from("students").update({
        name, level, parent, phone, authorized
      }).eq("id", currentStudent.id);
    } else {
      result = await supabaseClient.from("students").insert({
        id, name, level, parent, phone, authorized
      });
    }

    if (result.error) throw result.error;

    showToast(currentStudent ? "Student updated successfully." : "Student added successfully.", "success");
    closeStudentModal();
    await loadStudents();
  } catch (error) {
    console.error("Student save error:", error);
    showToast(`Unable to save student: ${error.message || "Check the Student ID."}`, "error");
  }
}

async function removeStudent(student) {
  const ok = window.confirm(
    `Remove ${student.name} (${student.id}) from the student list?\n\nThis cannot be undone from this screen.`
  );

  if (!ok) return;

  try {
    const { error } = await supabaseClient
      .from("students")
      .delete()
      .eq("id", student.id);

    if (error) throw error;

    showToast(`${student.name} was removed.`, "success");
    await loadStudents();
  } catch (error) {
    console.error("Remove student error:", error);
    showToast("Unable to remove student. Check your Supabase delete policy.", "error");
  }
}

function closeStudentModal() {
  document.getElementById("studentModal")?.classList.remove("show");
  resetStudentForm();
}

/* =========================================================
   STUDENT PROFILE
   ========================================================= */

function showStudentProfile(student) {
  const modal = document.getElementById("studentResultModal");
  const result = document.getElementById("studentResult");
  if (!modal || !result) return;

  const people = getAuthorizedPeople(student);
  const authorized = student.authorized !== false;

  result.innerHTML = `
    <div class="student-result">
      <div class="result-avatar">👨‍🎓</div>
      <h2>${escapeHtml(student.name)}</h2>
      <p>${escapeHtml(student.level || "")}</p>
      <hr>

      <p><strong>Student ID:</strong> ${escapeHtml(student.id)}</p>

      <div class="security-box ${authorized ? "security-authorized" : "security-unauthorized"}">
        <strong>Pickup Security Status</strong>
        <div style="font-size:18px;margin-top:6px;">
          ${authorized ? "✅ AUTHORIZED" : "🚫 UNAUTHORIZED"}
        </div>
        <small>
          ${authorized
            ? "Only the authorized people listed below should be accepted for pickup."
            : "Do NOT release this student to a pickup person until school staff verifies and approves the person."}
        </small>
      </div>

      <div style="text-align:left;margin-top:18px;">
        <strong>Authorized Pickup People</strong>
        ${people.length ? people.map((person, index) => `
          <div style="padding:10px 0;border-bottom:1px solid #eee;">
            <strong>${index + 1}. ${escapeHtml(person.name)}</strong><br>
            <small>Phone: ${escapeHtml(person.phone || "-")}</small>
          </div>
        `).join("") : `
          <p style="color:#dc2626;">No authorized pickup person has been entered.</p>
        `}
      </div>

      <div style="text-align:left;margin-top:18px;">
        <strong>Parent / Guardian Information</strong>
        <p>Names and phone numbers are stored in the student's profile. Multiple entries are separated internally by <strong>|</strong>.</p>
      </div>

      <div class="result-actions">
        <button class="time-in-button" id="profileEditButton">✏️ Edit</button>
        <button class="time-out-button" id="profileQrButton">▣ QR Code</button>
      </div>
    </div>
  `;

  modal.classList.add("show");

  document.getElementById("profileEditButton")?.addEventListener("click", () => {
    modal.classList.remove("show");
    editStudent(student);
  });

  document.getElementById("profileQrButton")?.addEventListener("click", () => {
    modal.classList.remove("show");
    showStudentQr(student);
  });
}

/* =========================================================
   QR GENERATOR
   ========================================================= */

function showStudentQr(student) {
  const modal = document.getElementById("studentResultModal");
  const result = document.getElementById("studentResult");
  if (!modal || !result) return;

  result.innerHTML = `
    <div class="student-result">
      <div class="result-avatar">👨‍🎓</div>
      <h2>${escapeHtml(student.name)}</h2>
      <p>${escapeHtml(student.level || "")}</p>
      <div id="generatedQr" style="display:flex;justify-content:center;margin:20px 0;"></div>
      <p>Student ID: <strong>${escapeHtml(student.id)}</strong></p>
      <button class="primary-button" id="downloadQr">Download QR</button>
    </div>
  `;

  modal.classList.add("show");

  loadQrGenerator(() => {
    new QRCode(document.getElementById("generatedQr"), {
      text: String(student.id),
      width: 220,
      height: 220
    });

    document.getElementById("downloadQr")?.addEventListener("click", () => downloadQr(student));
  });
}

function loadQrGenerator(callback) {
  if (window.QRCode) {
    callback();
    return;
  }

  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  script.onload = callback;
  script.onerror = () => showToast("QR generator could not load.", "error");
  document.head.appendChild(script);
}

function downloadQr(student) {
  const canvas = document.querySelector("#generatedQr canvas");
  const image = document.querySelector("#generatedQr img");
  const url = canvas ? canvas.toDataURL("image/png") : image?.src;

  if (!url) {
    showToast("QR image is not ready.", "error");
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = `${student.id}-QR.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* =========================================================
   QR SCANNER
   ========================================================= */

function initializeScanner() {
  document.getElementById("startScanner")?.addEventListener("click", startScanner);
  document.getElementById("stopScanner")?.addEventListener("click", stopScanner);
  document.getElementById("manualSearchButton")?.addEventListener("click", manualStudentSearch);
}

async function startScanner() {
  if (typeof Html5Qrcode === "undefined") {
    showToast("QR scanner is still loading. Try again.", "error");
    return;
  }

  if (scannerRunning) return;

  try {
    html5QrCode = new Html5Qrcode("reader");

    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      decodedText => handleQrScan(decodedText),
      () => {}
    );

    scannerRunning = true;
    showToast("Camera started.", "success");
  } catch (error) {
    console.error("Scanner error:", error);
    showToast("Unable to start camera. Check camera permission.", "error");
  }
}

async function stopScanner() {
  if (!html5QrCode || !scannerRunning) return;

  try {
    await html5QrCode.stop();
    html5QrCode.clear();
    scannerRunning = false;
  } catch (error) {
    console.error("Scanner stop error:", error);
  }
}

async function handleQrScan(decodedText) {
  await stopScanner();

  const id = String(decodedText).trim();
  const student = findStudent(id);

  if (!student) {
    showToast(`Student ID "${id}" was not found.`, "error");
    return;
  }

  await loadTodayAttendance();
  showAttendanceAction(student);
}

function manualStudentSearch() {
  const input = document.getElementById("manualStudentId");
  const id = input?.value.trim();

  if (!id) {
    showToast("Enter a Student ID.", "error");
    return;
  }

  const student = findStudent(id);

  if (!student) {
    showToast("Student not found.", "error");
    return;
  }

  showAttendanceAction(student);
}

/* =========================================================
   DATE / TIME
   ========================================================= */

function getVientianeDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vientiane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Vientiane",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

/* =========================================================
   ATTENDANCE ACTION
   ========================================================= */

function showAttendanceAction(student) {
  const modal = document.getElementById("studentResultModal");
  const result = document.getElementById("studentResult");
  if (!modal || !result) return;

  const record = attendanceRecords.find(
    item => String(item.student_id) === String(student.id)
  );

  const people = getAuthorizedPeople(student);
  const authorized = student.authorized !== false;

  result.innerHTML = `
    <div class="student-result">
      <div class="result-avatar">👨‍🎓</div>
      <h2>${escapeHtml(student.name)}</h2>
      <p>${escapeHtml(student.level || "")}</p>
      <p>Student ID: <strong>${escapeHtml(student.id)}</strong></p>

      <div class="security-box ${authorized ? "security-authorized" : "security-unauthorized"}">
        <strong>Pickup Security</strong>
        <div style="font-size:18px;margin-top:5px;">
          ${authorized ? "✅ AUTHORIZED STUDENT" : "🚫 UNAUTHORIZED STUDENT"}
        </div>
        <small>
          ${authorized
            ? "Verify that the pickup person matches one of the authorized people below."
            : "Do not release without staff verification and approval."}
        </small>
      </div>

      <div style="text-align:left;margin:16px 0;">
        <strong>Authorized Pickup People</strong>
        ${people.length ? people.map((p, i) => `
          <div style="padding:7px 0;border-bottom:1px solid #eee;">
            ${i + 1}. ${escapeHtml(p.name)}
            ${p.phone ? `<small> — ${escapeHtml(p.phone)}</small>` : ""}
          </div>
        `).join("") : `<div style="color:#dc2626;margin-top:8px;">None listed.</div>`}
      </div>

      <p>Time In: <strong>${formatTime(record?.time_in)}</strong></p>
      <p>Time Out: <strong>${formatTime(record?.time_out)}</strong></p>

      <div class="result-actions">
        <button class="time-in-button" id="recordTimeIn" ${record?.time_in ? "disabled" : ""}>
          ✓ Time In
        </button>
        <button class="time-out-button" id="recordTimeOut"
          ${!record?.time_in || record?.time_out ? "disabled" : ""}>
          ↗ Time Out
        </button>
      </div>

      ${record?.time_in && !record?.time_out ? `
        <div style="margin-top:20px;">
          <button class="primary-button" id="openPickup">
            👤 Pickup / Guest / Approval
          </button>
        </div>
      ` : ""}
    </div>
  `;

  modal.classList.add("show");

  document.getElementById("recordTimeIn")?.addEventListener("click", () => recordTimeIn(student));
  document.getElementById("recordTimeOut")?.addEventListener("click", () => recordTimeOut(student));
  document.getElementById("openPickup")?.addEventListener("click", () => openPickupForm(student));
}

/* =========================================================
   TIME IN
   ========================================================= */

async function recordTimeIn(student) {
  try {
    await loadTodayAttendance();

    const existing = attendanceRecords.find(
      record => String(record.student_id) === String(student.id)
    );

    if (existing?.time_in) {
      showToast("This student already has a Time In.", "error");
      return;
    }

    const now = new Date().toISOString();
    let result;

    if (existing) {
      result = await supabaseClient
        .from("attendance")
        .update({ time_in: now })
        .eq("id", existing.id);
    } else {
      result = await supabaseClient
        .from("attendance")
        .insert({
          student_id: student.id,
          student_name: student.name,
          date: getVientianeDate(),
          time_in: now
        });
    }

    if (result.error) throw result.error;

    showToast(`${student.name} — Time In recorded.`, "success");
    closeResultModal();
    await loadTodayAttendance();
  } catch (error) {
    console.error("Time In error:", error);
    showToast(`Unable to record Time In: ${error.message || ""}`, "error");
  }
}

/* =========================================================
   TIME OUT
   ========================================================= */

async function recordTimeOut(student) {
  try {
    await loadTodayAttendance();

    const existing = attendanceRecords.find(
      record => String(record.student_id) === String(student.id)
    );

    if (!existing) {
      showToast("This student has no attendance record today.", "error");
      return;
    }

    if (!existing.time_in) {
      showToast("Time In must be recorded first.", "error");
      return;
    }

    if (existing.time_out) {
      showToast("This student already has a Time Out.", "error");
      return;
    }

    // Security step: open pickup/approval form before final Time Out.
    openPickupForm(student, true);
  } catch (error) {
    console.error("Time Out preparation error:", error);
    showToast("Unable to prepare Time Out.", "error");
  }
}

/* =========================================================
   PICKUP / GUEST / APPROVAL
   This is the security information needed at pickup.
   ========================================================= */

function openPickupForm(student, finalizingTimeOut = false) {
  const record = attendanceRecords.find(
    item => String(item.student_id) === String(student.id)
  );

  if (!record) {
    showToast("Attendance record not found.", "error");
    return;
  }

  const result = document.getElementById("studentResult");
  if (!result) return;

  const people = getAuthorizedPeople(student);
  const authorized = student.authorized !== false;

  result.innerHTML = `
    <div class="student-result">
      <div class="result-avatar">👤</div>

      <h2>${finalizingTimeOut ? "Student Pickup / Time Out" : "Guest / Pickup"}</h2>
      <p><strong>${escapeHtml(student.name)}</strong></p>

      <div class="security-box ${authorized ? "security-authorized" : "security-unauthorized"}">
        <strong>${authorized ? "AUTHORIZED STUDENT" : "UNAUTHORIZED STUDENT"}</strong>
        <p style="margin:6px 0 0;">
          ${authorized
            ? "Choose the pickup person from the authorized list if they are listed."
            : "Security warning: this student is marked unauthorized. Verify with school administration before release."}
        </p>
      </div>

      <div style="text-align:left;margin-top:16px;">
        <label><strong>Authorized person picking up</strong></label>
        <select id="authorizedPickupSelect"
          style="width:100%;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">
          <option value="">-- Select pickup person --</option>
          ${people.map((p, i) => `
            <option value="${escapeAttribute(p.name)}" data-phone="${escapeAttribute(p.phone)}">
              ${i + 1}. ${escapeHtml(p.name)}${p.phone ? " — " + escapeHtml(p.phone) : ""}
            </option>
          `).join("")}
          <option value="__guest__">Guest / Not on authorized list</option>
        </select>

        <div id="guestWarning" style="
          display:${authorized ? "none" : "block"};
          background:#fff7ed;
          border:1px solid #fed7aa;
          padding:12px;
          border-radius:8px;
          margin-bottom:14px;
          color:#9a3412;
          font-weight:600;">
          ⚠ Unauthorized/guest pickup requires manual verification and approval.
        </div>

        <label>Pickup Person / Guest Name</label>
        <input id="pickupPersonInput" type="text"
          placeholder="Full name"
          value="${escapeAttribute(record.pickup_person || "")}"
          style="width:100%;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">

        <label>Relationship</label>
        <input id="pickupRelationshipInput" type="text"
          placeholder="Parent, Guardian, Relative, Guest..."
          value="${escapeAttribute(record.Pickup_relationship || "")}"
          style="width:100%;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">

        <label>Phone</label>
        <input id="pickupPhoneInput" type="text"
          placeholder="Phone number"
          value="${escapeAttribute(record.pickup_phone || "")}"
          style="width:100%;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">

        <label>Pickup Option</label>
        <select id="pickupOptionInput"
          style="width:100%;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">
          <option value="">Select option</option>
          <option value="Parent" ${record.pickup_option === "Parent" ? "selected" : ""}>Parent</option>
          <option value="Guardian" ${record.pickup_option === "Guardian" ? "selected" : ""}>Guardian</option>
          <option value="Authorized Person" ${record.pickup_option === "Authorized Person" ? "selected" : ""}>Authorized Person</option>
          <option value="Guest" ${record.pickup_option === "Guest" ? "selected" : ""}>Guest</option>
          <option value="School Staff" ${record.pickup_option === "School Staff" ? "selected" : ""}>School Staff</option>
        </select>

        <label>Approver</label>
        <input id="approverInput" type="text"
          placeholder="Staff / teacher who approved"
          value="${escapeAttribute(record.approver || "")}"
          style="width:100%;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">

        <label>Security / Pickup Notes</label>
        <textarea id="notesInput"
          placeholder="ID checked, phone confirmation, special instructions, reason for guest pickup..."
          style="width:100%;min-height:90px;padding:11px;margin:6px 0 14px;border:1px solid #e5e7eb;border-radius:8px;">${escapeHtml(record.notes || "")}</textarea>
      </div>

      <div class="result-actions">
        <button class="secondary-button" id="cancelPickup">Cancel</button>
        <button class="primary-button" id="savePickup">
          ${finalizingTimeOut ? "Save & Time Out" : "Save Pickup"}
        </button>
      </div>
    </div>
  `;

  const select = document.getElementById("authorizedPickupSelect");
  const personInput = document.getElementById("pickupPersonInput");
  const phoneInput = document.getElementById("pickupPhoneInput");
  const warning = document.getElementById("guestWarning");

  select?.addEventListener("change", () => {
    const value = select.value;

    if (value === "__guest__") {
      if (warning) warning.style.display = "block";
      if (personInput) personInput.value = "";
      if (phoneInput) phoneInput.value = "";
      return;
    }

    if (warning) warning.style.display = authorized ? "none" : "block";

    const option = select.options[select.selectedIndex];
    if (personInput) personInput.value = value || "";
    if (phoneInput) phoneInput.value = option?.dataset?.phone || "";
  });

  document.getElementById("cancelPickup")?.addEventListener(
    "click",
    () => showAttendanceAction(student)
  );

  document.getElementById("savePickup")?.addEventListener(
    "click",
    () => savePickup(student, record, finalizingTimeOut)
  );
}

async function savePickup(student, record, finalizingTimeOut = false) {
  try {
    const selected = document.getElementById("authorizedPickupSelect")?.value || "";
    const pickup_person = document.getElementById("pickupPersonInput")?.value.trim() || "";
    const Pickup_relationship = document.getElementById("pickupRelationshipInput")?.value.trim() || "";
    const pickup_phone = document.getElementById("pickupPhoneInput")?.value.trim() || "";
    const pickup_option = document.getElementById("pickupOptionInput")?.value || "";
    const approver = document.getElementById("approverInput")?.value.trim() || "";
    const notes = document.getElementById("notesInput")?.value.trim() || "";

    if (!selected) {
      showToast("Please select who is picking up the student.", "error");
      return;
    }

    if (!pickup_person) {
      showToast("Please enter/confirm the pickup person's name.", "error");
      return;
    }

    if (!pickup_option) {
      showToast("Please select the pickup option.", "error");
      return;
    }

    const isGuest = selected === "__guest__";
    const isAuthorizedListed = !isGuest &&
      getAuthorizedPeople(student).some(p =>
        p.name.toLowerCase() === pickup_person.toLowerCase()
      );

    if ((!isAuthorizedListed || student.authorized === false) && !approver) {
      showToast("For an unauthorized/guest pickup, an approver is required.", "error");
      return;
    }

    const update = {
      pickup_person,
      Pickup_relationship,
      pickup_phone,
      pickup_option,
      approver,
      notes
    };

    if (finalizingTimeOut) {
      update.time_out = new Date().toISOString();
    }

    const { error } = await supabaseClient
      .from("attendance")
      .update(update)
      .eq("id", record.id);

    if (error) throw error;

    showToast(
      finalizingTimeOut
        ? `${student.name} — Pickup verified and Time Out recorded.`
        : "Pickup information saved.",
      "success"
    );

    closeResultModal();
    await loadTodayAttendance();
  } catch (error) {
    console.error("Pickup save error:", error);
    showToast(`Unable to save pickup information: ${error.message || ""}`, "error");
  }
}

/* =========================================================
   ATTENDANCE
   ========================================================= */

async function loadTodayAttendance() {
  try {
    const { data, error } = await supabaseClient
      .from("attendance")
      .select("*")
      .eq("date", getVientianeDate())
      .order("created_at", { ascending: false });

    if (error) throw error;

    attendanceRecords = data || [];
    updateAttendanceStats();
    renderAttendance();
    renderDashboardAttendance();
  } catch (error) {
    console.error("Attendance loading error:", error);
    showToast("Unable to load attendance records.", "error");
  }
}

function updateAttendanceStats() {
  const timeIn = attendanceRecords.filter(r => r.time_in).length;
  const timeOut = attendanceRecords.filter(r => r.time_out).length;
  const currentlyIn = attendanceRecords.filter(r => r.time_in && !r.time_out).length;

  const a = document.getElementById("timeInCount");
  const b = document.getElementById("timeOutCount");
  const c = document.getElementById("currentlyInCount");

  if (a) a.textContent = timeIn;
  if (b) b.textContent = timeOut;
  if (c) c.textContent = currentlyIn;
}

function renderAttendance() {
  const body = document.getElementById("attendanceBody");
  if (!body) return;

  const search = document.getElementById("attendanceSearch")?.value?.toLowerCase()?.trim() || "";

  const filtered = attendanceRecords.filter(record => {
    const text = [
      record.student_id, record.student_name, record.pickup_person,
      record.Pickup_relationship, record.pickup_phone,
      record.pickup_option, record.approver, record.notes
    ].filter(Boolean).join(" ").toLowerCase();

    return !search || text.includes(search);
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">No attendance records today.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(record => {
    const student = findStudent(record.student_id);
    const pickup = record.pickup_person || "-";
    const approval = record.approver || "-";

    return `
      <tr>
        <td><strong>${escapeHtml(record.student_name || record.student_id || "")}</strong></td>
        <td>${escapeHtml(student?.level || "-")}</td>
        <td>${formatTime(record.time_in)}</td>
        <td>${formatTime(record.time_out)}</td>
        <td>${escapeHtml(pickup)}</td>
        <td>${escapeHtml(record.Pickup_relationship || "-")}</td>
        <td>${escapeHtml(approval)}</td>
        <td>
          <span class="status ${record.time_out ? "out" : "in"}">
            ${record.time_out ? "Completed" : "In School"}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderDashboardAttendance() {
  const body = document.getElementById("dashboardAttendanceBody");
  if (!body) return;

  const records = attendanceRecords.slice(0, 10);

  if (!records.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">No attendance records yet.</td></tr>`;
    return;
  }

  body.innerHTML = records.map(record => {
    const student = findStudent(record.student_id);

    return `
      <tr>
        <td>${escapeHtml(record.student_name || record.student_id)}</td>
        <td>${escapeHtml(student?.level || "-")}</td>
        <td>${formatTime(record.time_in)}</td>
        <td>${formatTime(record.time_out)}</td>
        <td>${escapeHtml(record.pickup_person || "-")}</td>
        <td>
          <span class="status ${record.time_out ? "out" : "in"}">
            ${record.time_out ? "Completed" : "In School"}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

/* =========================================================
   SEARCH
   ========================================================= */

function initializeSearch() {
  document.getElementById("studentSearch")?.addEventListener("input", renderStudents);
  document.getElementById("levelFilter")?.addEventListener("change", renderStudents);
  document.getElementById("attendanceSearch")?.addEventListener("input", renderAttendance);
  document.getElementById("refreshAttendance")?.addEventListener("click", loadTodayAttendance);
}

/* =========================================================
   REPORT / CSV FOR EXCEL
   ========================================================= */

function initializeReports() {
  document.getElementById("exportCsv")?.addEventListener("click", exportAttendanceCsv);
}

function exportAttendanceCsv() {
  if (!attendanceRecords.length) {
    showToast("There are no attendance records to export.", "error");
    return;
  }

  const headers = [
    "Date", "Student ID", "Student Name", "Level",
    "Time In", "Time Out", "Pickup Person", "Relationship",
    "Pickup Phone", "Pickup Option", "Approver", "Security Notes"
  ];

  const rows = attendanceRecords.map(record => {
    const student = findStudent(record.student_id);

    return [
      record.date || "",
      record.student_id || "",
      record.student_name || "",
      student?.level || "",
      record.time_in ? formatTime(record.time_in) : "",
      record.time_out ? formatTime(record.time_out) : "",
      record.pickup_person || "",
      record.Pickup_relationship || "",
      record.pickup_phone || "",
      record.pickup_option || "",
      record.approver || "",
      record.notes || ""
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `Vision-School-Attendance-${getVientianeDate()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("Attendance Excel-compatible file downloaded.", "success");
}

/* =========================================================
   REALTIME
   ========================================================= */

function initializeRealtime() {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

  realtimeChannel = supabaseClient
    .channel("vision-school-attendance")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "attendance"
    }, () => loadTodayAttendance())
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "students"
    }, () => loadStudents())
    .subscribe(status => console.log("Realtime:", status));
}

/* =========================================================
   MODALS
   ========================================================= */

function initializeModalClosing() {
  document.getElementById("closeResultModal")?.addEventListener("click", closeResultModal);
  document.getElementById("closeStudentModal")?.addEventListener("click", closeStudentModal);
  document.getElementById("cancelStudent")?.addEventListener("click", closeStudentModal);

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) modal.classList.remove("show");
    });
  });
}

function closeResultModal() {
  document.getElementById("studentResultModal")?.classList.remove("show");
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("show");

  // Some existing CSS versions use type classes.
  toast.classList.remove("success", "error", "info", "warning");
  toast.classList.add(type);

  clearTimeout(toastTimer);
  void toast.offsetWidth;
  toast.classList.add("show");

  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

/* =========================================================
   ESCAPING
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
