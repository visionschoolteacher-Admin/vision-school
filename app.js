// ============================================================
// VISION SCHOOL
// Student Security & Attendance System
// FINAL MULTI-DEVICE VERSION
// ============================================================

"use strict";

/*
  IMPORTANT:
  We intentionally use "sbClient" instead of "supabase"
  so we do not conflict with window.supabase from the CDN.
*/

const SUPABASE_URL = "https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

const { createClient } = window.supabase;

// IMPORTANT:
// Do NOT call the database client "supabase".
// window.supabase belongs to the Supabase JavaScript library.
const db = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// Make the database client available globally as well.
window.VisionSchoolDB = db;

// ------------------------------------------------------------
// TABLE NAMES
// ------------------------------------------------------------

const STUDENTS_TABLE = "students";
const ATTENDANCE_TABLE = "attendance";
const GUESTS_TABLE = "guests";
const GUEST_LOGS_TABLE = "guest_logs";

// ------------------------------------------------------------
// APPLICATION STATE
// ------------------------------------------------------------

let studentsCache = [];
let attendanceCache = [];
let guestsCache = [];
let guestLogsCache = [];

let guestTableAvailable = true;
let guestLogsTableAvailable = true;

let currentStudent = null;
let selectedPickup = null;

let qrScanner = null;
let scannerRunning = false;

let realtimeChannel = null;
let toastTimer = null;

