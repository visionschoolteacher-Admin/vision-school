/* ============================================================
   VISION SCHOOL
   UPDATED APP.JS
   Matches the current Vision School index.html + style.css
   Backend: Supabase
   Tables: public.students, public.attendance
   ============================================================ */

const SUPABASE_URL = "https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentStudent = null;
let selectedPickup = null;
let qrScanner = null;
let scannerRunning = false;
let studentsCache = [];
let attendanceCache = [];
let refreshTimer = null;
let clockTimer = null;

/* ------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------ */

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function safeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = message;
  el.style.display = "block";

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.style.display = "none";
  }, 3200);
}

function setMessage(id, message, type = "success") {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = message
    ? `<div class="${type}">${escapeHtml(message)}</div>`
    : "";
}

function showSupabaseError(error, fallback) {
  console.error("Supabase error:", error);

  toast(
    error?.message
      ? `${fallback} ${error.message}`
      : fallback
  );
}

function getAuthorized(student) {
  return Array.isArray(student?.authorized)
    ? student.authorized
    : [];
}

/* ------------------------------------------------------------
   CLOCK + CONNECTION
   ------------------------------------------------------------ */

function updateClock() {
  const clock = document.getElementById("clock");
  const dateText = document.getElementById("dateText");
  const d = new Date();

  if (clock) {
    clock.textContent = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  if (dateText) {
    dateText.textContent = d.toLocaleDateString([], {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
}

function updateConnectionStatus() {
  const dot = document.getElementById("statusDot");
  const badge = document.getElementById("onlineBadge");
  const text = document.getElementById("connectionText");

  if (!dot || !badge || !text) return;

  if (navigator.onLine) {
    dot.className = "status-dot online";
    badge.textContent = "ONLINE";
    text.textContent = "Connected";
  } else {
    dot.className = "status-dot offline";
    badge.textContent = "OFFLINE";
    text.textContent = "No internet connection";
  }
}

/* ------------------------------------------------------------
   NAVIGATION
   ------------------------------------------------------------ */

const screenTitles = {
  home: "Dashboard",
  scanner: "Scan Student QR Code",
  students: "Students",
  addStudent: "Add New Student",
  student: "Student Details",
  pickup: "Pickup / Time Out",
  reports: "Attendance Reports",
  about: "About System"
};

async function show(screenId) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const screen = document.getElementById(screenId);

  if (!screen) return;

  screen.classList.add("active");

  const title = document.getElementById("pageTitle");

  if (title) {
    title.textContent =
      screenTitles[screenId] || "Vision School";
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.screen === screenId
    );
  });

  document.getElementById("sidebar")?.classList.remove("open");

  if (screenId !== "scanner") {
    await stopScanner();
  }

  if (screenId === "home") {
    await refreshDashboard();
  }

  if (screenId === "students") {
    await renderStudents();
  }

  if (screenId === "reports") {
    await renderReport();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ------------------------------------------------------------
   SUPABASE LOADERS
   ------------------------------------------------------------ */

async function loadStudents() {
  const { data, error } = await supabaseClient
    .from("students")
    .select("*")
    .order("name", {
      ascending: true
    });

  if (error) {
    showSupabaseError(
      error,
      "Unable to load students."
    );

    return [];
  }

  studentsCache = data || [];

  return studentsCache;
}

async function loadTodayAttendance() {
  const { data, error } = await supabaseClient
    .from("attendance")
    .select("*")
    .eq("date", today());

  if (error) {
    showSupabaseError(
      error,
      "Unable to load attendance."
    );

    return [];
  }

  attendanceCache = data || [];

  return attendanceCache;
}

async function loadAllAttendance() {
  const { data, error } = await supabaseClient
    .from("attendance")
    .select("*")
    .order("date", {
      ascending: false
    })
    .order("time_in", {
      ascending: false
    });

  if (error) {
    showSupabaseError(
      error,
      "Unable to load reports."
    );

    return [];
  }

  return data || [];
}

async function getTodayRecord(studentId) {
  const { data, error } = await supabaseClient
    .from("attendance")
    .select("*")
    .eq("student_id", studentId)
    .eq("date", today())
    .order("created_at", {
      ascending: false
    })
    .limit(1);

  if (error) {
    console.error(
      "Attendance lookup error:",
      error
    );

    return null;
  }

  return data?.[0] || null;
}

async function getStudentById(studentId) {
  const id = String(studentId || "")
    .trim()
    .toUpperCase();

  if (!id) return null;

  const cached = studentsCache.find(
    student =>
      String(student.id).toUpperCase() === id
  );

  if (cached) return cached;

  const { data, error } = await supabaseClient
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    showSupabaseError(
      error,
      "Unable to find student."
    );

    return null;
  }

  return data || null;
}

/* ------------------------------------------------------------
   DASHBOARD
   ------------------------------------------------------------ */

async function refreshDashboard() {
  try {
    await Promise.all([
      loadStudents(),
      loadTodayAttendance()
    ]);

    const timeIn =
      attendanceCache.filter(
        record => record.time_in
      );

    const inSchool =
      attendanceCache.filter(
        record =>
          record.time_in &&
          !record.time_out
      );

    const picked =
      attendanceCache.filter(
        record => record.time_out
      );

    document.getElementById(
      "totalStudents"
    ).textContent = studentsCache.length;

    document.getElementById(
      "timeInCount"
    ).textContent = timeIn.length;

    document.getElementById(
      "inSchoolCount"
    ).textContent = inSchool.length;

    document.getElementById(
      "pickedCount"
    ).textContent = picked.length;

    document.getElementById(
      "notInCount"
    ).textContent =
      Math.max(
        0,
        studentsCache.length - timeIn.length
      );

    renderRecentActivity(
      attendanceCache
    );
  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );
  }
}

function renderRecentActivity(records) {
  const container =
    document.getElementById("activity");

  if (!container) return;

  const recent = records
    .slice()
    .sort((a, b) =>
      String(b.time_in || "")
        .localeCompare(
          String(a.time_in || "")
        )
    )
    .slice(0, 8);

  if (!recent.length) {
    container.innerHTML =
      `<p class="muted">No activity yet.</p>`;

    return;
  }

  container.innerHTML = recent
    .map(record => {
      const status = record.time_out
        ? "PICKED UP"
        : "IN SCHOOL";

      return `
        <div class="activity-row">
          <span class="activity-time">
            ${escapeHtml(record.time_in || "")}
          </span>

          <div>
            <strong>
              ${escapeHtml(
                record.student_name ||
                record.student_id ||
                ""
              )}
            </strong>

            <div class="muted">
              ${
                record.time_out
                  ? `Time out: ${escapeHtml(
                      record.time_out
                    )}`
                  : "Currently in school"
              }

              ${
                record.pickup_person
                  ? ` • ${escapeHtml(
                      record.pickup_person
                    )}`
                  : ""
              }
            </div>
          </div>

          <span class="pill">
            ${status}
          </span>
        </div>
      `;
    })
    .join("");
}

/* ------------------------------------------------------------
   ADD STUDENT
   ------------------------------------------------------------ */

function addPickupPersonField() {
  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );

  if (!container) return;

  const form =
    document.createElement("div");

  form.className =
    "pickup-person authorized-person";

  form.innerHTML = `
    <div class="pickup-person-head">
      <div>
        <strong>
          Authorized Pickup Person
        </strong>

        <div class="muted">
          Person allowed to collect the student
        </div>
      </div>

      <button
        type="button"
        class="danger-btn remove-person"
      >
        Remove
      </button>
    </div>

    <div class="pickup-fields">
      <input
        class="pickup-name"
        placeholder="Full name"
      >

      <input
        class="pickup-relationship"
        placeholder="Relationship"
      >

      <input
        class="pickup-phone"
        placeholder="Contact number"
      >
    </div>
  `;

  form
    .querySelector(".remove-person")
    .addEventListener(
      "click",
      () => form.remove()
    );

  container.appendChild(form);
}

