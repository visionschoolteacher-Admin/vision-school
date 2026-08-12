/* =========================================================
   VISION SCHOOL - STUDENT & PICKUP MANAGEMENT SYSTEM
   Complete app.js
   ========================================================= */

const DB = "visionSchoolDB";
const STORE_STUDENTS = "students";
const STORE_ATT = "attendance";
const STORE_QUEUE = "queue";

let db = null;
let stream = null;
let currentStudent = null;
let selectedPickup = null;
let scanAnimation = null;

/* =========================================================
   DATABASE
   ========================================================= */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);

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
      resolve(db);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function getStore(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getItem(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = getStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = getStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putItem(storeName, object) {
  return new Promise((resolve, reject) => {
    const request = getStore(storeName, "readwrite").put(object);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteItem(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = getStore(storeName, "readwrite").delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* =========================================================
   DATE / TIME
   ========================================================= */

function today() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
   BASIC UI
   ========================================================= */

function show(screenId) {
  const screens = document.querySelectorAll(".screen");

  screens.forEach(function (screen) {
    screen.classList.remove("active");
  });

  const target = document.getElementById(screenId);

  if (target) {
    target.classList.add("active");
  }

  if (screenId === "home") {
    refreshDashboard();
  }

  if (screenId === "students") {
    renderStudents();
  }

  if (screenId === "reports") {
    renderReport();
  }

  if (screenId === "scanner") {
    clearScanMessage();
  }
}

function toast(message) {
  let element = document.getElementById("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.style.display = "block";

  setTimeout(function () {
    element.style.display = "none";
  }, 2600);
}

function onlineStatus() {
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

window.addEventListener("online", function () {
  onlineStatus();
  syncQueue();
});

window.addEventListener("offline", function () {
  onlineStatus();
});

/* =========================================================
   SECURITY / HTML
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
   DASHBOARD
   ========================================================= */

async function refreshDashboard() {
  try {
    const students = await getAll(STORE_STUDENTS);
    const attendance = await getAll(STORE_ATT);
    const date = today();

    const todayRecords = attendance.filter(function (record) {
      return record.date === date;
    });

    const total = students.length;

    const timeIn = todayRecords.filter(function (record) {
      return record.timeIn;
    }).length;

    const inSchool = todayRecords.filter(function (record) {
      return record.timeIn && !record.timeOut;
    }).length;

    const pickedUp = todayRecords.filter(function (record) {
      return record.timeOut;
    }).length;

    const notIn = Math.max(0, total - timeIn);

    setText("totalStudents", total);
    setText("timeInCount", timeIn);
    setText("inSchoolCount", inSchool);
    setText("pickedCount", pickedUp);
    setText("notInCount", notIn);

    const activity = document.getElementById("activity");

    if (activity) {
      const recent = todayRecords
        .slice()
        .reverse()
        .slice(0, 8);

      if (!recent.length) {
        activity.innerHTML =
          '<p class="muted">No activity yet.</p>';
      } else {
        activity.innerHTML = recent.map(function (record) {
          const status = record.timeOut
            ? "PICKED UP"
            : "IN SCHOOL";

          return `
            <div class="activity-row">
              <b>${escapeHtml(record.studentName)}</b>
              — ${status}
              <br>
              <span class="muted">
                ${escapeHtml(record.timeIn || "")}
                ${record.timeOut
                  ? " → " + escapeHtml(record.timeOut)
                  : ""}
                ${
                  record.pickupPerson
                    ? " • " + escapeHtml(record.pickupPerson)
                    : ""
                }
              </span>
            </div>
          `;
        }).join("");
      }
    }
  } catch (error) {
    console.error("Dashboard error:", error);
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

/* =========================================================
   STUDENT MANAGEMENT
   ========================================================= */

async function renderStudents() {
  const students = await getAll(STORE_STUDENTS);

  const container =
    document.getElementById("studentList") ||
    document.getElementById("studentsList");

  if (!container) {
    return;
  }

  if (!students.length) {
    container.innerHTML = `
      <div class="card">
        <p class="muted">No students have been added yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = students
    .sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    })
    .map(function (student) {
      return `
        <div class="student-row">
          <div>
            <strong>${escapeHtml(student.name)}</strong>
            <div class="muted">
              ${escapeHtml(student.id)}
              • ${escapeHtml(student.grade || "")}
              ${student.section
                ? " - " + escapeHtml(student.section)
                : ""}
            </div>
          </div>

          <div class="row">
            <button
              class="secondary"
              onclick="editStudent('${escapeHtml(student.id)}')">
              Edit
            </button>

            <button
              class="danger"
              onclick="removeStudent('${escapeHtml(student.id)}')">
              Delete
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   ADD STUDENT
   ========================================================= */

async function addStudent() {
  const id = getInputValue("studentId");
  const name = getInputValue("studentName");
  const grade = getInputValue("studentGrade");
  const section = getInputValue("studentSection");
  const parent = getInputValue("parentName");
  const phone = getInputValue("parentPhone");

  if (!id || !name) {
    toast("Student ID and Student Name are required.");
    return;
  }

  const existing = await getItem(STORE_STUDENTS, id);

  if (existing) {
    toast("A student with this ID already exists.");
    return;
  }

  const authorized = collectAuthorizedPeople();

  const student = {
    id: id,
    name: name,
    grade: grade,
    section: section,
    parent: parent,
    phone: phone,
    authorized: authorized
  };

  await putItem(STORE_STUDENTS, student);

  toast("Student added successfully.");

  clearStudentForm();

  await renderStudents();
  await refreshDashboard();
}

function getInputValue(id) {
  const element = document.getElementById(id);

  return element
    ? element.value.trim()
    : "";
}

/* =========================================================
   AUTHORIZED PICKUP PEOPLE
   ========================================================= */

function collectAuthorizedPeople() {
  const people = [];

  const rows = document.querySelectorAll(
    ".authorized-person"
  );

  rows.forEach(function (row) {
    const name =
      row.querySelector(".auth-name")?.value.trim() || "";

    const relationship =
      row.querySelector(".auth-relationship")?.value.trim() || "";

    const phone =
      row.querySelector(".auth-phone")?.value.trim() || "";

    if (name) {
      people.push({
        name: name,
        relationship: relationship,
        phone: phone
      });
    }
  });

  return people;
}

function addAuthorizedPerson() {
  const container =
    document.getElementById("authorizedPeople");

  if (!container) {
    toast("Authorized pickup area was not found.");
    return;
  }

  const row = document.createElement("div");

  row.className = "authorized-person";

  row.innerHTML = `
    <input
      class="auth-name"
      placeholder="Full name">

    <input
      class="auth-relationship"
      placeholder="Relationship">

    <input
      class="auth-phone"
      placeholder="Phone number">

    <button
      type="button"
      class="danger"
      onclick="this.parentElement.remove()">
      Remove
    </button>
  `;

  container.appendChild(row);
}

function clearAuthorizedPeople() {
  const container =
    document.getElementById("authorizedPeople");

  if (container) {
    container.innerHTML = "";
  }
}

/* =========================================================
   CLEAR STUDENT FORM
   ========================================================= */

function clearStudentForm() {
  const ids = [
    "studentId",
    "studentName",
    "studentGrade",
    "studentSection",
    "parentName",
    "parentPhone"
  ];

  ids.forEach(function (id) {
    const element = document.getElementById(id);

    if (element) {
      element.value = "";
    }
  });

  clearAuthorizedPeople();
}

/* =========================================================
   EDIT STUDENT
   ========================================================= */

async function editStudent(studentId) {
  const student = await getItem(
    STORE_STUDENTS,
    studentId
  );

  if (!student) {
    toast("Student not found.");
    return;
  }

  const newName = prompt(
    "Student Name:",
    student.name
  );

  if (newName === null) return;

  const newGrade = prompt(
    "Grade:",
    student.grade || ""
  );

  if (newGrade === null) return;

  const newSection = prompt(
    "Section:",
    student.section || ""
  );

  if (newSection === null) return;

  const newParent = prompt(
    "Parent / Guardian:",
    student.parent || ""
  );

  if (newParent === null) return;

  const newPhone = prompt(
    "Parent Phone:",
    student.phone || ""
  );

  if (newPhone === null) return;

  student.name = newName.trim();
  student.grade = newGrade.trim();
  student.section = newSection.trim();
  student.parent = newParent.trim();
  student.phone = newPhone.trim();

  await putItem(STORE_STUDENTS, student);

  toast("Student updated successfully.");

  renderStudents();
  refreshDashboard();
}

/* =========================================================
   DELETE STUDENT
   ========================================================= */

async function removeStudent(studentId) {
  const student = await getItem(
    STORE_STUDENTS,
    studentId
  );

  if (!student) {
    toast("Student not found.");
    return;
  }

  const confirmed = confirm(
    `Delete ${student.name} (${student.id})?`
  );

  if (!confirmed) return;

  await deleteItem(
    STORE_STUDENTS,
    studentId
  );

  toast("Student deleted.");

  renderStudents();
  refreshDashboard();
}

/* =========================================================
   STUDENT DETAILS
   ========================================================= */

async function handleScan(rawValue) {
  stopScanner();

  const id = String(rawValue || "").trim();

  if (!id) {
    return;
  }

  const student = await getItem(
    STORE_STUDENTS,
    id
  );

  if (!student) {
    const message =
      document.getElementById("scanMessage");

    if (message) {
      message.innerHTML = `
        <div class="card warning">
          Student ID not found:
          <b>${escapeHtml(id)}</b>
        </div>
      `;
    }

    return;
  }

  currentStudent = student;

  await renderStudent(student);

  show("student");
}

async function renderStudent(student) {
  const card =
    document.getElementById("studentCard");

  if (!card) return;

  const record = await getItem(
    STORE_ATT,
    keyFor(student.id)
  );

  const status = !record?.timeIn
    ? "NOT CHECKED IN"
    : record.timeOut
      ? "PICKED UP"
      : "IN SCHOOL";

  card.innerHTML = `
    <div class="student-head">

      <img
        class="avatar"
        src="logo.png"
        alt="Vision School">

      <div>
        <h2>${escapeHtml(student.name)}</h2>

        <div class="muted">
          ${escapeHtml(student.id)}
          • ${escapeHtml(student.grade || "")}
          ${student.section
            ? " - " + escapeHtml(student.section)
            : ""}
        </div>
      </div>

    </div>

    <hr>

    <p>
      <b>Parent / Guardian:</b>
      ${escapeHtml(student.parent || "-")}
    </p>

    <p>
      <b>Authorized Pickup:</b>
      ${student.authorized?.length || 0} person(s)
    </p>

    <p>
      <b>Status:</b>
      <span class="status">
        ${status}
      </span>
    </p>

    ${
      record?.timeIn
        ? `<p><b>Time In:</b> ${escapeHtml(record.timeIn)}</p>`
        : ""
    }

    ${
      record?.timeOut
        ? `<p><b>Time Out:</b> ${escapeHtml(record.timeOut)}</p>`
        : ""
    }

    <div class="row">

      <button
        class="primary"
        onclick="timeIn()">
        TIME IN
      </button>

      <button
        class="secondary"
        onclick="openPickup()">
        PICKUP / TIME OUT
      </button>

    </div>
  `;
}

/* =========================================================
   TIME IN
   ========================================================= */

async function timeIn() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  const key = keyFor(currentStudent.id);

  const existing = await getItem(
    STORE_ATT,
    key
  );

  if (existing?.timeIn) {
    toast(
      "Already checked in at " +
      existing.timeIn
    );
    return;
  }

  const record = {
    key: key,
    date: today(),
    studentId: currentStudent.id,
    studentName: currentStudent.name,
    grade: currentStudent.grade || "",
    section: currentStudent.section || "",
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

  await putItem(
    STORE_ATT,
    record
  );

  await queueRecord(
    record,
    "TIME_IN"
  );

  toast("TIME IN SUCCESSFUL");

  await renderStudent(currentStudent);
  await refreshDashboard();
}

/* =========================================================
   PICKUP
   ========================================================= */

async function openPickup() {
  if (!currentStudent) {
    toast("No student selected.");
    return;
  }

  const record = await getItem(
    STORE_ATT,
    keyFor(currentStudent.id)
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

  if (!card) return;

  const authorized =
    currentStudent.authorized || [];

  card.innerHTML = `
    <h2>Pickup / Time Out</h2>

    <div class="student-head">

      <img
        class="avatar"
        src="logo.png"
        alt="Vision School">

      <div>
        <b>${escapeHtml(currentStudent.name)}</b>
        <br>
        <span class="muted">
          ${escapeHtml(currentStudent.id)}
          • ${escapeHtml(currentStudent.grade || "")}
          ${currentStudent.section
            ? " - " + escapeHtml(currentStudent.section)
            : ""}
        </span>
      </div>

    </div>

    <p class="muted">
      Select the authorized pickup person.
      For an unauthorized person, approval is required
      before releasing the student.
    </p>

    <label>
      Authorized Pickup Person
    </label>

    <div class="option-grid">

      ${
        authorized.length
          ? authorized.map(function (person, index) {
              return `
                <div
                  class="option"
                  onclick="selectAuthorized(${index})">

                  <b>
                    ${escapeHtml(person.name)}
                  </b>

                  <br>

                  <span>
                    ${escapeHtml(
                      person.relationship || ""
                    )}
                    ${
                      person.phone
                        ? " • " +
                          escapeHtml(person.phone)
                        : ""
                    }
                  </span>

                </div>
              `;
            }).join("")
          : `<p class="muted">
               No authorized pickup people added.
             </p>`
      }

    </div>

    <label>
      Pickup Option
    </label>

    <select
      id="pickupOption"
      onchange="optionChanged()">

      <option value="">
        Select an option...
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

    <div
      class="row"
      style="margin-top:14px">

      <button
        class="secondary"
        onclick="show('student')">
        Cancel
      </button>

      <button
        class="primary"
        onclick="confirmPickup()">
        CONFIRM PICKUP
      </button>

    </div>
  `;

  show("pickup");
}

function selectAuthorized(index) {
  if (!currentStudent) return;

  const people =
    currentStudent.authorized || [];

  const person = people[index];

  if (!person) return;

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
    document.getElementById(
      "unauthorizedFields"
    );

  if (fields) {
    fields.innerHTML = "";
  }

  toast(
    person.name + " selected"
  );
}

/* Backwards-compatible function name */
function selectAuth(person) {
  if (!person) return;

  selectedPickup = {
    ...person,
    option: "AUTHORIZED"
  };

  const select =
    document.getElementById("pickupOption");

  if (select) {
    select.value = "AUTHORIZED";
  }

  toast(
    person.name + " selected"
  );
}

/* =========================================================
   PICKUP OPTION
   ========================================================= */

function optionChanged() {
  const select =
    document.getElementById("pickupOption");

  const container =
    document.getElementById(
      "unauthorizedFields"
    );

  if (!select || !container) return;

  const value = select.value;

  if (value === "AUTHORIZED") {
    container.innerHTML = "";
    return;
  }

  if (!value) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="card warning">

      <b>⚠ APPROVAL REQUIRED</b>

      <p>
        Do not release the student until
        an authorized staff member approves
        this request.
      </p>

    </div>

    <label>
      Pickup Person Full Name
    </label>

    <input
      id="upName"
      placeholder="Full name">

    <label>
      Relationship
    </label>

    <input
      id="upRel"
      placeholder="e.g. Aunt, Grandparent">

    <label>
      Contact Number
    </label>

    <input
      id="upPhone"
      placeholder="Phone number">

    <label>
      Reason / Notes
    </label>

    <textarea
      id="upReason"
      rows="3"
      placeholder="Explain why this person is picking up the student.">
    </textarea>

    <label>
      Approving Staff
      <b>(required)</b>
    </label>

    <input
      id="approver"
      placeholder="Admin / authorized staff name">
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

  const optionElement =
    document.getElementById("pickupOption");

  const option =
    optionElement?.value || "";

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
      document.getElementById("upName")
        ?.value.trim() || "";

    const relationship =
      document.getElementById("upRel")
        ?.value.trim() || "";

    const phone =
      document.getElementById("upPhone")
        ?.value.trim() || "";

    const reason =
      document.getElementById("upReason")
        ?.value.trim() || "";

    const approver =
      document.getElementById("approver")
        ?.value.trim() || "";

    if (!name) {
      toast(
        "Pickup person's name is required."
      );
      return;
    }

    if (!approver) {
      toast(
        "Approving staff name is required."
      );
      return;
    }

    pickup = {
      name: name,
      relationship: relationship,
      phone: phone,
      reason: reason,
      approver: approver,
      option: option
    };

    const approved = confirm(
      "Confirm ADMIN APPROVAL and release of this student?"
    );

    if (!approved) {
      return;
    }
  }

  const key =
    keyFor(currentStudent.id);

  const record =
    await getItem(
      STORE_ATT,
      key
    );

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
  record.staff =
    "Staff";
  record.approver =
    pickup.approver || "";
  record.notes =
    pickup.reason || "";

  await putItem(
    STORE_ATT,
    record
  );

  await queueRecord(
    record,
    "PICKUP"
  );

  toast("PICKUP SUCCESSFUL");

  currentStudent = null;
  selectedPickup = null;

  show("home");
  refreshDashboard();
}

/* =========================================================
   QR SCANNER
   ========================================================= */

async function startScanner() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    toast(
      "Camera is not available in this browser."
    );
    return;
  }

  try {
    stopScanner();

    stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          }
        },
        audio: false
      });

    const video =
      document.getElementById("video");

    if (!video) {
      toast("Scanner video area not found.");
      stopScanner();
      return;
    }

    video.srcObject = stream;

    await video.play();

    clearScanMessage();

    scanLoop();

  } catch (error) {
    console.error(
      "Camera error:",
      error
    );

    toast(
      "Camera permission was denied or unavailable. Use Manual Student ID."
    );
  }
}

function stopScanner() {
  if (scanAnimation) {
    cancelAnimationFrame(
      scanAnimation
    );

    scanAnimation = null;
  }

  if (stream) {
    stream
      .getTracks()
      .forEach(function (track) {
        track.stop();
      });

    stream = null;
  }

  const video =
    document.getElementById("video");

  if (video) {
    video.srcObject = null;
  }
}

function clearScanMessage() {
  const element =
    document.getElementById(
      "scanMessage"
    );

  if (element) {
    element.innerHTML = "";
  }
}

async function scanLoop() {
  if (!stream) return;

  const video =
    document.getElementById("video");

  const canvas =
    document.getElementById("canvas");

  if (!video || !canvas) {
    return;
  }

  if (video.readyState >= 2) {
    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    if (
      canvas.width > 0 &&
      canvas.height > 0
    ) {
      const context =
        canvas.getContext("2d");

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (
        "BarcodeDetector" in window
      ) {
        try {
          const detector =
            new BarcodeDetector({
              formats: ["qr_code"]
            });

          const results =
            await detector.detect(
              canvas
            );

          if (results.length) {
            await handleScan(
              results[0].rawValue
            );

            return;
          }
        } catch (error) {
          console.error(
            "QR detection error:",
            error
          );
        }
      } else {
        const message =
          document.getElementById(
            "scanMessage"
          );

        if (message) {
          message.innerHTML = `
            <div class="card warning">
              This browser does not support
              automatic QR detection.
              Please use Manual Student ID.
            </div>
          `;
        }
      }
    }
  }

  scanAnimation =
    requestAnimationFrame(
      scanLoop
    );
}

/* =========================================================
   QUEUE / SYNC
   ========================================================= */

async function queueRecord(
  record,
  action
) {
  return new Promise(
    function (resolve, reject) {
      const store =
        getStore(
          STORE_QUEUE,
          "readwrite"
        );

      const request =
        store.add({
          record: record,
          action: action,
          createdAt:
            new Date().toISOString()
        });

      request.onsuccess =
        () => resolve();

      request.onerror =
        () => reject(
          request.error
        );
    }
  );
}

async function syncQueue() {
  if (!navigator.onLine) {
    return;
  }

  const queue =
    await getAll(STORE_QUEUE);

  if (!queue.length) {
    return;
  }

  const url =
    localStorage.getItem(
      "VISION_SYNC_URL"
    );

  if (!url) {
    return;
  }

  for (const item of queue) {
    try {
      const response =
        await fetch(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify(item)
          }
        );

      if (!response.ok) {
        break;
      }

      await deleteItem(
        STORE_QUEUE,
        item.id
      );

    } catch (error) {
      console.error(
        "Sync failed:",
        error
      );

      break;
    }
  }
}

/* =========================================================
   REPORTS
   ========================================================= */

async function renderReport() {
  const rows =
    await getAll(STORE_ATT);

  const container =
    document.getElementById(
      "reportTable"
    );

  if (!container) {
    return;
  }

  const sorted =
    rows
      .slice()
      .sort(function (a, b) {
        return String(b.date)
          .localeCompare(
            String(a.date)
          );
      });

  if (!sorted.length) {
    container.innerHTML = `
      <div class="card">
        <p class="muted">
          No attendance records yet.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
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

          ${sorted.map(function (record) {
            return `
              <tr>

                <td>
                  ${escapeHtml(record.date)}
                </td>

                <td>
                  ${escapeHtml(
                    record.studentName
                  )}
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
            `;
          }).join("")}

        </tbody>

      </table>

    </div>
  `;
}

/* =========================================================
   CSV EXPORT
   ========================================================= */

function csv(value) {
  return '"' +
    String(value ?? "")
      .replace(/"/g, '""') +
    '"';
}

async function exportCSV() {
  const rows =
    await getAll(STORE_ATT);

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

  const lines = [];

  lines.push(
    headers.map(csv).join(",")
  );

  rows.forEach(function (record) {
    const line =
      headers.map(function (header) {
        return csv(
          record[map[header]] ?? ""
        );
      });

    lines.push(
      line.join(",")
    );
  });

  const blob =
    new Blob(
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
}

/* =========================================================
   RESET LOCAL DATABASE
   ========================================================= */

async function clearDemo() {
  const confirmed =
    confirm(
      "This will delete all students and attendance records stored on this device. Continue?"
    );

  if (!confirmed) {
    return;
  }

  stopScanner();

  const request =
    indexedDB.deleteDatabase(DB);

  request.onsuccess =
    function () {
      location.reload();
    };

  request.onerror =
    function () {
      toast(
        "Unable to reset the database."
      );
    };
}

/* =========================================================
   SERVICE WORKER
   ========================================================= */

if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    function () {
      navigator.serviceWorker
        .register("./sw.js")
        .then(function () {
          console.log(
            "Vision School service worker registered."
          );
        })
        .catch(function (error) {
          console.warn(
            "Service worker registration failed:",
            error
          );
        });
    }
  );
}

/* =========================================================
   START APPLICATION
   ========================================================= */

(async function initApp() {
  try {
    await openDB();

    onlineStatus();

    await refreshDashboard();

    await syncQueue();

    console.log(
      "Vision School application loaded successfully."
    );

  } catch (error) {
    console.error(
      "Application startup error:",
      error
    );

    toast(
      "Application startup error. Please refresh the page."
    );
  }
})();