// ============================================================
// BASIC HELPERS
// ============================================================

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function attr(value) {
  return esc(value).replace(/`/g, "&#96;");
}

function toast(message) {
  const element = document.getElementById("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(function () {
    element.style.display = "none";
  }, 3000);
}

function today() {
  const d = new Date();

  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

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

function updateOnlineStatus() {
  const badge = document.getElementById("onlineBadge");
  const connectionText = document.getElementById("connectionText");
  const dot = document.getElementById("statusDot");

  const online = navigator.onLine;

  if (badge) {
    badge.textContent = online ? "ONLINE" : "OFFLINE";
    badge.className = "badge " + (online ? "online" : "offline");
  }

  if (connectionText) {
    connectionText.textContent = online
      ? "Connected"
      : "No internet connection";
  }

  if (dot) {
    dot.className = "status-dot " + (online ? "online-dot" : "offline-dot");
  }
}

// ============================================================
// SCREEN NAVIGATION
// ============================================================

function show(screenId) {
  document.querySelectorAll(".screen").forEach(function (screen) {
    screen.classList.remove("active");
  });

  document.querySelectorAll(".nav-btn").forEach(function (button) {
    button.classList.toggle(
      "active",
      button.dataset.screen === screenId
    );
  });

  const screen = document.getElementById(screenId);

  if (screen) {
    screen.classList.add("active");
  }

  const titleMap = {
    home: "Dashboard",
    scanner: "Scan QR Code",
    students: "Students",
    addStudent: "Add Student",
    student: "Student Details",
    pickup: "Pickup / Time Out",
    guests: "Guests",
    reports: "Reports",
    about: "About System"
  };

  const pageTitle = document.getElementById("pageTitle");

  if (pageTitle) {
    pageTitle.textContent = titleMap[screenId] || "Vision School";
  }

  if (screenId !== "scanner") {
    stopScanner();
  }

  if (screenId === "home") {
    refreshDashboard();
  }

  if (screenId === "students") {
    renderStudents();
  }

  if (screenId === "guests") {
    renderGuests();
  }

  if (screenId === "reports") {
    renderReport();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// ============================================================
// DATA NORMALIZATION
// ============================================================

function normalizeStudent(student) {
  return {
    ...student,

    id: String(student.id ?? "").trim(),
    name: String(student.name ?? "").trim(),
    level: String(student.level ?? "").trim(),
    parent: String(student.parent ?? "").trim(),
    phone: String(student.phone ?? "").trim(),

    authorized: Array.isArray(student.authorized)
      ? student.authorized
      : []
  };
}

function normalizeAttendance(record) {
  return {
    ...record,

    student_id: record.student_id ?? record.studentId ?? "",
    student_name: record.student_name ?? record.studentName ?? "",
    level: record.level ?? "",

    date: record.date ?? "",

    time_in: record.time_in ?? record.timeIn ?? null,
    time_out: record.time_out ?? record.timeOut ?? null,

    pickup_person:
      record.pickup_person ??
      record.pickupPerson ??
      null,

    pickup_relationship:
      record.pickup_relationship ??
      record.pickupRelationship ??
      null,

    pickup_phone:
      record.pickup_phone ??
      record.pickupPhone ??
      null,

    pickup_option:
      record.pickup_option ??
      record.pickupOption ??
      null,

    staff: record.staff ?? "",
    approver: record.approver ?? "",
    notes: record.notes ?? ""
  };
}

function normalizeGuest(guest) {
  return {
    ...guest,

    id: guest.id,

    guest_name: String(guest.guest_name ?? "").trim(),

    contact_number: String(
      guest.contact_number ?? ""
    ).trim(),

    purpose: String(
      guest.purpose ?? ""
    ).trim()
  };
}

// ============================================================
// SUPABASE LOADERS
// ============================================================

async function loadStudents() {
  const result = await sbClient
    .from(STUDENTS_TABLE)
    .select("*")
    .order("name", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  studentsCache = (result.data || []).map(normalizeStudent);
}

async function loadAttendance() {
  const result = await sbClient
    .from(ATTENDANCE_TABLE)
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (result.error) {
    throw result.error;
  }

  attendanceCache = (result.data || []).map(
    normalizeAttendance
  );
}

async function loadGuests() {
  const result = await sbClient
    .from(GUESTS_TABLE)
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (result.error) {
    guestTableAvailable = false;

    console.warn(
      "Guest table unavailable:",
      result.error.message
    );

    return;
  }

  guestTableAvailable = true;

  guestsCache = (result.data || []).map(
    normalizeGuest
  );
}

async function loadGuestLogs() {
  const result = await sbClient
    .from(GUEST_LOGS_TABLE)
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (result.error) {
    guestLogsTableAvailable = false;

    console.warn(
      "Guest logs unavailable:",
      result.error.message
    );

    return;
  }

  guestLogsTableAvailable = true;

  guestLogsCache = result.data || [];
}

// ============================================================
// REFRESH EVERYTHING
// ============================================================

async function refreshAll() {
  console.log("Loading Vision School database...");

  try {
    await loadStudents();
    console.log("✓ students loaded:", studentsCache.length);
  } catch (e) {
    console.error("STUDENTS ERROR:", e);
    toast("Students database error: " + (e.message || "Unknown error"));
  }

  try {
    await loadAttendance();
    console.log("✓ attendance loaded:", attendanceCache.length);
  } catch (e) {
    console.error("ATTENDANCE ERROR:", e);
    toast("Attendance database error: " + (e.message || "Unknown error"));
  }

  try {
    await loadGuests();
    console.log("✓ guests loaded:", guestsCache.length);
  } catch (e) {
    console.error("GUESTS ERROR:", e);
    guestsCache = [];
  }

  try {
    await loadGuestLogs();
    console.log("✓ guest logs loaded:", guestLogsCache.length);
  } catch (e) {
    console.error("GUEST LOGS ERROR:", e);
    guestLogsCache = [];
  }

  refreshDashboard();
  renderStudents();

  if (document.getElementById("guests")?.classList.contains("active")) {
    renderGuests();
  }

  console.log("✓ Vision School database loading completed.");
}

// ============================================================
// REALTIME MULTI-DEVICE
// ============================================================

function setupRealtime() {
  if (realtimeChannel) {
    return;
  }

  realtimeChannel = sbClient
    .channel("vision-school-live")

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: STUDENTS_TABLE
      },
      async function () {
        await loadStudents();

        refreshDashboard();
        renderStudents();

        if (currentStudent) {
          await refreshCurrentStudent();
        }
      }
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: ATTENDANCE_TABLE
      },
      async function () {
        await loadAttendance();

        refreshDashboard();
        renderReport();

        if (currentStudent) {
          await refreshCurrentStudent();
        }
      }
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: GUESTS_TABLE
      },
      async function () {
        await loadGuests();

        renderGuests();
        refreshDashboard();
      }
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: GUEST_LOGS_TABLE
      },
      async function () {
        await loadGuestLogs();

        renderReport();
      }
    )

    .subscribe(function (status) {
      console.log(
        "Vision School realtime status:",
        status
      );
    });
}

// ============================================================
// DASHBOARD
// ============================================================

function refreshDashboard() {
  const date = today();

  const todaysAttendance =
    attendanceCache.filter(function (record) {
      return record.date === date;
    });

  const timeInRecords =
    todaysAttendance.filter(function (record) {
      return !!record.time_in;
    });

  const pickedUpRecords =
    todaysAttendance.filter(function (record) {
      return !!record.time_out;
    });

  const currentlyInSchool =
    todaysAttendance.filter(function (record) {
      return record.time_in && !record.time_out;
    });

  const setValue = function (id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  };

  setValue(
    "totalStudents",
    studentsCache.length
  );

  setValue(
    "timeInCount",
    timeInRecords.length
  );

  setValue(
    "inSchoolCount",
    currentlyInSchool.length
  );

  setValue(
    "pickedCount",
    pickedUpRecords.length
  );

  setValue(
    "notInCount",
    Math.max(
      0,
      studentsCache.length -
        timeInRecords.length
    )
  );

  setValue(
    "guestCount",
    guestsCache.length
  );

  const activity =
    document.getElementById("activity");

  if (!activity) {
    return;
  }

  if (
    !todaysAttendance.length &&
    !guestsCache.length
  ) {
    activity.innerHTML =
      '<p class="muted">No activity yet.</p>';

    return;
  }

  const studentRows =
    todaysAttendance
      .slice()
      .sort(function (a, b) {
        return String(
          b.created_at || ""
        ).localeCompare(
          String(a.created_at || "")
        );
      })
      .slice(0, 6)
      .map(function (record) {
        return `
          <div class="activity-row">
            <b>${esc(record.student_name || "")}</b>
            —
            ${record.time_out
              ? "PICKED UP"
              : "IN SCHOOL"
            }

            <br>

            <span class="muted">
              ${esc(record.time_in || "")}

              ${
                record.time_out
                  ? ` → ${esc(record.time_out)}`
                  : ""
              }

              ${
                record.pickup_person
                  ? ` • ${esc(record.pickup_person)}`
                  : ""
              }
            </span>
          </div>
        `;
      });

  const guestRows =
    guestsCache
      .slice(0, 3)
      .map(function (guest) {
        return `
          <div class="activity-row">
            <b>
              GUEST:
              ${esc(guest.guest_name)}
            </b>
            — REGISTERED

            <br>

            <span class="muted">
              ${esc(guest.purpose)}
              •
              ${
                guest.created_at
                  ? new Date(
                      guest.created_at
                    ).toLocaleTimeString()
                  : ""
              }
            </span>
          </div>
        `;
      });

  activity.innerHTML =
    studentRows
      .concat(guestRows)
      .join("") ||
    '<p class="muted">No activity yet.</p>';
}

// ============================================================
// ADD STUDENT
// ============================================================

function addPickupPersonField() {
  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );

  if (!container) {
    return;
  }

  const card =
    document.createElement("div");

  card.className = "student-card";

  card.innerHTML = `
    <div class="row">
      <b>Authorized Person</b>

      <button
        type="button"
        class="danger"
        onclick="
          this.closest('.student-card').remove()
        "
      >
        Remove
      </button>
    </div>

    <label>Full Name</label>

    <input
      class="pickup-name"
      placeholder="Full name"
    >

    <label>Relationship</label>

    <input
      class="pickup-relationship"
      placeholder="Mother, Father, Aunt..."
    >

    <label>Contact Number</label>

    <input
      class="pickup-phone"
      placeholder="Phone number"
    >
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
  ].forEach(function (id) {
    const element =
      document.getElementById(id);

    if (element) {
      element.value = "";
    }
  });

  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );

  if (container) {
    container.innerHTML = "";
  }

  const message =
    document.getElementById(
      "studentMessage"
    );

  if (message) {
    message.innerHTML = "";
  }

  addPickupPersonField();
}

function showStudentMessage(
  message,
  type = "success"
) {
  const element =
    document.getElementById(
      "studentMessage"
    );

  if (!element) {
    return;
  }

  element.innerHTML = `
    <div class="${
      type === "warning"
        ? "warning"
        : "success"
    }">
      ${esc(message)}
    </div>
  `;

  setTimeout(function () {
    element.innerHTML = "";
  }, 3500);
}

