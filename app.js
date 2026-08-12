/* =========================================================
   VISION SCHOOL ATTENDANCE APP
   FINAL APP.JS
   ========================================================= */

"use strict";

/* =========================================================
   DATABASE
   ========================================================= */

const DB = "visionSchoolDB";
const DB_VERSION = 3;

const STORE_STUDENTS = "students";
const STORE_ATT = "attendance";
const STORE_QUEUE = "queue";

let db = null;
let stream = null;
let currentStudent = null;
let selectedPickup = null;
let scannerRunning = false;
let barcodeDetector = null;

/* =========================================================
   HTML SECURITY
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (character) {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return replacements[character];
  });
}

/* =========================================================
   DATABASE
   ========================================================= */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, DB_VERSION);

    request.onupgradeneeded = function (event) {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_STUDENTS)) {
        database.createObjectStore(STORE_STUDENTS, {
          keyPath: "id"
        });
      }

      if (!database.objectStoreNames.contains(STORE_ATT)) {
        database.createObjectStore(STORE_ATT, {
          keyPath: "key"
        });
      }

      if (!database.objectStoreNames.contains(STORE_QUEUE)) {
        database.createObjectStore(STORE_QUEUE, {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    request.onsuccess = function () {
      db = request.result;

      db.onversionchange = function () {
        db.close();
      };

      resolve(db);
    };

    request.onerror = function () {
      reject(request.error);
    };

    request.onblocked = function () {
      reject(new Error("Database upgrade is blocked. Please close other app tabs."));
    };
  });
}

function tx(store, mode = "readonly") {
  if (!db) {
    throw new Error("Database is not initialized.");
  }

  return db.transaction(store, mode).objectStore(store);
}