function resetPickupPeople() {
  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );

  if (!container) return;

  container.innerHTML = "";

  addPickupPersonField();
}

function clearStudentForm() {
  [
    "studentIdInput",
    "studentNameInput",
    "studentLevelInput",
    "studentParentInput",
    "studentPhoneInput"
  ].forEach(id => {
    const el =
      document.getElementById(id);

    if (el) el.value = "";
  });

  resetPickupPeople();

  const message =
    document.getElementById(
      "studentMessage"
    );

  if (message) {
    message.innerHTML = "";
  }
}

function collectAuthorizedPeople() {
  return [
    ...document.querySelectorAll(
      ".authorized-person"
    )
  ]
    .map(form => ({
      name:
        form.querySelector(
          ".pickup-name"
        )?.value.trim() || "",

      relationship:
        form.querySelector(
          ".pickup-relationship"
        )?.value.trim() ||
        "Not specified",

      phone:
        form.querySelector(
          ".pickup-phone"
        )?.value.trim() || ""
    }))
    .filter(person => person.name);
}
async function addStudent() {
  const id = document.getElementById("studentIdInput")?.value.trim().toUpperCase();
  const name = document.getElementById("studentNameInput")?.value.trim();
  const level = document.getElementById("studentLevelInput")?.value.trim();
  const parent = document.getElementById("studentParentInput")?.value.trim();
  const phone = document.getElementById("studentPhoneInput")?.value.trim();

  if (!id || !name || !level || !parent) {
    setMessage(
      "studentMessage",
      "Please complete Student ID, Name, Level and Parent/Guardian.",
      "warning"
    );
    return;
  }

  const authorized = collectAuthorizedPeople();

  try {
    const { data: existing, error: checkError } = await supabaseClient
      .from("students")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (checkError) {
      showSupabaseError(checkError, "Unable to check Student ID.");
      return;
    }

    if (existing) {
      setMessage("studentMessage", "This Student ID already exists.", "warning");
      return;
    }

    const student = {
      id,
      name,
      level,
      parent,
      phone: phone || "",
      authorized
    };

    const { error } = await supabaseClient.from("students").insert(student);

    if (error) {
      showSupabaseError(error, "Unable to save student.");
      return;
    }

    setMessage("studentMessage", `${name} was added successfully.`, "success");
    toast("Student added to shared database.");

    await loadStudents();
    await refreshDashboard();

    setTimeout(() => show("students"), 700);
  } catch (error) {
    console.error("Add student error:", error);
    toast("Unable to save student.");
  }
}