async function addStudent(event) {
  if (event) {
    event.preventDefault();
  }

  const id =
    document
      .getElementById("studentIdInput")
      ?.value
      .trim()
      .toUpperCase() || "";

  const name =
    document
      .getElementById("studentNameInput")
      ?.value
      .trim() || "";

  const level =
    document
      .getElementById("studentLevelInput")
      ?.value
      .trim() || "";

  const parent =
    document
      .getElementById("studentParentInput")
      ?.value
      .trim() || "";

  const phone =
    document
      .getElementById("studentPhoneInput")
      ?.value
      .trim() || "";

  if (!id || !name || !level || !parent) {
    showStudentMessage(
      "Please complete Student ID, Name, Level/Grade, and Parent/Guardian.",
      "warning"
    );

    return;
  }

  const duplicate =
    studentsCache.some(function (student) {
      return (
        student.id.toUpperCase() === id
      );
    });

  if (duplicate) {
    showStudentMessage(
      "This Student ID already exists.",
      "warning"
    );

    return;
  }

  const authorized = [
    ...document.querySelectorAll(
      "#pickupPeopleContainer .student-card"
    )
  ]
    .map(function (card) {
      return {
        name:
          card
            .querySelector(".pickup-name")
            ?.value
            .trim() || "",

        relationship:
          card
            .querySelector(
              ".pickup-relationship"
            )
            ?.value
            .trim() || "",

        phone:
          card
            .querySelector(".pickup-phone")
            ?.value
            .trim() || ""
      };
    })
    .filter(function (person) {
      return person.name;
    });

  const result = await sbClient
    .from(STUDENTS_TABLE)
    .insert({
      id: id,
      name: name,
      level: level,
      parent: parent,
      phone: phone,
      authorized: authorized
    });

  if (result.error) {
    console.error(
      "Student save error:",
      result.error
    );

    showStudentMessage(
      "Save failed: " +
        result.error.message,
      "warning"
    );

    return;
  }

  showStudentMessage(
    name + " was added successfully."
  );

  clearStudentForm();

  await loadStudents();

  renderStudents();
  refreshDashboard();

  toast(
    "Student added to shared database."
  );
}

// ============================================================
// STUDENT LIST
// ============================================================