function put(store, object) {
  return new Promise((resolve, reject) => {
    try {
      const request = tx(store, "readwrite").put(object);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

function add(store, object) {
  return new Promise((resolve, reject) => {
    try {
      const request = tx(store, "readwrite").add(object);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

function get(store, key) {
  return new Promise((resolve, reject) => {
    try {
      const request = tx(store).get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

function all(store) {
  return new Promise((resolve, reject) => {
    try {
      const request = tx(store).getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

function remove(store, key) {
  return new Promise((resolve, reject) => {
    try {
      const request = tx(store, "readwrite").delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

/* =========================================================
   DATE / TIME
   ========================================================= */

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function keyFor(studentId) {
  return `${today()}_${studentId}`;
}

/* =========================================================
   TOAST
   ========================================================= */

function toast(message) {
  let element = document.getElementById("toast");

  if (!element) {
    element = document.createElement("div");
    element.id = "toast";
    element.style.position = "fixed";
    element.style.left = "50%";
    element.style.bottom = "25px";
    element.style.transform = "translateX(-50%)";
    element.style.zIndex = "99999";
    element.style.padding = "14px 20px";
    element.style.borderRadius = "12px";
    element.style.background = "#111827";
    element.style.color = "#ffffff";
    element.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
    element.style.maxWidth = "90%";
    element.style.textAlign = "center";

    document.body.appendChild(element);
  }

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(element._timer);

  element._timer = setTimeout(() => {
    element.style.display = "none";
  }, 2800);
}

/* =========================================================
   ONLINE STATUS
   ========================================================= */

function online() {
  const badge = document.getElementById("onlineBadge");

  if (!badge) return;

  if (navigator.onLine) {
    badge.textContent = "ONLINE";
    badge.className = "badge online";
  } else {
    badge.textContent = "OFFLINE";
    badge.className = "badge offline";
  }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function show(id) {
  const screens = document.querySelectorAll(".screen");

  screens.forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(id);

  if (!target) {
    console.warn("Screen not found:", id);
    return;
  }

  target.classList.add("active");

  if (id === "home") {
    refresh();
  }

  if (id === "students") {
    renderStudents();
  }

  if (id === "reports") {
    renderReport();
  }

  if (id === "scanner") {
    updateScannerMessage();
  }
}

/* =========================================================
   STUDENT DATA
   ========================================================= */

function normalizeStudent(student) {
  return {
    id: String(student.id || "").trim(),
    name: String(student.name || "").trim(),
    level: String(student.level || "").trim(),
    section: String(student.section || "").trim(),
    parent: String(student.parent || "").trim(),
    phone: String(student.phone || "").trim(),
    authorized: Array.isArray(student.authorized)
      ? student.authorized.map(person => ({
          name: String(person.name || "").trim(),
          relationship: String(person.relationship || "").trim(),
          phone: String(person.phone || "").trim()
        }))
      : []
  };
}

/* =========================================================
   ADD STUDENT
   ========================================================= */

async function addStudent(event) {
  if (event) {
    event.preventDefault();
  }

  try {
    const id =
      document.getElementById("studentId")?.value.trim() ||
      document.getElementById("newStudentId")?.value.trim();

    const name =
      document.getElementById("studentName")?.value.trim() ||
      document.getElementById("newStudentName")?.value.trim();

    const grade =
      document.getElementById("studentGrade")?.value.trim() ||
      document.getElementById("newStudentGrade")?.value.trim();

    const section =
      document.getElementById("studentSection")?.value.trim() ||
      document.getElementById("newStudentSection")?.value.trim();

    const parent =
      document.getElementById("studentParent")?.value.trim() ||
      document.getElementById("newStudentParent")?.value.trim();

    const phone =
      document.getElementById("studentPhone")?.value.trim() ||
      document.getElementById("newStudentPhone")?.value.trim();

    if (!id) {
      toast("Please enter the Student ID.");
      return;
    }

    if (!name) {
      toast("Please enter the student's name.");
      return;
    }

    const existing = await get(STORE_STUDENTS, id);

    if (existing) {
      toast("Student ID already exists.");
      return;
    }

    const student = normalizeStudent({
      id,
      name,
      grade,
      section,
      parent,
      phone,
      authorized: collectAuthorizedPeople()
    });

    await put(STORE_STUDENTS, student);

    clearStudentForm();

    toast("Student saved successfully.");

    renderStudents();
    refresh();

    generateStudentQR(student);
  } catch (error) {
    console.error("Add student error:", error);
    toast("Unable to save student.");
  }
}

/* =========================================================
   CLEAR STUDENT FORM
   ========================================================= */

function clearStudentForm() {
  const ids = [
    "studentId",
    "newStudentId",
    "studentName",
    "newStudentName",
    "studentGrade",
    "newStudentGrade",
    "studentSection",
    "newStudentSection",
    "studentParent",
    "newStudentParent",
    "studentPhone",
    "newStudentPhone"
  ];

  ids.forEach(id => {
    const element = document.getElementById(id);

    if (element) {
      element.value = "";
    }
  });

  const container =
    document.getElementById("authorizedPeople") ||
    document.getElementById("authorizedList");

  if (container) {
    container.innerHTML = "";
  }
}

/* =========================================================
   AUTHORIZED PICKUP PEOPLE
   ========================================================= */

function addAuthorizedPerson() {
  const container =
    document.getElementById("authorizedPeople") ||
    document.getElementById("authorizedList");

  if (!container) {
    toast("Authorized pickup section was not found.");
    return;
  }

  const row = document.createElement("div");

  row.className = "authorized-person";

  row.innerHTML = `
    <div class="form-group">
      <label>Name</label>
      <input class="auth-name" type="text" placeholder="Full name">
    </div>

    <div class="form-group">
      <label>Relationship</label>
      <input class="auth-relationship" type="text" placeholder="Mother, Father, Aunt...">
    </div>

    <div class="form-group">
      <label>Phone</label>
      <input class="auth-phone" type="text" placeholder="Phone number">
    </div>

    <button type="button" class="secondary-btn remove-authorized">
      Remove
    </button>
  `;

  row.querySelector(".remove-authorized").addEventListener("click", () => {
    row.remove();
  });

  container.appendChild(row);
}

function collectAuthorizedPeople() {
  const rows = document.querySelectorAll(".authorized-person");

  return Array.from(rows)
    .map(row => ({
      name: row.querySelector(".auth-name")?.value.trim() || "",
      relationship:
        row.querySelector(".auth-relationship")?.value.trim() || "",
      phone: row.querySelector(".auth-phone")?.value.trim() || ""
    }))
    .filter(person => person.name);
}

/* =========================================================
   STUDENT MANAGEMENT
   ========================================================= */

async function renderStudents() {
  const container =
    document.getElementById("studentList") ||
    document.getElementById("studentsList") ||
    document.getElementById("studentManagement");

  if (!container) return;

  try {
    const students = await all(STORE_STUDENTS);

    if (!students.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No students yet</h3>
          <p>Add your first student using the Add Student form.</p>
        </div>
      `;
      return;
    }

    students.sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );

    container.innerHTML = students
      .map(student => `
        <div class="student-row">
          <div>
            <strong>${escapeHtml(student.name)}</strong>
            <div class="muted">
              ${escapeHtml(student.id)}
              ${student.grade ? " • " + escapeHtml(student.grade) : ""}
              ${student.section ? " • " + escapeHtml(student.section) : ""}
            </div>
          </div>

          <div class="button-row">
            <button
              type="button"
              class="secondary-btn"
              data-qr="${escapeHtml(student.id)}">
              QR
            </button>

            <button
              type="button"
              class="danger-btn"
              data-delete="${escapeHtml(student.id)}">
              Delete
            </button>
          </div>
        </div>
      `)
      .join("");

    container.querySelectorAll("[data-qr]").forEach(button => {
      button.addEventListener("click", async () => {
        const student = await get(
          STORE_STUDENTS,
          button.dataset.qr
        );

        if (student) {
          generateStudentQR(student);
        }
      });
    });

    container.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", () => {
        deleteStudent(button.dataset.delete);
      });
    });
  } catch (error) {
    console.error("Render students error:", error);
  }
}

/* =========================================================
   DELETE STUDENT
   ========================================================= */

async function deleteStudent(studentId) {
  const student = await get(STORE_STUDENTS, studentId);

  if (!student) {
    toast("Student not found.");
    return;
  }

  const confirmed = window.confirm(
    `Delete ${student.name} (${student.id})?\n\nThis removes the student from Student Management.`
  );

  if (!confirmed) return;

  try {
    await remove(STORE_STUDENTS, studentId);

    toast("Student deleted.");

    await renderStudents();
    await refresh();
  } catch (error) {
    console.error("Delete student error:", error);
    toast("Unable to delete student.");
  }
}

/* =========================================================
   QR GENERATION
   ========================================================= */

function generateStudentQR(student) {
  let modal = document.getElementById("qrModal");

  if (!modal) {
    modal = document.createElement("div");

    modal.id = "qrModal";

    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background = "rgba(0,0,0,.65)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "10000";
    modal.style.padding = "20px";

    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="
      background:white;
      border-radius:20px;
      padding:25px;
      max-width:420px;
      width:100%;
      text-align:center;
    ">
      <h2>Student QR Code</h2>

      <p>
        <strong>${escapeHtml(student.name)}</strong><br>
        ${escapeHtml(student.id)}
      </p>

      <div id="qrCanvasContainer"
           style="display:flex;justify-content:center;margin:20px 0;">
      </div>

      <p class="muted">
        This QR code contains only the Student ID.
      </p>

      <div class="button-row">
        <button type="button" id="printQR" class="primary-btn">
          Print
        </button>

        <button type="button" id="closeQR" class="secondary-btn">
          Close
        </button>
      </div>
    </div>
  `;

  const qrContainer = document.getElementById("qrCanvasContainer");

  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: student.id,
      width: 240,
      height: 240,
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    qrContainer.innerHTML = `
      <div class="message warning">
        QR library is not loaded.<br>
        You can still use the student's ID manually.
      </div>
    `;
  }

  document.getElementById("closeQR").onclick = () => {
    modal.remove();
  };

  document.getElementById("printQR").onclick = () => {
    window.print();
  };
}

/* =========================================================
   DASHBOARD
   ========================================================= */

async function refresh() {
  if (!db) return;

  try {
    const students = await all(STORE_STUDENTS);
    const attendance = await all(STORE_ATT);
    const date = today();

    const todays = attendance.filter(record => record.date === date);

    const totalStudents = document.getElementById("totalStudents");
    const timeInCount = document.getElementById("timeInCount");
    const inSchoolCount = document.getElementById("inSchoolCount");
    const pickedCount = document.getElementById("pickedCount");
    const notInCount = document.getElementById("notInCount");

    if (totalStudents) {
      totalStudents.textContent = students.length;
    }

    if (timeInCount) {
      timeInCount.textContent =
        todays.filter(record => record.timeIn).length;
    }

    if (inSchoolCount) {
      inSchoolCount.textContent =
        todays.filter(record => record.timeIn && !record.timeOut).length;
    }

    if (pickedCount) {
      pickedCount.textContent =
        todays.filter(record => record.timeOut).length;
    }

    if (notInCount) {
      notInCount.textContent =
        students.length -
        todays.filter(record => record.timeIn).length;
    }

    const activity = document.getElementById("activity");

    if (activity) {
      const recent = todays.slice(-10).reverse();

      activity.innerHTML =
        recent
          .map(record => `
            <div class="activity-row">
              <strong>${escapeHtml(record.studentName)}</strong>
              —
              ${record.timeOut ? "PICKED UP" : "IN SCHOOL"}

              <br>

              <span class="muted">
                ${escapeHtml(record.timeIn || "")}
                ${
                  record.timeOut
                    ? " → " + escapeHtml(record.timeOut)
                    : ""
                }

                ${
                  record.pickupPerson
                    ? " • " + escapeHtml(record.pickupPerson)
                    : ""
                }
              </span>
            </div>
          `)
          .join("") ||
        '<p class="muted">No activity yet.</p>';
    }
  } catch (error) {
    console.error("Dashboard refresh error:", error);
  }
}

/* =========================================================
   SCANNING
   ========================================================= */

function updateScannerMessage(message = "") {
  const element = document.getElementById("scanMessage");

  if (!element) return;

  element.innerHTML = message
    ? `<div class="message">${escapeHtml(message)}</div>`
    : "";
}

async function startScanner() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      updateScannerMessage(
        "Camera is not available. Use Manual Student ID."
      );
      return;
    }

    stopScanner();

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {
          ideal: "environment"
        }
      },
      audio: false
    });

    const video = document.getElementById("video");

    if (!video) {
      stopScanner();
      return;
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await video.play();

    scannerRunning = true;

    const hint = document.getElementById("cameraHint");

    if (hint) {
      hint.textContent = "Camera is running — point at a QR code";
    }

    updateScannerMessage("Camera started.");

    if ("BarcodeDetector" in window) {
      try {
        barcodeDetector = new BarcodeDetector({
          formats: ["qr_code"]
        });
      } catch (error) {
        barcodeDetector = null;
      }
    }

    scanLoop();
  } catch (error) {
    console.error("Camera error:", error);

    scannerRunning = false;

    updateScannerMessage(
      "Camera permission was denied or unavailable. Use Manual Student ID."
    );
  }
}

function stopScanner() {
  scannerRunning = false;

  if (stream) {
    stream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (error) {}
    });

    stream = null;
  }

  const video = document.getElementById("video");

  if (video) {
    video.srcObject = null;
  }

  const hint = document.getElementById("cameraHint");

  if (hint) {
    hint.textContent = "Camera is stopped";
  }
}

async function scanLoop() {
  if (!scannerRunning || !stream) return;

  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");

  if (!video || !canvas) return;

  if (video.readyState >= 2) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    if (context) {
      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (barcodeDetector) {
        try {
          const results =
            await barcodeDetector.detect(canvas);

          if (results.length > 0) {
            const value =
              results[0].rawValue?.trim();

            if (value) {
              scannerRunning = false;
              stopScanner();
              await handleScan(value);
              return;
            }
          }
        } catch (error) {
          console.warn("QR detection error:", error);
        }
      } else {
        updateScannerMessage(
          "This browser does not support built-in QR detection. Use Manual Student ID."
        );
      }
    }
  }

  if (scannerRunning) {
    requestAnimationFrame(scanLoop);
  }
}

/* =========================================================
   HANDLE SCAN
   ========================================================= */

async function handleScan(raw) {
  try {
    stopScanner();

    const id = String(raw || "").trim();

    if (!id) {
      toast("Please enter a Student ID.");
      return;
    }

    const student = await get(STORE_STUDENTS, id);

    if (!student) {
      updateScannerMessage(
        `Student ID not found: ${id}`
      );

      toast("Student ID not found.");
      return;
    }

    currentStudent = student;

    await renderStudent(student);

    show("student");
  } catch (error) {
    console.error("Handle scan error:", error);
    toast("Unable to open student.");
  }
}

/* =========================================================
   STUDENT PROFILE
   ========================================================= */

async function getAttendanceRecord(studentId) {
  return await get(
    STORE_ATT,
    keyFor(studentId)
  );
}

async function renderStudent(student) {
  const card = document.getElementById("studentCard");

  if (!card) return;

  const record =
    await getAttendanceRecord(student.id);

  const authorizedCount =
    Array.isArray(student.authorized)
      ? student.authorized.length
      : 0;

  let status = "NOT CHECKED IN";

  if (record?.timeIn && !record?.timeOut) {
    status = "IN SCHOOL";
  }

  if (record?.timeOut) {
    status = "PICKED UP";
  }

  card.innerHTML = `
    <div class="student-head">

      <img
        class="avatar"
        src="logo.png"
        alt="Vision School">

      <div>
        <h2>${escapeHtml(student.name)}</h2>

        <div>
          ${escapeHtml(student.id)}
          ${
            student.grade
              ? " • " + escapeHtml(student.grade)
              : ""
          }
          ${
            student.section
              ? " • " + escapeHtml(student.section)
              : ""
          }
        </div>
      </div>

    </div>

    <hr>

    <p>
      <strong>Parent / Guardian:</strong>
      ${escapeHtml(student.parent || "-")}
    </p>

    <p>
      <strong>Phone:</strong>
      ${escapeHtml(student.phone || "-")}
    </p>

    <p>
      <strong>Authorized Pickup:</strong>
      ${authorizedCount} person(s)
    </p>

    <p>
      <strong>Status:</strong>
      <span class="status">
        ${escapeHtml(status)}
      </span>
    </p>

    ${
      record?.timeIn
        ? `<p><strong>Time In:</strong> ${escapeHtml(record.timeIn)}</p>`
        : ""
    }

    ${
      record?.timeOut
        ? `<p><strong>Time Out:</strong> ${escapeHtml(record.timeOut)}</p>`
        : ""
    }

    <div class="button-row">

      <button
        type="button"
        class="primary-btn"
        id="studentTimeIn">
        TIME IN
      </button>

      <button
        type="button"
        class="secondary-btn"
        id="studentPickup">
        PICKUP / TIME OUT
      </button>

    </div>
  `;

  document.getElementById("studentTimeIn")?.addEventListener(
    "click",
    timeIn
  );

  document.getElementById("studentPickup")?.addEventListener(
    "click",
    openPickup
  );
}

/* =========================================================
   TIME IN
   ========================================================= */

async function timeIn() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  try {
    const key = keyFor(currentStudent.id);

    const old = await get(STORE_ATT, key);

    if (old?.timeIn) {
      toast(
        "Already checked in at " +
        old.timeIn
      );
      return;
    }

    const record = {
      key,
      date: today(),
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      grade: currentStudent.grade,
      section: currentStudent.section,
      timeIn: now(),
      timeOut: "",
      pickupPerson: "",
      pickupRelationship: "",
      pickupPhone: "",
      pickupOption: "",
      staff: "Staff",
      approver: "",
      notes: ""
    };

    await put(STORE_ATT, record);

    await queue(record, "TIME_IN");

    toast("TIME IN SUCCESSFUL");

    await renderStudent(currentStudent);
    await refresh();
  } catch (error) {
    console.error("Time in error:", error);
    toast("Unable to save Time In.");
  }
}

/* =========================================================
   PICKUP
   ========================================================= */

async function openPickup() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  const record =
    await getAttendanceRecord(
      currentStudent.id
    );

  if (!record?.timeIn) {
    toast(
      "WARNING: Student has no TIME IN today."
    );
    return;
  }

  if (record.timeOut) {
    toast(
      "Student already picked up at " +
      record.timeOut
    );
    return;
  }

  selectedPickup = null;

  const card =
    document.getElementById("pickupCard");

  if (!card) {
    toast("Pickup screen is unavailable.");
    return;
  }

  const authorized =
    Array.isArray(currentStudent.authorized)
      ? currentStudent.authorized
      : [];

  card.innerHTML = `
    <h2>Pickup / Time Out</h2>

    <div class="student-head">

      <img
        class="avatar"
        src="logo.png"
        alt="Vision School">

      <div>
        <strong>
          ${escapeHtml(currentStudent.name)}
        </strong>

        <br>

        ${escapeHtml(currentStudent.id)}
        ${
          currentStudent.grade
            ? " • " + escapeHtml(currentStudent.grade)
            : ""
        }
      </div>

    </div>

    <p class="muted">
      Select the authorized pickup person,
      or select an approval option.
    </p>

    <label>Authorized Pickup Person</label>

    <div class="option-grid" id="authorizedOptions">

      ${
        authorized.length
          ? authorized
              .map(
                (person, index) => `
                  <button
                    type="button"
                    class="option"
                    data-auth-index="${index}">

                    <strong>
                      ${escapeHtml(person.name)}
                    </strong>

                    <br>

                    ${escapeHtml(
                      person.relationship || ""
                    )}

                    ${
                      person.phone
                        ? " • " +
                          escapeHtml(person.phone)
                        : ""
                    }

                  </button>
                `
              )
              .join("")
          : `
            <p class="muted">
              No authorized pickup people registered.
            </p>
          `
      }

    </div>

    <label for="pickupOption">
      Option
    </label>

    <select id="pickupOption">

      <option value="">
        Select an option…
      </option>

      <option value="AUTHORIZED">
        Authorized pickup person
      </option>

      <option value="UNAUTHORIZED_APPROVAL">
        Unauthorized person — Request Admin Approval
      </option>

      <option value="EMERGENCY_APPROVAL">
        Emergency / Parent Phone Confirmation
      </option>

      <option value="OTHER_APPROVAL">
        Other — Admin Approval Required
      </option>

    </select>

    <div id="unauthorizedFields"></div>

    <div class="button-row">

      <button
        type="button"
        class="secondary-btn"
        id="cancelPickup">
        Cancel
      </button>

      <button
        type="button"
        class="primary-btn"
        id="confirmPickup">
        CONFIRM PICKUP
      </button>

    </div>
  `;

  show("pickup");

  document
    .querySelectorAll("[data-auth-index]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const index =
            Number(button.dataset.authIndex);

          const person =
            authorized[index];

          selectAuth(person);
        }
      );
    });

  document
    .getElementById("pickupOption")
    ?.addEventListener(
      "change",
      optionChanged
    );

  document
    .getElementById("cancelPickup")
    ?.addEventListener(
      "click",
      () => show("student")
    );

  document
    .getElementById("confirmPickup")
    ?.addEventListener(
      "click",
      confirmPickup
    );
}

/* =========================================================
   SELECT AUTHORIZED PERSON
   ========================================================= */

function selectAuth(person) {
  selectedPickup = {
    ...person,
    option: "AUTHORIZED"
  };

  const select =
    document.getElementById("pickupOption");

  if (select) {
    select.value = "AUTHORIZED";
  }

  const fields =
    document.getElementById("unauthorizedFields");

  if (fields) {
    fields.innerHTML = "";
  }

  toast(
    person.name +
    " selected"
  );
}

/* =========================================================
   PICKUP OPTION
   ========================================================= */

function optionChanged() {
  const select =
    document.getElementById("pickupOption");

  const fields =
    document.getElementById("unauthorizedFields");

  if (!select || !fields) return;

  const value = select.value;

  if (value === "AUTHORIZED") {
    fields.innerHTML = "";
    return;
  }

  if (!value) {
    fields.innerHTML = "";
    return;
  }

  selectedPickup = null;

  fields.innerHTML = `
    <div class="approval-box">

      <label>
        Pickup Person Full Name
      </label>

      <input
        id="upName"
        type="text"
        placeholder="Full name">

      <label>
        Relationship
      </label>

      <input
        id="upRel"
        type="text"
        placeholder="Aunt, Grandparent, etc.">

      <label>
        Contact Number
      </label>

      <input
        id="upPhone"
        type="text"
        placeholder="Phone number">

      <label>
        Reason / Notes
      </label>

      <textarea
        id="upReason"
        rows="3"
        placeholder="Explain why this person is picking up the student.">
      </textarea>

      <div class="message warning">

        <strong>
          ⚠ APPROVAL REQUIRED
        </strong>

        <br>

        Do not release the student until an
        authorized staff member approves this request.

      </div>

      <label>
        Approving Staff
      </label>

      <input
        id="approver"
        type="text"
        placeholder="Admin / authorized staff name">

    </div>
  `;
}

/* =========================================================
   CONFIRM PICKUP
   ========================================================= */

async function confirmPickup() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  try {
    const option =
      document.getElementById(
        "pickupOption"
      )?.value;

    if (!option) {
      toast(
        "Please select a pickup option."
      );
      return;
    }

    let pickup = selectedPickup;

    if (option === "AUTHORIZED") {
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
        )?.value.trim();

      const relationship =
        document.getElementById(
          "upRel"
        )?.value.trim();

      const phone =
        document.getElementById(
          "upPhone"
        )?.value.trim();

      const reason =
        document.getElementById(
          "upReason"
        )?.value.trim();

      const approver =
        document.getElementById(
          "approver"
        )?.value.trim();

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
        reason,
        approver,
        option
      };

      const confirmed =
        window.confirm(
          "Confirm ADMIN APPROVAL and release this student?"
        );

      if (!confirmed) return;
    }

    const key =
      keyFor(currentStudent.id);

    const record =
      await get(STORE_ATT, key);

    if (!record?.timeIn) {
      toast("No TIME IN record.");
      return;
    }

    if (record.timeOut) {
      toast("Student already picked up.");
      return;
    }

    record.timeOut = now();
    record.pickupPerson =
      pickup.name || "";
    record.pickupRelationship =
      pickup.relationship || "";
    record.pickupPhone =
      pickup.phone || "";
    record.pickupOption =
      option;
    record.approver =
      pickup.approver || "";
    record.notes =
      pickup.reason || "";

    await put(STORE_ATT, record);

    await queue(record, "PICKUP");

    toast("PICKUP SUCCESSFUL");

    currentStudent = null;
    selectedPickup = null;

    show("home");

    await refresh();
  } catch (error) {
    console.error(
      "Confirm pickup error:",
      error
    );

    toast(
      "Unable to save pickup."
    );
  }
}

/* =========================================================
   OFFLINE QUEUE
   ========================================================= */

async function queue(record, action) {
  try {
    await add(STORE_QUEUE, {
      record,
      action,
      createdAt:
        new Date().toISOString()
    });
  } catch (error) {
    console.error(
      "Queue error:",
      error
    );
  }
}

async function syncQueue() {
  if (!navigator.onLine) return;

  try {
    const url =
      localStorage.getItem(
        "VISION_SYNC_URL"
      );

    if (!url) return;

    const items =
      await all(STORE_QUEUE);

    if (!items.length) return;

    for (const item of items) {
      try {
        const response =
          await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify(item)
          });

        if (response.ok) {
          await remove(
            STORE_QUEUE,
            item.id
          );
        }
      } catch (error) {
        console.warn(
          "Sync stopped:",
          error
        );
        break;
      }
    }
  } catch (error) {
    console.error(
      "Sync queue error:",
      error
    );
  }
}

/* =========================================================
   REPORTS
   ========================================================= */

async function renderReport() {
  const table =
    document.getElementById(
      "reportTable"
    );

  if (!table) return;

  try {
    const rows =
      await all(STORE_ATT);

    rows.sort(
      (a, b) =>
        String(b.date).localeCompare(
          String(a.date)
        )
    );

    table.innerHTML = `
      <div class="table-wrap">

        <table>

          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Time In</th>
              <th>Time Out</th>
              <th>Pickup</th>
              <th>Option</th>
            </tr>
          </thead>

          <tbody>

            ${
              rows.length
                ? rows
                    .map(
                      record => `
                        <tr>

                          <td>
                            ${escapeHtml(record.date)}
                          </td>

                          <td>
                            ${escapeHtml(
                              record.studentName
                            )}
                            <br>
                            <small>
                              ${escapeHtml(
                                record.studentId
                              )}
                            </small>
                          </td>

                          <td>
                            ${escapeHtml(
                              record.timeIn || "-"
                            )}
                          </td>

                          <td>
                            ${escapeHtml(
                              record.timeOut || "-"
                            )}
                          </td>

                          <td>
                            ${escapeHtml(
                              record.pickupPerson || "-"
                            )}
                          </td>

                          <td>
                            ${escapeHtml(
                              record.pickupOption || "-"
                            )}
                          </td>

                        </tr>
                      `
                    )
                    .join("")
                : `
                  <tr>
                    <td colspan="6">
                      No attendance records yet.
                    </td>
                  </tr>
                `
            }

          </tbody>

        </table>

      </div>
    `;
  } catch (error) {
    console.error(
      "Report error:",
      error
    );
  }
}

/* =========================================================
   CSV EXPORT
   ========================================================= */

function csv(value) {
  return `"${String(
    value ?? ""
  ).replaceAll('"', '""')}"`;
}

async function exportCSV() {
  try {
    const rows =
      await all(STORE_ATT);

    const headers = [
      "Date",
      "Student ID",
      "Student Name",
      "Grade",
      "Section",
      "Time In",
      "Time Out",
      "Pickup Person",
      "Relationship",
      "Phone",
      "Pickup Option",
      "Staff",
      "Approver",
      "Notes"
    ];

    const map = {
      "Date": "date",
      "Student ID": "studentId",
      "Student Name": "studentName",
      "Grade": "grade",
      "Section": "section",
      "Time In": "timeIn",
      "Time Out": "timeOut",
      "Pickup Person": "pickupPerson",
      "Relationship": "pickupRelationship",
      "Phone": "pickupPhone",
      "Pickup Option": "pickupOption",
      "Staff": "staff",
      "Approver": "approver",
      "Notes": "notes"
    };

    const lines = [
      headers.map(csv).join(",")
    ];

    rows.forEach(record => {
      lines.push(
        headers
          .map(header =>
            csv(record[map[header]])
          )
          .join(",")
      );
    });

    const blob = new Blob(
      [lines.join("\n")],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      "vision_school_attendance.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    toast("Attendance CSV exported.");
  } catch (error) {
    console.error(
      "CSV export error:",
      error
    );

    toast(
      "Unable to export CSV."
    );
  }
}

/* =========================================================
   RESET LOCAL DATA
   ========================================================= */

async function clearDemo() {
  const confirmed =
    window.confirm(
      "Reset ALL local student and attendance data?\n\nThis cannot be undone."
    );

  if (!confirmed) return;

  try {
    stopScanner();

    indexedDB.deleteDatabase(DB);

    toast(
      "Local data reset. Reloading..."
    );

    setTimeout(() => {
      location.reload();
    }, 700);
  } catch (error) {
    console.error(
      "Reset error:",
      error
    );
  }
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupButtonEvents() {

  /* Navigation buttons */

  document
    .querySelectorAll("[data-screen]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          show(
            button.dataset.screen
          );
        }
      );

    });

  /* Scanner */

  document
    .getElementById("startCamera")
    ?.addEventListener(
      "click",
      startScanner
    );

  document
    .getElementById("stopCamera")
    ?.addEventListener(
      "click",
      stopScanner
    );

  document
    .getElementById("manualOpen")
    ?.addEventListener(
      "click",
      () => {
        const input =
          document.getElementById(
            "manualId"
          );

        handleScan(
          input?.value.trim() || ""
        );
      }
    );

  /* Add Student */

  document
    .getElementById("addStudentForm")
    ?.addEventListener(
      "submit",
      addStudent
    );

  document
    .getElementById("saveStudent")
    ?.addEventListener(
      "click",
      addStudent
    );

  document
    .getElementById("addAuthorized")
    ?.addEventListener(
      "click",
      addAuthorizedPerson
    );

  document
    .getElementById("clearStudentForm")
    ?.addEventListener(
      "click",
      clearStudentForm
    );

  /* Reports */

  document
    .getElementById("exportCSV")
    ?.addEventListener(
      "click",
      exportCSV
    );

  document
    .getElementById("clearDemo")
    ?.addEventListener(
      "click",
      clearDemo
    );
}

/* =========================================================
   COMPATIBILITY FUNCTIONS
   ========================================================= */

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
window.clearDemo = clearDemo;
window.addAuthorizedPerson =
  addAuthorizedPerson;
window.deleteStudent = deleteStudent;
window.renderStudents = renderStudents;
window.generateStudentQR =
  generateStudentQR;

/* =========================================================
   ONLINE / OFFLINE EVENTS
   ========================================================= */

window.addEventListener(
  "online",
  () => {
    online();
    syncQueue();
  }
);

window.addEventListener(
  "offline",
  online
);
/* =========================================================
   LIVE CLOCK
========================================================= */

function updateClock() {
  const clock = document.getElementById("currentTime");

  if (!clock) return;

  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  clock.textContent = `${hours}:${minutes}:${seconds}`;
}

/* Start clock immediately */
updateClock();

/* Update every second */
setInterval(updateClock, 1000);
/* =========================================================
   APPLICATION STARTUP
   ========================================================= */

async function startApplication() {
  try {
    await openDB();

    online();

    setupButtonEvents();

    await refresh();

    await renderStudents();

    await syncQueue();

    console.log(
      "Vision School application started successfully."
    );
  } catch (error) {
    console.error(
      "Application startup error:",
      error
    );

    const message =
      document.getElementById(
        "scanMessage"
      );

    if (message) {
      message.innerHTML = `
        <div class="message warning">
          Application startup error.
          Please refresh the page.
        </div>
      `;
    }
  }
}

/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    startApplication
  );
} else {
  startApplication();
}