/* ------------------------------------------------------------
   STUDENTS
   ------------------------------------------------------------ */

async function renderStudents() {
  await loadStudents();

  const container = document.getElementById("studentList");
  if (!container) return;

  const search = document.getElementById("studentSearch")?.value.trim().toLowerCase() || "";

  const filtered = studentsCache.filter(student => {
    if (!search) return true;
    return String(student.id || "").toLowerCase().includes(search) ||
      String(student.name || "").toLowerCase().includes(search);
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="panel">
        <p class="muted">No students found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(student => {
    const authorized = getAuthorized(student);

    return `
      <div class="student-row">
        <div class="student-main">
          <h3>${escapeHtml(student.name)}</h3>
          <p><strong>${escapeHtml(student.id)}</strong> • ${escapeHtml(student.level || "-")}</p>
          <p>Parent/Guardian: ${escapeHtml(student.parent || "-")}</p>
          <p>Authorized Pickup: ${authorized.length} person(s)</p>
        </div>
        <div class="student-actions">
          <button class="secondary-btn" onclick="generateStudentQR('${safeJs(student.id)}')">▣ QR</button>
          <button class="primary-btn" onclick="viewStudent('${safeJs(student.id)}')">View Details</button>
          <button class="danger-btn" onclick="deleteStudent('${safeJs(student.id)}')">Remove</button>
        </div>
      </div>
    `;
  }).join("");
}

async function viewStudent(id) {
  const student = await getStudentById(id);
  if (!student) {
    toast("Student not found.");
    return;
  }

  currentStudent = student;
  await renderStudent(student);
  await show("student");
}

async function renderStudent(student) {
  const card = document.getElementById("studentCard");
  if (!card) return;

  const record = await getTodayRecord(student.id);
  const authorized = getAuthorized(student);

  card.innerHTML = `
    <div class="panel-head">
      <div>
        <h3>${escapeHtml(student.name)}</h3>
        <p>${escapeHtml(student.id)} • ${escapeHtml(student.level || "-")}</p>
      </div>
      <span class="status-badge ${record?.time_out ? "status-out" : record?.time_in ? "status-in" : "status-out"}">
        ${record?.time_out ? "PICKED UP" : record?.time_in ? "IN SCHOOL" : "NOT CHECKED IN"}
      </span>
    </div>

    <div class="profile-grid">
      <div class="detail-item"><span>Student ID</span><b>${escapeHtml(student.id)}</b></div>
      <div class="detail-item"><span>Level / Grade</span><b>${escapeHtml(student.level || "-")}</b></div>
      <div class="detail-item"><span>Parent / Guardian</span><b>${escapeHtml(student.parent || "-")}</b></div>
      <div class="detail-item"><span>Parent Phone</span><b>${escapeHtml(student.phone || "-")}</b></div>
      <div class="detail-item"><span>Time In</span><b>${escapeHtml(record?.time_in || "-")}</b></div>
      <div class="detail-item"><span>Time Out</span><b>${escapeHtml(record?.time_out || "-")}</b></div>
    </div>

    <h3>Authorized Pickup People</h3>
    <div class="authorized-list">
      ${
        authorized.length
          ? authorized.map((person, i) => `
              <div class="authorized-item">
                <strong>${i + 1}. ${escapeHtml(person.name)}</strong>
                <div class="muted">
                  ${escapeHtml(person.relationship || "Not specified")}
                  ${person.phone ? ` • ${escapeHtml(person.phone)}` : ""}
                </div>
              </div>
            `).join("")
          : `<p class="muted">No authorized pickup people registered.</p>`
      }
    </div>

    <div class="profile-actions">
      ${
        !record?.time_in
          ? `<button class="primary-btn" onclick="timeIn()">↪ Time In</button>`
          : ""
      }
      ${
        record?.time_in && !record?.time_out
          ? `<button class="primary-btn" onclick="openPickup()">🚗 Pickup / Time Out</button>`
          : ""
      }
      <button class="secondary-btn" onclick="generateStudentQR('${safeJs(student.id)}')">▣ Generate QR</button>
      <button class="secondary-btn" onclick="show('scanner')">📷 Scan Another</button>
    </div>
  `;
}

async function deleteStudent(id) {
  const student = studentsCache.find(item => item.id === id);
  if (!student) {
    toast("Student not found.");
    return;
  }

  if (!confirm(`Remove ${student.name} (${student.id})?`)) return;

  const { error } = await supabaseClient
    .from("students")
    .delete()
    .eq("id", id);

  if (error) {
    showSupabaseError(error, "Unable to remove student.");
    return;
  }

  toast("Student removed.");
  await renderStudents();
  await refreshDashboard();
}

/* ------------------------------------------------------------
   TIME IN
   ------------------------------------------------------------ */

async function timeIn() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  try {
    const existing = await getTodayRecord(currentStudent.id);

    if (existing?.time_in) {
      toast(`Student already checked in at ${existing.time_in}.`);
      await renderStudent(currentStudent);
      return;
    }

    const record = {
      date: today(),
      student_id: currentStudent.id,
      student_name: currentStudent.name,
      level: currentStudent.level || "",
      time_in: nowTime(),
      staff: "Staff"
    };

    const { error } = await supabaseClient
      .from("attendance")
      .insert(record);

    if (error) {
      showSupabaseError(error, "Unable to save Time In.");
      return;
    }

    toast("TIME IN recorded.");
    await loadTodayAttendance();
    await renderStudent(currentStudent);
    await refreshDashboard();
  } catch (error) {
    console.error("Time In error:", error);
    toast("Unable to save Time In.");
  }
}