function renderStudents() {
  const container = document.getElementById("studentList");
  if (!container) return;

  const search = (
    document.getElementById("studentSearch")?.value || ""
  ).toLowerCase().trim();

  const students = studentsCache
    .filter(function (student) {
      return (
        !search ||
        String(student.id || "").toLowerCase().includes(search) ||
        String(student.name || "").toLowerCase().includes(search) ||
        String(student.level || "").toLowerCase().includes(search)
      );
    })
    .sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  if (!students.length) {
    container.innerHTML = '<p class="muted">No students found.</p>';
    return;
  }

  container.innerHTML = students.map(function (student) {
    const studentId = attr(student.id);
    const authorizedCount = Array.isArray(student.authorized)
      ? student.authorized.length
      : 0;

    return `
      <div class="student-card">
        <div class="student-title">
          <div>
            <h3>${esc(student.name)}</h3>
            <div>${esc(student.id)} • ${esc(student.level)}</div>
            <div class="muted">Parent: ${esc(student.parent)}</div>
          </div>
          <span class="pill">${authorizedCount} authorized</span>
        </div>

        <div class="row" style="margin-top:12px">
          <button type="button" class="primary student-action"
                  data-action="qr" data-student-id="${studentId}">
            🔲 Generate QR
          </button>

          <button type="button" class="secondary student-action"
                  data-action="view" data-student-id="${studentId}">
            👁 View
          </button>

          <button type="button" class="danger student-action"
                  data-action="delete" data-student-id="${studentId}">
            🗑 Remove
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// Student buttons use one delegated click handler.
// This avoids inline onclick parsing errors in the browser.
function setupStudentActionEvents() {
  const container = document.getElementById("studentList");
  if (!container || container.dataset.eventsReady === "1") return;

  container.dataset.eventsReady = "1";

  container.addEventListener("click", async function (event) {
    const button = event.target.closest(".student-action");
    if (!button) return;

    const id = button.getAttribute("data-student-id");
    const action = button.getAttribute("data-action");

    if (!id) {
      toast("Student ID is missing.");
      return;
    }

    if (action === "qr") {
      generateStudentQR(id);
      return;
    }

    if (action === "view") {
      await viewStudent(id);
      return;
    }

    if (action === "delete") {
      await deleteStudent(id);
    }
  });
}

// ============================================================
// STUDENT DETAILS
// ============================================================

async function viewStudent(id) {
  currentStudent =
    studentsCache.find(function (student) {
      return student.id === id;
    }) || null;

  if (!currentStudent) {
    toast("Student not found.");
    return;
  }

  await renderStudent(currentStudent);

  show("student");
}

async function refreshCurrentStudent() {
  if (!currentStudent) {
    return;
  }

  const fresh =
    studentsCache.find(function (student) {
      return (
        student.id ===
        currentStudent.id
      );
    });

  if (fresh) {
    currentStudent = fresh;

    await renderStudent(fresh);
  }
}

function attendanceFor(id) {
  return (
    attendanceCache.find(function (record) {
      return (
        record.date === today() &&
        String(record.student_id) ===
          String(id)
      );
    }) || null
  );
}

async function renderStudent(student) {
  const card =
    document.getElementById(
      "studentCard"
    );

  if (!card) {
    return;
  }

  const record =
    attendanceFor(student.id);

  const authorized =
    student.authorized || [];

  let status = "NOT CHECKED IN";
  let statusClass = "status-none";

  if (record?.time_out) {
    status = "PICKED UP";
    statusClass = "status-out";
  } else if (record?.time_in) {
    status = "IN SCHOOL";
    statusClass = "status-in";
  }

  const authorizedHTML =
    authorized.length
      ? `
        <div class="student-card">

          ${authorized
            .map(function (person, index) {
              return `
                <div>
                  <b>
                    ${index + 1}.
                    ${esc(person.name)}
                  </b>

                  —
                  ${esc(
                    person.relationship ||
                      ""
                  )}

                  ${
                    person.phone
                      ? ` • ${esc(
                          person.phone
                        )}`
                      : ""
                  }
                </div>
              `;
            })
            .join("")}

        </div>
      `
      : `
        <p class="muted">
          No authorized pickup people registered.
        </p>
      `;

  card.innerHTML = `
    <h2>Student Details</h2>

    <h2>
      ${esc(student.name)}
    </h2>

    <p>
      <b>Student ID:</b>
      ${esc(student.id)}
    </p>

    <p>
      <b>Level / Grade:</b>
      ${esc(student.level)}
    </p>

    <p>
      <b>Parent / Guardian:</b>
      ${esc(student.parent)}
    </p>

    <p>
      <b>Parent Phone:</b>
      ${esc(student.phone || "-")}
    </p>

    <p>
      <b>Authorized Pickup People:</b>
      ${authorized.length}
    </p>

    ${authorizedHTML}

    <p>
      <b>Status:</b>

      <span
        class="pill ${statusClass}"
      >
        ${status}
      </span>
    </p>

    ${
      record?.time_in
        ? `
          <p>
            <b>Time In:</b>
            ${esc(record.time_in)}
          </p>
        `
        : ""
    }

    ${
      record?.time_out
        ? `
          <p>
            <b>Time Out:</b>
            ${esc(record.time_out)}
          </p>

          <p>
            <b>Pickup:</b>
            ${esc(
              record.pickup_person ||
                "-"
            )}
          </p>
        `
        : ""
    }

    <div
      class="row"
      style="margin-top:16px"
    >

      ${
        !record?.time_in
          ? `
            <button
              class="primary"
              onclick="timeIn()"
            >
              ⏱️ TIME IN
            </button>
          `
          : !record?.time_out
          ? `
            <button
              class="primary"
              onclick="openPickup()"
            >
              🚗 PICKUP / TIME OUT
            </button>
          `
          : ""
      }

      <button
        class="secondary"
        onclick="show('scanner')"
      >
        ← Scan Another
      </button>

    </div>
  `;
}

// ============================================================
// DELETE STUDENT
// ============================================================

async function deleteStudent(id) {
  const student =
    studentsCache.find(function (item) {
      return item.id === id;
    });

  if (!student) {
    return;
  }

  if (
    !confirm(
      `Remove ${student.name} (${student.id})?`
    )
  ) {
    return;
  }

  const result = await sbClient
    .from(STUDENTS_TABLE)
    .delete()
    .eq("id", id);

  if (result.error) {
    toast(
      "Delete failed: " +
        result.error.message
    );

    return;
  }

  toast("Student removed.");

  await loadStudents();

  refreshDashboard();
  renderStudents();
}

// ============================================================
// QR GENERATOR
// ============================================================

function generateStudentQR(id) {
  const oldModal =
    document.getElementById(
      "qrModal"
    );

  if (oldModal) {
    oldModal.remove();
  }

  const modal =
    document.createElement("div");

  modal.id = "qrModal";
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-box">

      <button
        class="modal-close"
        onclick="
          document
            .getElementById('qrModal')
            ?.remove()
        "
      >
        ×
      </button>

      <h2>
        Student QR Code
      </h2>

      <p class="muted">
        Student ID
      </p>

      <h2>
        ${esc(id)}
      </h2>

      <div
        id="qrCodeBox"
        style="
          display:flex;
          justify-content:center;
          align-items:center;
          margin:18px;
          min-height:250px;
        "
      >
        <p class="muted">
          Generating QR...
        </p>
      </div>

      <p class="muted">
        This QR contains only the Student ID.
      </p>

      <div class="row">

        <button
          class="primary"
          onclick="
            downloadStudentQR(
              '${attr(id)}'
            )
          "
        >
          💾 Download
        </button>

        <button
          class="secondary"
          onclick="
            document
              .getElementById('qrModal')
              ?.remove()
          "
        >
          Close
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

  const box =
    document.getElementById(
      "qrCodeBox"
    );

  if (!box) {
    return;
  }

  // Give browser a moment to create the modal
  setTimeout(function () {
    try {
      if (
        typeof window.QRCode ===
        "undefined"
      ) {
        throw new Error(
          "QRCode library not loaded."
        );
      }

      box.innerHTML = "";

      new window.QRCode(box, {
        text: String(id),
        width: 250,
        height: 250,
        correctLevel:
          window.QRCode.CorrectLevel.H
      });

    } catch (error) {
      console.error(
        "QR generation error:",
        error
      );

      box.innerHTML = `
        <div class="warning">
          <b>QR code could not be generated.</b>
          <br><br>
          Please refresh the page and try again.
        </div>
      `;
    }
  }, 100);
}

function downloadStudentQR(id) {
  const box =
    document.getElementById(
      "qrCodeBox"
    );

  if (!box) {
    toast("QR code is not ready.");
    return;
  }

  const canvas =
    box.querySelector("canvas");

  const image =
    box.querySelector("img");

  if (canvas) {
    const link =
      document.createElement("a");

    link.download =
      `${id}_QR.png`;

    link.href =
      canvas.toDataURL(
        "image/png"
      );

    link.click();

    return;
  }

  if (image) {
    const link =
      document.createElement("a");

    link.download =
      `${id}_QR.png`;

    link.href = image.src;

    link.click();

    return;
  }

  toast(
    "QR code is not ready yet."
  );
}

// ============================================================
// TIME IN
// ============================================================

async function timeIn() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  const existing = attendanceFor(currentStudent.id);

  if (existing?.time_in) {
    toast(`Already checked in at ${existing.time_in}.`);
    return;
  }

  const payload = {
    date: today(),
    student_id: currentStudent.id,
    student_name: currentStudent.name,
    time_in: now(),
    time_out: null,
    pickup_person: null,
    pickup_relationship: null,
    pickup_phone: null,
    pickup_option: null
  };

  console.log("Saving Time In:", payload);

  try {
    const { data, error } = await db
      .from(ATTENDANCE_TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("TIME IN DATABASE ERROR:", error);
      toast("Time In failed: " + error.message);
      return;
    }

    console.log("TIME IN SUCCESS:", data);

    await loadAttendance();

    toast("TIME IN SUCCESSFUL");

    await renderStudent(currentStudent);

    refreshDashboard();

  } catch (error) {
    console.error("TIME IN ERROR:", error);
    toast("Time In failed. Please try again.");
  }
}

// ============================================================
// PICKUP
// ============================================================

async function openPickup() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  const record =
    attendanceFor(
      currentStudent.id
    );

  if (!record?.time_in) {
    toast(
      "WARNING: Student has no TIME IN today."
    );

    return;
  }

  if (record.time_out) {
    toast(
      "Student already picked up."
    );

    return;
  }

  selectedPickup = null;

  const authorized =
    currentStudent.authorized ||
    [];

  const card =
    document.getElementById(
      "pickupCard"
    );

  if (!card) {
    return;
  }

  card.innerHTML = `
    <h2>
      🚗 Secure Pickup / Time Out
    </h2>

    <h3>
      ${esc(currentStudent.name)}
    </h3>

    <p>
      ${esc(currentStudent.id)}
      •
      ${esc(currentStudent.level)}
    </p>

    <hr>

    <h3>
      Authorized Pickup Person
    </h3>

    <div class="option-grid">

      ${
        authorized.length
          ? authorized
              .map(function (
                person,
                index
              ) {
                return `
                  <div
                    id="authOption${index}"
                    class="option"
                    onclick="
                      selectAuth(${index})
                    "
                  >

                    <b>
                      ${esc(
                        person.name
                      )}
                    </b>

                    <br>

                    ${esc(
                      person.relationship ||
                        ""
                    )}

                    ${
                      person.phone
                        ? ` • ${esc(
                            person.phone
                          )}`
                        : ""
                    }

                  </div>
                `;
              })
              .join("")
          : `
              <div class="warning">
                No authorized pickup persons
                are registered.
              </div>
            `
      }

    </div>

    <label>
      Pickup Option
    </label>

    <select
      id="pickupOption"
      onchange="optionChanged()"
    >
      <option value="">
        Select an option...
      </option>

      <option value="AUTHORIZED">
        Authorized pickup person
      </option>

      <option value="UNAUTHORIZED_APPROVAL">
        Unauthorized person — Admin Approval
      </option>

      <option value="EMERGENCY_APPROVAL">
        Emergency / Parent Phone Confirmation
      </option>

      <option value="OTHER_APPROVAL">
        Other — Admin Approval
      </option>
    </select>

    <div
      id="unauthorizedFields"
    ></div>

    <div class="row">

      <button
        class="secondary"
        onclick="show('student')"
      >
        Cancel
      </button>

      <button
        class="primary"
        onclick="confirmPickup()"
      >
        CONFIRM PICKUP
      </button>

    </div>
  `;

  card.dataset.authorized =
    JSON.stringify(
      authorized
    );

  show("pickup");
}

function selectAuth(index) {
  const card =
    document.getElementById(
      "pickupCard"
    );

  if (!card) {
    return;
  }

  const authorized =
    JSON.parse(
      card.dataset.authorized ||
        "[]"
    );

  const person =
    authorized[index];

  if (!person) {
    return;
  }

  selectedPickup = {
    ...person,
    option: "AUTHORIZED"
  };

  const select =
    document.getElementById(
      "pickupOption"
    );

  if (select) {
    select.value =
      "AUTHORIZED";
  }

  const fields =
    document.getElementById(
      "unauthorizedFields"
    );

  if (fields) {
    fields.innerHTML = "";
  }

  document
    .querySelectorAll(".option")
    .forEach(function (element) {
      element.classList.remove(
        "selected"
      );
    });

  const option =
    document.getElementById(
      `authOption${index}`
    );

  if (option) {
    option.classList.add(
      "selected"
    );
  }
}

function optionChanged() {
  const select =
    document.getElementById(
      "pickupOption"
    );

  const fields =
    document.getElementById(
      "unauthorizedFields"
    );

  if (!select || !fields) {
    return;
  }

  const value =
    select.value;

  selectedPickup = null;

  if (
    value === "AUTHORIZED" ||
    !value
  ) {
    fields.innerHTML = "";
    return;
  }

  fields.innerHTML = `
    <div
      style="
        margin-top:18px;
      "
    >

      <label>
        Pickup Person Full Name *
      </label>

      <input
        id="upName"
        placeholder="Full name"
        autocomplete="off"
      >

      <label>
        Relationship
      </label>

      <input
        id="upRel"
        placeholder="Aunt, Grandparent..."
        autocomplete="off"
      >

      <label>
        Contact Number
      </label>

      <input
        id="upPhone"
        placeholder="Phone number"
        autocomplete="off"
      >

      <label>
        Vehicle Plate Number
        <span class="muted">
          (optional)
        </span>
      </label>

      <input
        id="upPlate"
        placeholder="Example: 1234 ABC"
        autocomplete="off"
      >

      <label>
        Reason / Notes
      </label>

      <textarea
        id="upReason"
        rows="3"
        placeholder="
          Explain why this person is
          picking up the student.
        "
      ></textarea>

      <label>
        Approving Staff *
      </label>

      <input
        id="approver"
        placeholder="Admin / authorized staff name"
        autocomplete="off"
      >

      <div class="warning">

        <b>
          ⚠ APPROVAL REQUIRED
        </b>

        <br>

        Do not release the student
        until authorized staff approves
        this request.

      </div>

    </div>
  `;
}

async function confirmPickup() {
  if (!currentStudent) {
    return;
  }

  const option =
    document.getElementById(
      "pickupOption"
    )?.value || "";

  if (!option) {
    toast(
      "Please select a pickup option."
    );

    return;
  }

  let pickup =
    selectedPickup;

  if (
    option ===
    "AUTHORIZED"
  ) {
    if (!pickup) {
      toast(
        "Please select an authorized pickup person."
      );

      return;
    }

  } else {
    const name =
      document.getElementById(
        "upName"
      )?.value.trim() || "";

    const relationship =
      document.getElementById(
        "upRel"
      )?.value.trim() || "";

    const phone =
      document.getElementById(
        "upPhone"
      )?.value.trim() || "";

    const plate =
      document.getElementById(
        "upPlate"
      )?.value.trim() || "";

    const reason =
      document.getElementById(
        "upReason"
      )?.value.trim() || "";

    const approver =
      document.getElementById(
        "approver"
      )?.value.trim() || "";

    if (!name || !approver) {
      toast(
        "Pickup person name and approving staff are required."
      );

      return;
    }

    pickup = {
      name,
      relationship,
      phone,
      plate,
      reason,
      approver,
      option
    };

    if (
      !confirm(
        "Confirm ADMIN APPROVAL and release this student?"
      )
    ) {
      return;
    }
  }

  const record =
    attendanceFor(
      currentStudent.id
    );

  if (
    !record ||
    !record.time_in ||
    record.time_out
  ) {
    toast(
      "Attendance record is not ready for pickup."
    );

    return;
  }

  const payload = {
    time_out: now(),
    pickup_person: pickup.name || null,
    pickup_relationship: pickup.relationship || null,
    pickup_phone: pickup.phone || null,
    pickup_option: option
  };

  const result =
    await sbClient
      .from(ATTENDANCE_TABLE)
      .update(payload)
      .eq("id", record.id);

  if (result.error) {
    console.error(
      "Pickup error:",
      result.error
    );

    toast(
      "Pickup failed: " +
        result.error.message
    );

    return;
  }

  await loadAttendance();

  toast(
    "PICKUP SUCCESSFUL"
  );

  currentStudent = null;

  show("home");

  refreshDashboard();
}

// ============================================================
// QR SCANNER
// ============================================================

async function startScanner() {
  if (
    typeof window.Html5Qrcode ===
    "undefined"
  ) {
    toast(
      "QR scanner library did not load. Refresh the page."
    );

    return;
  }

  if (scannerRunning) {
    return;
  }

  const reader =
    document.getElementById(
      "reader"
    );

  if (!reader) {
    return;
  }

  reader.innerHTML = "";

  try {
    qrScanner =
      new window.Html5Qrcode(
        "reader"
      );

    await qrScanner.start(
      {
        facingMode:
          "environment"
      },
      {
        fps: 10,

        qrbox: {
          width: 250,
          height: 250
        }
      },
      function (decodedText) {
        handleScan(
          decodedText
        );
      },
      function () {}
    );

    scannerRunning = true;

    const message =
      document.getElementById(
        "scanMessage"
      );

    if (message) {
      message.innerHTML = `
        <div class="success">
          Camera is ready.
          Point it at the QR code.
        </div>
      `;
    }

  } catch (error) {
    console.error(
      "Camera error:",
      error
    );

    scannerRunning = false;

    toast(
      "Camera could not start. Allow camera permission and try again."
    );
  }
}

async function stopScanner() {
  if (!qrScanner) {
    scannerRunning = false;
    return;
  }

  try {
    if (scannerRunning) {
      await qrScanner.stop();
    }
  } catch (error) {
    console.warn(
      "Scanner stop warning:",
      error
    );
  }

  try {
    await qrScanner.clear();
  } catch (error) {
    console.warn(
      "Scanner clear warning:",
      error
    );
  }

  qrScanner = null;
  scannerRunning = false;
}

async function handleScan(rawValue) {
  const id =
    String(rawValue || "")
      .trim()
      .toUpperCase();

  if (!id) {
    toast(
      "No Student ID detected."
    );

    return;
  }

  await stopScanner();

  const student =
    studentsCache.find(
      function (item) {
        return (
          item.id.toUpperCase() ===
          id
        );
      }
    );

  if (!student) {
    const message =
      document.getElementById(
        "scanMessage"
      );

    if (message) {
      message.innerHTML = `
        <div class="warning">

          Student ID not found:
          <b>${esc(id)}</b>

          <br><br>

          Please add this student first.

        </div>
      `;
    }

    return;
  }

  currentStudent =
    student;

  await renderStudent(
    student
  );

  show("student");
}

// ============================================================
// GUEST REGISTER
// ============================================================

function openGuestForm() {
  const card =
    document.getElementById(
      "guestFormCard"
    );

  if (!card) {
    return;
  }

  card.innerHTML = `
    <h2>
      Register Guest
    </h2>

    <p class="muted">
      Enter the visitor's information
      for school monitoring.
    </p>

    <div class="form-grid">

      <div class="form-group">

        <label
          for="guestName"
        >
          Guest Name *
        </label>

        <input
          id="guestName"
          placeholder="Full name"
          autocomplete="off"
        >

      </div>

      <div class="form-group">

        <label
          for="guestContact"
        >
          Contact Number *
        </label>

        <input
          id="guestContact"
          placeholder="Phone number"
          autocomplete="off"
        >

      </div>

      <div
        class="form-group"
        style="grid-column:1/-1"
      >

        <label
          for="guestPurpose"
        >
          Purpose *
        </label>

        <textarea
          id="guestPurpose"
          rows="3"
          placeholder="
            Reason for visiting Vision School
          "
        ></textarea>

      </div>

    </div>

    <div class="form-actions">

      <button
        type="button"
        class="secondary-btn"
        onclick="clearGuestForm()"
      >
        Clear
      </button>

      <button
        type="button"
        class="primary-btn"
        onclick="saveGuest()"
      >
        ✓ Save Guest
      </button>

    </div>
  `;

  show("guests");

  document
    .getElementById(
      "guestName"
    )
    ?.focus();
}

function clearGuestForm() {
  [
    "guestName",
    "guestContact",
    "guestPurpose"
  ].forEach(function (id) {
    const element =
      document.getElementById(id);

    if (element) {
      element.value = "";
    }
  });
}

async function saveGuest() {
  const name =
    document
      .getElementById(
        "guestName"
      )
      ?.value.trim() || "";

  const contact =
    document
      .getElementById(
        "guestContact"
      )
      ?.value.trim() || "";

  const purpose =
    document
      .getElementById(
        "guestPurpose"
      )
      ?.value.trim() || "";

  if (
    !name ||
    !contact ||
    !purpose
  ) {
    toast(
      "Guest Name, Contact Number, and Purpose are required."
    );

    return;
  }

  if (!guestTableAvailable) {
    toast(
      "Guest database is not ready. Run guest_setup.sql in Supabase first."
    );

    return;
  }

  const result =
    await sbClient
      .from(GUESTS_TABLE)
      .insert({
        guest_name: name,
        contact_number: contact,
        purpose: purpose
      })
      .select()
      .single();

  if (result.error) {
    console.error(
      "Guest save error:",
      result.error
    );

    toast(
      "Guest save failed: " +
        result.error.message
    );

    return;
  }

  const guestId =
    result.data?.id ||
    null;

  if (guestLogsTableAvailable) {
    const logResult =
      await sbClient
        .from(GUEST_LOGS_TABLE)
        .insert({
          guest_id: guestId,
          guest_name: name,
          contact_number: contact,
          purpose: purpose,
          action: "ADDED"
        });

    if (logResult.error) {
      console.warn(
        "Guest log failed:",
        logResult.error.message
      );
    }
  }

  clearGuestForm();

  toast(
    "Guest registered successfully."
  );

  await loadGuests();
  await loadGuestLogs();

  renderGuests();
  refreshDashboard();
}

// ============================================================
// DELETE GUEST
// ============================================================

async function deleteGuest(id) {
  const guest =
    guestsCache.find(function (item) {
      return String(item.id) ===
        String(id);
    });

  if (!guest) {
    return;
  }

  const confirmed =
    confirm(
      `Remove guest ${guest.guest_name} from the active guest list?\n\nThe monitoring record will be kept in the Guest Audit Records.`
    );

  if (!confirmed) {
    return;
  }

  if (guestLogsTableAvailable) {
    const logResult =
      await sbClient
        .from(GUEST_LOGS_TABLE)
        .insert({
          guest_id: guest.id,
          guest_name:
            guest.guest_name,
          contact_number:
            guest.contact_number,
          purpose:
            guest.purpose,
          action:
            "REMOVED"
        });

    if (logResult.error) {
      toast(
        "Could not record guest removal: " +
          logResult.error.message
      );

      return;
    }
  }

  const result =
    await sbClient
      .from(GUESTS_TABLE)
      .delete()
      .eq("id", id);

  if (result.error) {
    toast(
      "Guest removal failed: " +
        result.error.message
    );

    return;
  }

  toast(
    "Guest removed from active list. Audit record kept."
  );

  await loadGuests();
  await loadGuestLogs();

  renderGuests();
  refreshDashboard();
}

// ============================================================
// GUEST LIST
// ============================================================

function renderGuests() {
  const list =
    document.getElementById(
      "guestList"
    );

  const count =
    document.getElementById(
      "guestCountLabel"
    );

  if (!list) {
    return;
  }

  if (count) {
    count.textContent =
      `${guestsCache.length} active guest${
        guestsCache.length === 1
          ? ""
          : "s"
      }`;
  }

  if (!guestTableAvailable) {
    list.innerHTML = `
      <div class="warning">

        <b>
          Guest database is not ready.
        </b>

        <br>

        Run the guest_setup.sql file
        in Supabase SQL Editor,
        then refresh this app.

      </div>
    `;

    return;
  }

  if (!guestsCache.length) {
    list.innerHTML =
      '<p class="muted">No active guests right now.</p>';

    return;
  }

  list.innerHTML =
    guestsCache
      .map(function (guest) {
        return `
          <div class="guest-card">

            <div>

              <h3>
                ${esc(
                  guest.guest_name
                )}
              </h3>

              <p>
                <b>Contact:</b>
                ${esc(
                  guest.contact_number
                )}
              </p>

              <p>
                <b>Purpose:</b>
                ${esc(
                  guest.purpose
                )}
              </p>

              <small class="muted">

                Registered

                ${
                  guest.created_at
                    ? esc(
                        new Date(
                          guest.created_at
                        ).toLocaleString()
                      )
                    : ""
                }

              </small>

            </div>

            <button
              class="danger"
              onclick="
                deleteGuest(
                  '${attr(
                    guest.id
                  )}'
                )
              "
            >
              🗑 Remove
            </button>

          </div>
        `;
      })
      .join("");
}

// ============================================================
// REPORTS
// ============================================================

async function renderReport() {
  const container =
    document.getElementById(
      "reportTable"
    );

  if (!container) {
    return;
  }

  if (
    !attendanceCache.length &&
    !guestLogsCache.length
  ) {
    container.innerHTML =
      '<p class="muted">No attendance or guest records yet.</p>';

    return;
  }

  const attendanceRows =
    attendanceCache
      .map(function (record) {
        return `
          <tr>

            <td>
              ${esc(record.date)}
            </td>

            <td>
              ${esc(
                record.student_name ||
                  ""
              )}
            </td>

            <td>
              ${esc(
                record.level || ""
              )}
            </td>

            <td>
              ${esc(
                record.time_in ||
                  "-"
              )}
            </td>

            <td>
              ${esc(
                record.time_out ||
                  "-"
              )}
            </td>

            <td>
              ${esc(
                record.pickup_person ||
                  "-"
              )}
            </td>

            <td>
              ${esc(
                record.pickup_option ||
                  "-"
              )}
            </td>

            <td>
              ${esc(
                record.approver ||
                  "-"
              )}
            </td>

            <td>
              ${esc(
                record.notes ||
                  "-"
              )}
            </td>

          </tr>
        `;
      })
      .join("");

  const guestRows =
    guestLogsCache
      .map(function (guest) {
        const date =
          guest.created_at
            ? new Date(
                guest.created_at
              )
            : null;

        return `
          <tr>

            <td>
              ${
                date
                  ? esc(
                      date.toLocaleDateString()
                    )
                  : "-"
              }
            </td>

            <td>
              ${
                date
                  ? esc(
                      date.toLocaleTimeString()
                    )
                  : "-"
              }
            </td>

            <td>
              ${esc(
                guest.guest_name ||
                  ""
              )}
            </td>

            <td>
              ${esc(
                guest.contact_number ||
                  ""
              )}
            </td>

            <td>
              ${esc(
                guest.purpose ||
                  ""
              )}
            </td>

            <td>
              ${esc(
                guest.action ||
                  ""
              )}
            </td>

          </tr>
        `;
      })
      .join("");

  container.innerHTML = `
    <h3>
      Attendance Records
    </h3>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>Date</th>
            <th>Student</th>
            <th>Level</th>
            <th>Time In</th>
            <th>Time Out</th>
            <th>Pickup</th>
            <th>Option</th>
            <th>Approver</th>
            <th>Notes</th>

          </tr>

        </thead>

        <tbody>
          ${
            attendanceRows ||
            `
              <tr>
                <td colspan="9">
                  No attendance records.
                </td>
              </tr>
            `
          }
        </tbody>

      </table>

    </div>

    <br>

    <h3>
      Guest Audit Records
    </h3>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>Date</th>
            <th>Time</th>
            <th>Guest Name</th>
            <th>Contact</th>
            <th>Purpose</th>
            <th>Action</th>

          </tr>

        </thead>

        <tbody>
          ${
            guestRows ||
            `
              <tr>
                <td colspan="6">
                  No guest audit records.
                </td>
              </tr>
            `
          }
        </tbody>

      </table>

    </div>
  `;
}

// ============================================================
// CSV EXPORT
// ============================================================

function csv(value) {
  return (
    '"' +
    String(value ?? "")
      .replaceAll('"', '""') +
    '"'
  );
}

function exportCSV() {
  const headers = [
    "Record Type",
    "Date",
    "Time",
    "Student ID",
    "Student Name",
    "Level",
    "Time In",
    "Time Out",
    "Pickup Person",
    "Relationship",
    "Phone",
    "Pickup Option",
    "Staff",
    "Approver",
    "Notes",
    "Guest Name",
    "Guest Contact",
    "Guest Purpose",
    "Guest Action"
  ];

  const lines = [
    headers.map(csv).join(",")
  ];

  attendanceCache.forEach(
    function (record) {
      lines.push(
        [
          "ATTENDANCE",
          record.date,
          "",
          record.student_id,
          record.student_name,
          record.level,
          record.time_in,
          record.time_out,
          record.pickup_person,
          record.pickup_relationship,
          record.pickup_phone,
          record.pickup_option,
          record.staff,
          record.approver,
          record.notes,
          "",
          "",
          "",
          ""
        ]
          .map(csv)
          .join(",")
      );
    }
  );

  guestLogsCache.forEach(
    function (guest) {
      const date =
        guest.created_at
          ? new Date(
              guest.created_at
            )
          : null;

      lines.push(
        [
          "GUEST AUDIT",
          date
            ? date.toLocaleDateString()
            : "",
          date
            ? date.toLocaleTimeString()
            : "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          guest.guest_name,
          guest.contact_number,
          guest.purpose,
          guest.action
        ]
          .map(csv)
          .join(",")
      );
    }
  );

  const blob =
    new Blob(
      [
        "\uFEFF" +
          lines.join("\n")
      ],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `vision_school_monitoring_${today()}.csv`;

  link.click();

  setTimeout(
    function () {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );
}

// ============================================================
// BUTTON EVENTS
// ============================================================

function setupButtonEvents() {
  document
    .querySelectorAll(
      "[data-screen]"
    )
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          show(
            button.dataset.screen
          );

          const sidebar =
            document.getElementById(
              "sidebar"
            );

          if (
            sidebar?.classList.contains(
              "open"
            )
          ) {
            sidebar.classList.remove(
              "open"
            );
          }
        }
      );
    });

  document
    .getElementById(
      "startCamera"
    )
    ?.addEventListener(
      "click",
      startScanner
    );

  document
    .getElementById(
      "stopCamera"
    )
    ?.addEventListener(
      "click",
      stopScanner
    );

  document
    .getElementById(
      "manualOpen"
    )
    ?.addEventListener(
      "click",
      function () {
        const input =
          document.getElementById(
            "manualId"
          );

        handleScan(
          input?.value || ""
        );
      }
    );

  document
    .getElementById(
      "studentForm"
    )
    ?.addEventListener(
      "submit",
      addStudent
    );

  document
    .getElementById(
      "addPickup"
    )
    ?.addEventListener(
      "click",
      addPickupPersonField
    );

  document
    .getElementById(
      "clearForm"
    )
    ?.addEventListener(
      "click",
      clearStudentForm
    );

  document
    .getElementById(
      "studentSearch"
    )
    ?.addEventListener(
      "input",
      renderStudents
    );

  document
    .getElementById(
      "refreshStudents"
    )
    ?.addEventListener(
      "click",
      async function () {
        await loadStudents();

        renderStudents();

        toast(
          "Student list refreshed."
        );
      }
    );

  document
    .getElementById(
      "exportCsv"
    )
    ?.addEventListener(
      "click",
      exportCSV
    );

  document
    .getElementById(
      "mobileMenu"
    )
    ?.addEventListener(
      "click",
      function () {
        document
          .getElementById(
            "sidebar"
          )
          ?.classList.toggle(
            "open"
          );
      }
    );

  document
    .getElementById(
      "guestAddButton"
    )
    ?.addEventListener(
      "click",
      openGuestForm
    );
}

// ============================================================
// ONLINE / OFFLINE
// ============================================================

window.addEventListener(
  "online",
  async function () {
    updateOnlineStatus();

    await refreshAll();
  }
);

window.addEventListener(
  "offline",
  updateOnlineStatus
);

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.show = show;

window.startScanner =
  startScanner;

window.stopScanner =
  stopScanner;

window.handleScan =
  handleScan;

window.addStudent =
  addStudent;

window.timeIn =
  timeIn;

window.openPickup =
  openPickup;

window.confirmPickup =
  confirmPickup;

window.selectAuth =
  selectAuth;

window.optionChanged =
  optionChanged;

window.exportCSV =
  exportCSV;

window.addPickupPersonField =
  addPickupPersonField;

window.deleteStudent =
  deleteStudent;

window.renderStudents =
  renderStudents;

window.generateStudentQR =
  generateStudentQR;

window.downloadStudentQR =
  downloadStudentQR;

window.viewStudent =
  viewStudent;

window.openGuestForm =
  openGuestForm;

window.saveGuest =
  saveGuest;

window.deleteGuest =
  deleteGuest;

window.clearGuestForm =
  clearGuestForm;

window.renderGuests =
  renderGuests;

// ============================================================
// START APPLICATION
// ============================================================

window.addEventListener(
  "DOMContentLoaded",
  async function () {
    console.log(
      "Vision School starting..."
    );

    updateOnlineStatus();

    updateClock();

    setInterval(
      updateClock,
      1000
    );

    setupButtonEvents();
  setupStudentActionEvents();

    clearStudentForm();

    await refreshAll();

    setupRealtime();

    console.log(
      "Vision School application started successfully."
    );
  }
);