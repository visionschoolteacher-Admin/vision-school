/* =========================================================
   VISION SCHOOL
   STUDENT SECURITY & ATTENDANCE SYSTEM
   FINAL APP.JS
========================================================= */

"use strict";


/* =========================================================
   DATABASE
========================================================= */

const DB_NAME = "visionSchoolDB";
const DB_VERSION = 4;

const STORE_STUDENTS = "students";
const STORE_ATTENDANCE = "attendance";
const STORE_QUEUE = "queue";

let db = null;

let stream = null;
let scannerRunning = false;
let barcodeDetector = null;

let currentStudent = null;
let selectedPickup = null;


/* =========================================================
   HTML SECURITY
========================================================= */

function escapeHtml(value) {

  return String(value ?? "").replace(
    /[&<>"']/g,
    character => {

      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return replacements[character];

    }
  );

}


/* =========================================================
   DATABASE OPEN
========================================================= */

function openDB() {

  return new Promise((resolve, reject) => {

    const request =
      indexedDB.open(
        DB_NAME,
        DB_VERSION
      );


    request.onupgradeneeded = event => {

      const database =
        event.target.result;


      if (
        !database.objectStoreNames
          .contains(STORE_STUDENTS)
      ) {

        database.createObjectStore(
          STORE_STUDENTS,
          {
            keyPath: "id"
          }
        );

      }


      if (
        !database.objectStoreNames
          .contains(STORE_ATTENDANCE)
      ) {

        database.createObjectStore(
          STORE_ATTENDANCE,
          {
            keyPath: "key"
          }
        );

      }


      if (
        !database.objectStoreNames
          .contains(STORE_QUEUE)
      ) {

        database.createObjectStore(
          STORE_QUEUE,
          {
            keyPath: "id",
            autoIncrement: true
          }
        );

      }

    };


    request.onsuccess = () => {

      db = request.result;

      db.onversionchange = () => {
        db.close();
      };

      resolve(db);

    };


    request.onerror = () => {
      reject(request.error);
    };


    request.onblocked = () => {

      reject(
        new Error(
          "Database upgrade is blocked. Please close other Vision School tabs."
        )
      );

    };

  });

}


/* =========================================================
   DATABASE HELPERS
========================================================= */

function objectStore(name, mode = "readonly") {

  if (!db) {
    throw new Error(
      "Database is not initialized."
    );
  }

  return db
    .transaction(name, mode)
    .objectStore(name);

}


function get(store, key) {

  return new Promise((resolve, reject) => {

    try {

      const request =
        objectStore(store).get(key);

      request.onsuccess =
        () => resolve(request.result);

      request.onerror =
        () => reject(request.error);

    } catch (error) {

      reject(error);

    }

  });

}


function getAll(store) {

  return new Promise((resolve, reject) => {

    try {

      const request =
        objectStore(store).getAll();

      request.onsuccess =
        () => resolve(request.result || []);

      request.onerror =
        () => reject(request.error);

    } catch (error) {

      reject(error);

    }

  });

}


function put(store, value) {

  return new Promise((resolve, reject) => {

    try {

      const request =
        objectStore(
          store,
          "readwrite"
        ).put(value);

      request.onsuccess =
        () => resolve(request.result);

      request.onerror =
        () => reject(request.error);

    } catch (error) {

      reject(error);

    }

  });

}


function add(store, value) {

  return new Promise((resolve, reject) => {

    try {

      const request =
        objectStore(
          store,
          "readwrite"
        ).add(value);

      request.onsuccess =
        () => resolve(request.result);

      request.onerror =
        () => reject(request.error);

    } catch (error) {

      reject(error);

    }

  });

}


function remove(store, key) {

  return new Promise((resolve, reject) => {

    try {

      const request =
        objectStore(
          store,
          "readwrite"
        ).delete(key);

      request.onsuccess =
        () => resolve();

      request.onerror =
        () => reject(request.error);

    } catch (error) {

      reject(error);

    }

  });

}


/* =========================================================
   DATE / TIME
========================================================= */

function today() {

  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;

}


function currentTime() {

  return new Date()
    .toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }
    );

}


function attendanceKey(studentId) {

  return `${today()}_${studentId}`;

}


/* =========================================================
   TOAST
========================================================= */

function toast(message) {

  const element =
    document.getElementById("toast");

  if (!element) return;

  element.textContent =
    message;

  element.classList.add("show");

  clearTimeout(
    element._timer
  );

  element._timer =
    setTimeout(() => {

      element.classList.remove("show");

    }, 3000);

}


/* =========================================================
   ONLINE STATUS
========================================================= */

function updateOnlineStatus() {

  const badge =
    document.getElementById(
      "onlineBadge"
    );

  const text =
    document.getElementById(
      "connectionText"
    );

  const dot =
    document.getElementById(
      "statusDot"
    );


  if (
    navigator.onLine
  ) {

    if (badge)
      badge.textContent =
        "ONLINE";

    if (text)
      text.textContent =
        "Connected";

    if (dot)
      dot.className =
        "status-dot online";

  } else {

    if (badge)
      badge.textContent =
        "OFFLINE";

    if (text)
      text.textContent =
        "Offline mode";

    if (dot)
      dot.className =
        "status-dot offline";

  }

}


/* =========================================================
   LIVE CLOCK
========================================================= */

function updateClock() {

  const clock =
    document.getElementById(
      "clock"
    );

  const dateText =
    document.getElementById(
      "dateText"
    );


  const now =
    new Date();


  if (clock) {

    clock.textContent =
      now.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }
      );

  }


  if (dateText) {

    dateText.textContent =
      now.toLocaleDateString(
        [],
        {
          weekday: "long",
          year: "numeric",
          month: "short",
          day: "numeric"
        }
      );

  }

}


updateClock();

setInterval(
  updateClock,
  1000
);


/* =========================================================
   PAGE TITLES
========================================================= */

const pageTitles = {

  home: "Dashboard",

  scanner: "Scan QR Code",

  students: "Students",

  addStudent: "Add Student",

  student: "Student Details",

  pickup: "Pickup / Time Out",

  reports: "Attendance Reports",

  about: "About System"

};


/* =========================================================
   NAVIGATION
========================================================= */

function show(screenId) {

  document
    .querySelectorAll(".screen")
    .forEach(screen => {

      screen.classList.remove(
        "active"
      );

    });


  const screen =
    document.getElementById(
      screenId
    );


  if (!screen) {

    console.warn(
      "Screen not found:",
      screenId
    );

    return;

  }


  screen.classList.add(
    "active"
  );


  const title =
    document.getElementById(
      "pageTitle"
    );


  if (title) {

    title.textContent =
      pageTitles[screenId] ||
      "Vision School";

  }


  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.screen === screenId
      );

    });


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

    updateScannerMessage("");

  }


  const sidebar =
    document.getElementById(
      "sidebar"
    );

  if (sidebar) {

    sidebar.classList.remove(
      "open"
    );

  }

}


/* =========================================================
   NORMALIZE STUDENT
========================================================= */

function normalizeStudent(student) {

  return {

    id:
      String(
        student.id || ""
      ).trim(),

    name:
      String(
        student.name || ""
      ).trim(),

    level:
      String(
        student.level || ""
      ).trim(),

    section:
      String(
        student.section || ""
      ).trim(),

    parent:
      String(
        student.parent || ""
      ).trim(),

    phone:
      String(
        student.phone || ""
      ).trim(),

    authorized:
      Array.isArray(
        student.authorized
      )
        ? student.authorized
            .map(person => ({

              name:
                String(
                  person.name || ""
                ).trim(),

              relationship:
                String(
                  person.relationship || ""
                ).trim(),

              phone:
                String(
                  person.phone || ""
                ).trim()

            }))
            .filter(person =>
              person.name
            )

        : []

  };

}


/* =========================================================
   AUTHORIZED PEOPLE
========================================================= */

function addAuthorizedPerson() {

  const container =
    document.getElementById(
      "pickupPeople"
    );


  if (!container) {

    toast(
      "Pickup section unavailable."
    );

    return;

  }


  const row =
    document.createElement(
      "div"
    );


  row.className =
    "authorized-person";


  row.innerHTML = `

    <div class="form-group">

      <label>Name</label>

      <input
        class="auth-name"
        type="text"
        placeholder="Full name">

    </div>


    <div class="form-group">

      <label>Relationship</label>

      <input
        class="auth-relationship"
        type="text"
        placeholder="Mother, Father, Aunt...">

    </div>


    <div class="form-group">

      <label>Phone</label>

      <input
        class="auth-phone"
        type="text"
        placeholder="Phone number">

    </div>


    <button
      type="button"
      class="secondary-btn remove-authorized">

      Remove

    </button>

  `;


  row
    .querySelector(
      ".remove-authorized"
    )
    .addEventListener(
      "click",
      () => row.remove()
    );


  container.appendChild(
    row
  );

}


function collectAuthorizedPeople() {

  const rows =
    document.querySelectorAll(
      ".authorized-person"
    );


  return Array
    .from(rows)
    .map(row => ({

      name:
        row
          .querySelector(
            ".auth-name"
          )
          ?.value
          .trim() || "",

      relationship:
        row
          .querySelector(
            ".auth-relationship"
          )
          ?.value
          .trim() || "",

      phone:
        row
          .querySelector(
            ".auth-phone"
          )
          ?.value
          .trim() || ""

    }))
    .filter(
      person =>
        person.name
    );

}


/* =========================================================
   CLEAR STUDENT FORM
========================================================= */

function clearStudentForm() {

  const fields = [

    "studentId",

    "studentName",

    "studentLevel",

    "studentSection",

    "studentParent",

    "studentPhone",

    "editId"

  ];


  fields.forEach(id => {

    const element =
      document.getElementById(
        id
      );

    if (element) {

      element.value =
        "";

    }

  });


  const pickupPeople =
    document.getElementById(
      "pickupPeople"
    );


  if (pickupPeople) {

    pickupPeople.innerHTML =
      "";

  }


  const title =
    document.getElementById(
      "formTitle"
    );


  if (title) {

    title.textContent =
      "Add Student";

  }

}


/* =========================================================
   ADD / EDIT STUDENT
========================================================= */

async function addStudent(event) {

  if (event) {

    event.preventDefault();

  }


  try {

    const id =
      document
        .getElementById(
          "studentId"
        )
        ?.value
        .trim();


    const name =
      document
        .getElementById(
          "studentName"
        )
        ?.value
        .trim();


    const level =
      document
        .getElementById(
          "studentLevel"
        )
        ?.value
        .trim();


    const section =
      document
        .getElementById(
          "studentSection"
        )
        ?.value
        .trim();


    const parent =
      document
        .getElementById(
          "studentParent"
        )
        ?.value
        .trim();


    const phone =
      document
        .getElementById(
          "studentPhone"
        )
        ?.value
        .trim();


    const editId =
      document
        .getElementById(
          "editId"
        )
        ?.value
        .trim();


    if (!id) {

      toast(
        "Please enter the Student ID."
      );

      return;

    }


    if (!name) {

      toast(
        "Please enter the student's name."
      );

      return;

    }


    if (!level) {

      toast(
        "Please enter the student's level."
      );

      return;

    }


    if (!section) {

      toast(
        "Please enter the student's section."
      );

      return;

    }


    if (!parent) {

      toast(
        "Please enter the parent/guardian name."
      );

      return;

    }


    const existing =
      await get(
        STORE_STUDENTS,
        id
      );


    if (
      existing &&
      editId !== id
    ) {

      toast(
        "Student ID already exists."
      );

      return;

    }


    const student =
      normalizeStudent({

        id,

        name,

        level,

        section,

        parent,

        phone,

        authorized:
          collectAuthorizedPeople()

      });


    await put(
      STORE_STUDENTS,
      student
    );


    clearStudentForm();


    toast(
      editId
        ? "Student updated successfully."
        : "Student saved successfully."
    );


    await renderStudents();

    await refreshDashboard();


    generateStudentQR(
      student
    );


  } catch (error) {

    console.error(
      "Save student error:",
      error
    );

    toast(
      "Unable to save student."
    );

  }

}


/* =========================================================
   EDIT STUDENT
========================================================= */

async function editStudent(studentId) {

  const student =
    await get(
      STORE_STUDENTS,
      studentId
    );


  if (!student) {

    toast(
      "Student not found."
    );

    return;

  }


  document
    .getElementById(
      "editId"
    ).value =
      student.id;


  document
    .getElementById(
      "studentId"
    ).value =
      student.id;


  document
    .getElementById(
      "studentName"
    ).value =
      student.name;


  document
    .getElementById(
      "studentLevel"
    ).value =
      student.level || "";


  document
    .getElementById(
      "studentSection"
    ).value =
      student.section || "";


  document
    .getElementById(
      "studentParent"
    ).value =
      student.parent || "";


  document
    .getElementById(
      "studentPhone"
    ).value =
      student.phone || "";


  const title =
    document.getElementById(
      "formTitle"
    );


  if (title) {

    title.textContent =
      "Edit Student";

  }


  const container =
    document.getElementById(
      "pickupPeople"
    );


  if (container) {

    container.innerHTML =
      "";

    (
      student.authorized || []
    ).forEach(person => {

      addAuthorizedPerson();

      const rows =
        container.querySelectorAll(
          ".authorized-person"
        );

      const row =
        rows[rows.length - 1];


      row.querySelector(
        ".auth-name"
      ).value =
        person.name || "";


      row.querySelector(
        ".auth-relationship"
      ).value =
        person.relationship || "";


      row.querySelector(
        ".auth-phone"
      ).value =
        person.phone || "";

    });

  }


  show(
    "addStudent"
  );

}


/* =========================================================
   STUDENT LIST
========================================================= */

async function renderStudents() {

  const container =
    document.getElementById(
      "studentTable"
    );


  if (!container) return;


  try {

    let students =
      await getAll(
        STORE_STUDENTS
      );


    const search =
      document
        .getElementById(
          "studentSearch"
        )
        ?.value
        .trim()
        .toLowerCase() || "";


    if (search) {

      students =
        students.filter(
          student => {

            return (

              String(
                student.id
              )
                .toLowerCase()
                .includes(search)

              ||

              String(
                student.name
              )
                .toLowerCase()
                .includes(search)

              ||

              String(
                student.level
              )
                .toLowerCase()
                .includes(search)

              ||

              String(
                student.section
              )
                .toLowerCase()
                .includes(search)

              ||

              String(
                student.parent
              )
                .toLowerCase()
                .includes(search)

            );

          }
        );

    }


    students.sort(
      (a, b) =>
        String(a.name)
          .localeCompare(
            String(b.name)
          )
    );


    const count =
      document.getElementById(
        "studentCountLabel"
      );


    if (count) {

      count.textContent =
        `${students.length} student(s)`;

    }


    if (!students.length) {

      container.innerHTML = `

        <div class="empty-state">

          <h3>No students found</h3>

          <p>
            Add a student using
            the Add Student button.
          </p>

        </div>

      `;

      return;

    }


    container.innerHTML = `

      <table>

        <thead>

          <tr>

            <th>Student ID</th>

            <th>Name</th>

            <th>Level</th>

            <th>Section</th>

            <th>Parent / Guardian</th>

            <th>Actions</th>

          </tr>

        </thead>


        <tbody>

          ${students.map(student => `

            <tr>

              <td>
                <strong>
                  ${escapeHtml(student.id)}
                </strong>
              </td>


              <td>
                ${escapeHtml(student.name)}
              </td>


              <td>
                ${escapeHtml(
                  student.level || "-"
                )}
              </td>


              <td>
                ${escapeHtml(
                  student.section || "-"
                )}
              </td>


              <td>
                ${escapeHtml(
                  student.parent || "-"
                )}
              </td>


              <td>

                <div class="button-row">

                  <button
                    type="button"
                    class="secondary-btn"
                    data-view="${escapeHtml(student.id)}">

                    View

                  </button>


                  <button
                    type="button"
                    class="secondary-btn"
                    data-edit="${escapeHtml(student.id)}">

                    Edit

                  </button>


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

              </td>

            </tr>

          `).join("")}

        </tbody>

      </table>

    `;


    container
      .querySelectorAll(
        "[data-view]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            const student =
              await get(
                STORE_STUDENTS,
                button.dataset.view
              );


            if (student) {

              currentStudent =
                student;

              await renderStudent(
                student
              );

              show(
                "student"
              );

            }

          }
        );

      });


    container
      .querySelectorAll(
        "[data-edit]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            editStudent(
              button.dataset.edit
            );

          }
        );

      });


    container
      .querySelectorAll(
        "[data-qr]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            const student =
              await get(
                STORE_STUDENTS,
                button.dataset.qr
              );


            if (student) {

              generateStudentQR(
                student
              );

            }

          }
        );

      });


    container
      .querySelectorAll(
        "[data-delete]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            deleteStudent(
              button.dataset.delete
            );

          }
        );

      });


  } catch (error) {

    console.error(
      "Render students error:",
      error
    );

    toast(
      "Unable to load students."
    );

  }

}


/* =========================================================
   DELETE STUDENT
========================================================= */

async function deleteStudent(studentId) {

  const student =
    await get(
      STORE_STUDENTS,
      studentId
    );


  if (!student) {

    toast(
      "Student not found."
    );

    return;

  }


  const confirmed =
    window.confirm(
      `Delete ${student.name} (${student.id})?\n\nThis removes the student from Student Management.`
    );


  if (!confirmed) return;


  try {

    await remove(
      STORE_STUDENTS,
      studentId
    );


    toast(
      "Student deleted."
    );


    await renderStudents();

    await refreshDashboard();


  } catch (error) {

    console.error(
      "Delete student error:",
      error
    );

    toast(
      "Unable to delete student."
    );

  }

}


/* =========================================================
   QR GENERATION
========================================================= */

function generateStudentQR(student) {

  const modal =
    document.getElementById(
      "qrModal"
    );

  const content =
    document.getElementById(
      "qrContent"
    );


  if (!modal || !content) {

    toast(
      "QR window unavailable."
    );

    return;

  }


  content.innerHTML = `

    <div class="qr-content">

      <h2>
        Student QR Code
      </h2>

      <div class="qr-student">

        <strong>
          ${escapeHtml(student.name)}
        </strong>

        <span>
          ${escapeHtml(student.id)}
        </span>

        <span>
          ${escapeHtml(
            student.level || ""
          )}
          ${
            student.section
              ? " • " +
                escapeHtml(
                  student.section
                )
              : ""
          }
        </span>

      </div>


      <div
        id="qrCode"
        class="qr-code">
      </div>


      <p class="muted">
        This QR code contains only
        the Student ID.
      </p>


      <div class="button-row">

        <button
          class="primary-btn"
          id="printQR">
          Print QR
        </button>

        <button
          class="secondary-btn"
          id="closeQRButton">
          Close
        </button>

      </div>

    </div>

  `;


  modal.classList.add(
    "show"
  );


  const qrCode =
    document.getElementById(
      "qrCode"
    );


  if (
    window.QRCode &&
    qrCode
  ) {

    new QRCode(
      qrCode,
      {
        text: student.id,
        width: 240,
        height: 240,
        correctLevel:
          QRCode.CorrectLevel.M
      }
    );

  } else if (qrCode) {

    qrCode.innerHTML = `

      <div class="message warning">

        QR library is unavailable.

        <br><br>

        Student ID:
        <strong>
          ${escapeHtml(student.id)}
        </strong>

      </div>

    `;

  }


  document
    .getElementById(
      "closeQRButton"
    )
    ?.addEventListener(
      "click",
      closeQR
    );


  document
    .getElementById(
      "printQR"
    )
    ?.addEventListener(
      "click",
      printQR
    );

}


/* =========================================================
   CLOSE QR
========================================================= */

function closeQR() {

  const modal =
    document.getElementById(
      "qrModal"
    );


  if (modal) {

    modal.classList.remove(
      "show"
    );

  }

}


function printQR() {

  const content =
    document.getElementById(
      "qrContent"
    );


  if (!content) return;


  const printWindow =
    window.open(
      "",
      "_blank"
    );


  if (!printWindow) {

    toast(
      "Please allow pop-ups to print the QR code."
    );

    return;

  }


  printWindow.document.write(`

    <!DOCTYPE html>

    <html>

    <head>

      <title>
        Vision School Student QR
      </title>

      <style>

        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 40px;
        }

        img {
          display: block;
          margin: 20px auto;
        }

      </style>

    </head>

    <body>

      ${content.innerHTML}

    </body>

    </html>

  `);


  printWindow.document.close();


  setTimeout(
    () => {

      printWindow.focus();

      printWindow.print();

      printWindow.close();

    },
    500
  );

}


/* =========================================================
   DASHBOARD
========================================================= */

async function refreshDashboard() {

  if (!db) return;


  try {

    const students =
      await getAll(
        STORE_STUDENTS
      );


    const attendance =
      await getAll(
        STORE_ATTENDANCE
      );


    const date =
      today();


    const todays =
      attendance.filter(
        record =>
          record.date === date
      );


    const timeInRecords =
      todays.filter(
        record =>
          record.timeIn
      );


    const inSchool =
      todays.filter(
        record =>
          record.timeIn &&
          !record.timeOut
      );


    const pickedUp =
      todays.filter(
        record =>
          record.timeOut
      );


    const setText = (
      id,
      value
    ) => {

      const element =
        document.getElementById(
          id
        );

      if (element) {

        element.textContent =
          value;

      }

    };


    setText(
      "totalStudents",
      students.length
    );


    setText(
      "timeInCount",
      timeInRecords.length
    );


    setText(
      "inSchoolCount",
      inSchool.length
    );


    setText(
      "pickedCount",
      pickedUp.length
    );


    setText(
      "notInCount",
      Math.max(
        0,
        students.length -
        timeInRecords.length
      )
    );


    const activity =
      document.getElementById(
        "activity"
      );


    if (!activity) return;


    const recent =
      todays
        .slice()
        .sort(
          (a, b) =>
            String(
              b.timeIn || ""
            ).localeCompare(
              String(
                a.timeIn || ""
              )
            )
        )
        .slice(0, 10);


    if (!recent.length) {

      activity.innerHTML = `

        <div class="empty">
          No activity yet.
        </div>

      `;

      return;

    }


    activity.innerHTML =
      recent.map(record => `

        <div class="activity-row">

          <strong>
            ${escapeHtml(
              record.studentName
            )}
          </strong>

          <span>

            ${
              record.timeOut
                ? "PICKED UP"
                : "IN SCHOOL"
            }

          </span>

          <small>

            Time In:
            ${escapeHtml(
              record.timeIn || "-"
            )}

            ${
              record.timeOut
                ? `
                  • Time Out:
                  ${escapeHtml(
                    record.timeOut
                  )}
                `
                : ""
            }

            ${
              record.pickupPerson
                ? `
                  • Pickup:
                  ${escapeHtml(
                    record.pickupPerson
                  )}
                `
                : ""
            }

          </small>

        </div>

      `).join("");


  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );

  }

}


/* =========================================================
   SCANNER MESSAGE
========================================================= */

function updateScannerMessage(
  message = ""
) {

  const element =
    document.getElementById(
      "scanMessage"
    );


  if (!element) return;


  element.textContent =
    message;

}


/* =========================================================
   START CAMERA
========================================================= */

async function startScanner() {

  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      updateScannerMessage(
        "Camera is not available. Use Manual Student ID."
      );

      return;

    }


    stopScanner();


    stream =
      await navigator
        .mediaDevices
        .getUserMedia({

          video: {

            facingMode: {
              ideal: "environment"
            }

          },

          audio: false

        });


    const video =
      document.getElementById(
        "video"
      );


    if (!video) {

      stopScanner();

      return;

    }


    video.srcObject =
      stream;

    video.muted =
      true;

    video.playsInline =
      true;


    await video.play();


    scannerRunning =
      true;


    const hint =
      document.getElementById(
        "cameraHint"
      );


    if (hint) {

      hint.textContent =
        "Camera is running — point at a QR code";

    }


    updateScannerMessage(
      "Camera started."
    );


    if (
      "BarcodeDetector" in window
    ) {

      try {

        barcodeDetector =
          new BarcodeDetector({
            formats: [
              "qr_code"
            ]
          });

      } catch (error) {

        barcodeDetector =
          null;

      }

    } else {

      barcodeDetector =
        null;

    }


    scanLoop();


  } catch (error) {

    console.error(
      "Camera error:",
      error
    );


    scannerRunning =
      false;


    updateScannerMessage(
      "Camera permission was denied or unavailable. Use Manual Student ID."
    );

  }

}


/* =========================================================
   STOP CAMERA
========================================================= */

function stopScanner() {

  scannerRunning =
    false;


  if (stream) {

    stream
      .getTracks()
      .forEach(track => {

        try {
          track.stop();
        } catch (error) {}

      });


    stream =
      null;

  }


  const video =
    document.getElementById(
      "video"
    );


  if (video) {

    video.srcObject =
      null;

  }


  const hint =
    document.getElementById(
      "cameraHint"
    );


  if (hint) {

    hint.textContent =
      "Camera is stopped";

  }

}


/* =========================================================
   QR SCAN LOOP
========================================================= */

async function scanLoop() {

  if (
    !scannerRunning ||
    !stream
  ) {

    return;

  }


  const video =
    document.getElementById(
      "video"
    );


  const canvas =
    document.getElementById(
      "canvas"
    );


  if (
    !video ||
    !canvas
  ) {

    return;

  }


  if (
    video.readyState >= 2 &&
    barcodeDetector
  ) {

    try {

      const results =
        await barcodeDetector.detect(
          video
        );


      if (
        results &&
        results.length
      ) {

        const value =
          results[0]
            .rawValue
            ?.trim();


        if (value) {

          stopScanner();

          await handleScan(
            value
          );

          return;

        }

      }

    } catch (error) {

      console.warn(
        "QR detection error:",
        error
      );

    }

  }


  if (!barcodeDetector) {

    updateScannerMessage(
      "Automatic QR detection is unavailable in this browser. Use Manual Student ID."
    );

  }


  if (scannerRunning) {

    requestAnimationFrame(
      scanLoop
    );

  }

}


/* =========================================================
   HANDLE SCAN
========================================================= */

async function handleScan(
  raw
) {

  try {

    const id =
      String(
        raw || ""
      ).trim();


    if (!id) {

      toast(
        "Please enter a Student ID."
      );

      return;

    }


    const student =
      await get(
        STORE_STUDENTS,
        id
      );


    if (!student) {

      updateScannerMessage(
        `Student ID not found: ${id}`
      );

      toast(
        "Student ID not found."
      );

      return;

    }


    currentStudent =
      student;


    await renderStudent(
      student
    );


    show(
      "student"
    );


  } catch (error) {

    console.error(
      "Handle scan error:",
      error
    );

    toast(
      "Unable to open student."
    );

  }

}


/* =========================================================
   STUDENT PROFILE
========================================================= */

async function renderStudent(
  student
) {

  const card =
    document.getElementById(
      "studentCard"
    );


  if (!card) return;


  const record =
    await get(
      STORE_ATTENDANCE,
      attendanceKey(
        student.id
      )
    );


  let status =
    "NOT CHECKED IN";


  if (
    record?.timeIn &&
    !record?.timeOut
  ) {

    status =
      "IN SCHOOL";

  }


  if (
    record?.timeOut
  ) {

    status =
      "PICKED UP";

  }


  const authorized =
    Array.isArray(
      student.authorized
    )
      ? student.authorized
      : [];


  card.innerHTML = `

    <div class="student-profile">

      <div class="student-profile-head">

        <img
          src="logo.png"
          class="avatar"
          alt="Vision School">

        <div>

          <p class="eyebrow">
            STUDENT
          </p>

          <h2>
            ${escapeHtml(
              student.name
            )}
          </h2>

          <p>

            ${escapeHtml(
              student.id
            )}

            ${
              student.level
                ? " • " +
                  escapeHtml(
                    student.level
                  )
                : ""
            }

            ${
              student.section
                ? " • " +
                  escapeHtml(
                    student.section
                  )
                : ""
            }

          </p>

        </div>

      </div>


      <div class="profile-grid">

        <div>

          <span>Parent / Guardian</span>

          <strong>
            ${escapeHtml(
              student.parent || "-"
            )}
          </strong>

        </div>


        <div>

          <span>Parent Contact</span>

          <strong>
            ${escapeHtml(
              student.phone || "-"
            )}
          </strong>

        </div>


        <div>

          <span>Level</span>

          <strong>
            ${escapeHtml(
              student.level || "-"
            )}
          </strong>

        </div>


        <div>

          <span>Section</span>

          <strong>
            ${escapeHtml(
              student.section || "-"
            )}
          </strong>

        </div>


        <div>

          <span>Authorized Pickup People</span>

          <strong>
            ${authorized.length}
          </strong>

        </div>


        <div>

          <span>Today's Status</span>

          <strong>
            ${escapeHtml(
              status
            )}
          </strong>

        </div>

      </div>


      ${
        record?.timeIn
          ? `
            <div class="message">
              Time In:
              <strong>
                ${escapeHtml(
                  record.timeIn
                )}
              </strong>
            </div>
          `
          : ""
      }


      ${
        record?.timeOut
          ? `
            <div class="message">
              Time Out:
              <strong>
                ${escapeHtml(
                  record.timeOut
                )}
              </strong>

              <br>

              Pickup:
              <strong>
                ${escapeHtml(
                  record.pickupPerson || "-"
                )}
              </strong>
            </div>
          `
          : ""
      }


      <div class="button-row">

        ${
          !record?.timeIn
            ? `
              <button
                type="button"
                class="primary-btn"
                id="studentTimeIn">
                ✓ TIME IN
              </button>
            `
            : ""
        }


        ${
          record?.timeIn &&
          !record?.timeOut
            ? `
              <button
                type="button"
                class="primary-btn"
                id="studentPickup">
                PICKUP / TIME OUT
              </button>
            `
            : ""
        }


        <button
          type="button"
          class="secondary-btn"
          id="backToScanner">
          ← Scan Another
        </button>

      </div>

    </div>

  `;


  document
    .getElementById(
      "studentTimeIn"
    )
    ?.addEventListener(
      "click",
      timeIn
    );


  document
    .getElementById(
      "studentPickup"
    )
    ?.addEventListener(
      "click",
      openPickup
    );


  document
    .getElementById(
      "backToScanner"
    )
    ?.addEventListener(
      "click",
      () => {

        currentStudent =
          null;

        show(
          "scanner"
        );

      }
    );

}


/* =========================================================
   TIME IN
========================================================= */

async function timeIn() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;

  }


  try {

    const key =
      attendanceKey(
        currentStudent.id
      );


    const existing =
      await get(
        STORE_ATTENDANCE,
        key
      );


    if (
      existing?.timeIn
    ) {

      toast(
        `Already checked in at ${existing.timeIn}.`
      );

      return;

    }


    const record = {

      key,

      date:
        today(),

      studentId:
        currentStudent.id,

      studentName:
        currentStudent.name,

      level:
        currentStudent.level,

      section:
        currentStudent.section,

      timeIn:
        currentTime(),

      timeOut:
        "",

      pickupPerson:
        "",

      pickupRelationship:
        "",

      pickupPhone:
        "",

      pickupOption:
        "",

      staff:
        "Staff",

      approver:
        "",

      notes:
        ""

    };


    await put(
      STORE_ATTENDANCE,
      record
    );


    await addQueue(
      record,
      "TIME_IN"
    );


    toast(
      "TIME IN SUCCESSFUL"
    );


    await renderStudent(
      currentStudent
    );


    await refreshDashboard();


  } catch (error) {

    console.error(
      "Time In error:",
      error
    );

    toast(
      "Unable to save Time In."
    );

  }

}


/* =========================================================
   OPEN PICKUP
========================================================= */

async function openPickup() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;

  }


  const record =
    await get(
      STORE_ATTENDANCE,
      attendanceKey(
        currentStudent.id
      )
    );


  if (!record?.timeIn) {

    toast(
      "WARNING: Student has no TIME IN today."
    );

    return;

  }


  if (record.timeOut) {

    toast(
      `Student already picked up at ${record.timeOut}.`
    );

    return;

  }


  selectedPickup =
    null;


  const card =
    document.getElementById(
      "pickupCard"
    );


  if (!card) return;


  const authorized =
    Array.isArray(
      currentStudent.authorized
    )
      ? currentStudent.authorized
      : [];


  card.innerHTML = `

    <div>

      <div class="student-profile-head">

        <img
          src="logo.png"
          class="avatar"
          alt="Vision School">

        <div>

          <p class="eyebrow">
            SECURE RELEASE
          </p>

          <h2>
            ${escapeHtml(
              currentStudent.name
            )}
          </h2>

          <p>
            ${escapeHtml(
              currentStudent.id
            )}
          </p>

        </div>

      </div>


      <div class="pickup-section">

        <h3>
          Authorized Pickup Person
        </h3>

        <p class="muted">
          Select the person collecting the student.
        </p>


        <div
          class="option-grid"
          id="authorizedOptions">

          ${
            authorized.length
              ? authorized.map(
                  (person, index) => `

                    <button
                      type="button"
                      class="option"
                      data-auth-index="${index}">

                      <strong>
                        ${escapeHtml(
                          person.name
                        )}
                      </strong>

                      <small>
                        ${escapeHtml(
                          person.relationship || ""
                        )}

                        ${
                          person.phone
                            ? " • " +
                              escapeHtml(
                                person.phone
                              )
                            : ""
                        }
                      </small>

                    </button>

                  `
                ).join("")
              : `
                <div class="message">
                  No authorized pickup people registered.
                </div>
              `
          }

        </div>

      </div>


      <div class="form-group">

        <label for="pickupOption">
          Release Option
        </label>

        <select id="pickupOption">

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

      </div>


      <div
        id="unauthorizedFields">
      </div>


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

    </div>

  `;


  show(
    "pickup"
  );


  document
    .querySelectorAll(
      "[data-auth-index]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const index =
            Number(
              button.dataset.authIndex
            );


          selectAuth(
            authorized[index]
          );

        }
      );

    });


  document
    .getElementById(
      "pickupOption"
    )
    ?.addEventListener(
      "change",
      optionChanged
    );


  document
    .getElementById(
      "cancelPickup"
    )
    ?.addEventListener(
      "click",
      () => {

        show(
          "student"
        );

      }
    );


  document
    .getElementById(
      "confirmPickup"
    )
    ?.addEventListener(
      "click",
      confirmPickup
    );

}


/* =========================================================
   SELECT AUTHORIZED PERSON
========================================================= */

function selectAuth(person) {

  if (!person) return;


  selectedPickup = {

    name:
      person.name,

    relationship:
      person.relationship,

    phone:
      person.phone,

    option:
      "AUTHORIZED"

  };


  const option =
    document.getElementById(
      "pickupOption"
    );


  if (option) {

    option.value =
      "AUTHORIZED";

  }


  const fields =
    document.getElementById(
      "unauthorizedFields"
    );


  if (fields) {

    fields.innerHTML =
      "";

  }


  document
    .querySelectorAll(
      "[data-auth-index]"
    )
    .forEach(button => {

      button.classList.remove(
        "selected"
      );

    });


  toast(
    `${person.name} selected`
  );

}


/* =========================================================
   PICKUP OPTION CHANGE
========================================================= */

function optionChanged() {

  const select =
    document.getElementById(
      "pickupOption"
    );


  const fields =
    document.getElementById(
      "unauthorizedFields"
    );


  if (!select || !fields)
    return;


  const value =
    select.value;


  if (
    value === "AUTHORIZED" ||
    !value
  ) {

    fields.innerHTML =
      "";

    return;

  }


  selectedPickup =
    null;


  fields.innerHTML = `

    <div class="approval-box">

      <div class="message warning">

        <strong>
          ⚠ APPROVAL REQUIRED
        </strong>

        <br>

        Do not release the student
        until an authorized staff member
        approves this request.

      </div>


      <div class="form-group">

        <label>
          Pickup Person Full Name *
        </label>

        <input
          id="upName"
          type="text"
          placeholder="Full name">

      </div>


      <div class="form-group">

        <label>
          Relationship
        </label>

        <input
          id="upRel"
          type="text"
          placeholder="Aunt, Grandparent, etc.">

      </div>


      <div class="form-group">

        <label>
          Contact Number
        </label>

        <input
          id="upPhone"
          type="text"
          placeholder="Phone number">

      </div>


      <div class="form-group">

        <label>
          Reason / Notes
        </label>

        <textarea
          id="upReason"
          rows="3"
          placeholder="Explain why this person is picking up the student."></textarea>

      </div>


      <div class="form-group">

        <label>
          Approving Staff *
        </label>

        <input
          id="approver"
          type="text"
          placeholder="Admin / authorized staff name">

      </div>

    </div>

  `;

}


/* =========================================================
   CONFIRM PICKUP
========================================================= */

async function confirmPickup() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;

  }


  try {

    const option =
      document
        .getElementById(
          "pickupOption"
        )
        ?.value;


    if (!option) {

      toast(
        "Please select a pickup option."
      );

      return;

    }


    let pickup =
      selectedPickup;


    if (
      option === "AUTHORIZED"
    ) {

      if (!pickup) {

        toast(
          "Please select an authorized pickup person."
        );

        return;

      }

    } else {

      const name =
        document
          .getElementById(
            "upName"
          )
          ?.value
          .trim();


      const relationship =
        document
          .getElementById(
            "upRel"
          )
          ?.value
          .trim();


      const phone =
        document
          .getElementById(
            "upPhone"
          )
          ?.value
          .trim();


      const reason =
        document
          .getElementById(
            "upReason"
          )
          ?.value
          .trim();


      const approver =
        document
          .getElementById(
            "approver"
          )
          ?.value
          .trim();


      if (!name) {

        toast(
          "Please enter the pickup person's name."
        );

        return;

      }


      if (!approver) {

        toast(
          "Approving staff is required."
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


      if (!confirmed)
        return;

    }


    const key =
      attendanceKey(
        currentStudent.id
      );


    const record =
      await get(
        STORE_ATTENDANCE,
        key
      );


    if (!record?.timeIn) {

      toast(
        "No TIME IN record."
      );

      return;

    }


    if (record.timeOut) {

      toast(
        "Student already picked up."
      );

      return;

    }


    record.timeOut =
      currentTime();


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


    await put(
      STORE_ATTENDANCE,
      record
    );


    await addQueue(
      record,
      "PICKUP"
    );


    toast(
      "PICKUP SUCCESSFUL"
    );


    currentStudent =
      null;

    selectedPickup =
      null;


    show(
      "home"
    );


    await refreshDashboard();


  } catch (error) {

    console.error(
      "Pickup error:",
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

async function addQueue(
  record,
  action
) {

  try {

    await add(
      STORE_QUEUE,
      {

        record,

        action,

        createdAt:
          new Date()
            .toISOString()

      }
    );

  } catch (error) {

    console.error(
      "Queue error:",
      error
    );

  }

}


/* =========================================================
   SYNC QUEUE
========================================================= */

async function syncQueue() {

  if (!navigator.onLine)
    return;


  const url =
    localStorage.getItem(
      "VISION_SYNC_URL"
    );


  if (!url)
    return;


  try {

    const items =
      await getAll(
        STORE_QUEUE
      );


    for (
      const item of items
    ) {

      try {

        const response =
          await fetch(
            url,
            {

              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  item
                )

            }
          );


        if (
          response.ok
        ) {

          await remove(
            STORE_QUEUE,
            item.id
          );

        }

      } catch (error) {

        console.warn(
          "Queue sync stopped.",
          error
        );

        break;

      }

    }

  } catch (error) {

    console.error(
      "Sync error:",
      error
    );

  }

}


/* =========================================================
   REPORTS
========================================================= */

async function renderReport() {

  const container =
    document.getElementById(
      "reportTable"
    );


  if (!container)
    return;


  try {

    const rows =
      await getAll(
        STORE_ATTENDANCE
      );


    rows.sort(
      (a, b) =>
        `${b.date} ${b.timeIn}`
          .localeCompare(
            `${a.date} ${a.timeIn}`
          )
    );


    container.innerHTML = `

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

          </tr>

        </thead>


        <tbody>

          ${
            rows.length

              ? rows.map(
                  record => `

                    <tr>

                      <td>
                        ${escapeHtml(
                          record.date
                        )}
                      </td>


                      <td>

                        <strong>
                          ${escapeHtml(
                            record.studentName
                          )}
                        </strong>

                        <br>

                        <small>
                          ${escapeHtml(
                            record.studentId
                          )}
                        </small>

                      </td>


                      <td>
                        ${escapeHtml(
                          record.level || "-"
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

                  `
                ).join("")

              : `

                <tr>

                  <td
                    colspan="7"
                    style="text-align:center">

                    No attendance records yet.

                  </td>

                </tr>

              `
          }

        </tbody>

      </table>

    `;


  } catch (error) {

    console.error(
      "Report error:",
      error
    );

  }

}


/* =========================================================
   CSV
========================================================= */

function csv(value) {

  return `"${String(
    value ?? ""
  ).replaceAll(
    '"',
    '""'
  )}"`;

}


async function exportCSV() {

  try {

    const rows =
      await getAll(
        STORE_ATTENDANCE
      );


    const headers = [

      "Date",

      "Student ID",

      "Student Name",

      "Level",

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


    const keys = [

      "date",

      "studentId",

      "studentName",

      "level",

      "section",

      "timeIn",

      "timeOut",

      "pickupPerson",

      "pickupRelationship",

      "pickupPhone",

      "pickupOption",

      "staff",

      "approver",

      "notes"

    ];


    const lines = [

      headers
        .map(csv)
        .join(",")

    ];


    rows.forEach(
      record => {

        lines.push(

          keys
            .map(
              key =>
                csv(
                  record[key]
                )
            )
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
      document.createElement(
        "a"
      );


    link.href =
      url;


    link.download =
      "vision_school_attendance.csv";


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
      url
    );


    toast(
      "Attendance CSV exported."
    );


  } catch (error) {

    console.error(
      "CSV error:",
      error
    );

    toast(
      "Unable to export CSV."
    );

  }

}


/* =========================================================
   BUTTON EVENTS
========================================================= */

function setupButtonEvents() {

  /* Navigation */

  document
    .querySelectorAll(
      "[data-screen]"
    )
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
      () => {

        const input =
          document.getElementById(
            "manualId"
          );


        handleScan(
          input?.value || ""
        );

      }
    );


  /* Add Student */

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
      addAuthorizedPerson
    );


  document
    .getElementById(
      "clearForm"
    )
    ?.addEventListener(
      "click",
      clearStudentForm
    );


  /* Search */

  document
    .getElementById(
      "studentSearch"
    )
    ?.addEventListener(
      "input",
      renderStudents
    );


  /* CSV */

  document
    .getElementById(
      "exportCsv"
    )
    ?.addEventListener(
      "click",
      exportCSV
    );


  /* QR close */

  document
    .getElementById(
      "closeQr"
    )
    ?.addEventListener(
      "click",
      closeQR
    );


  /* Mobile menu */

  document
    .getElementById(
      "mobileMenu"
    )
    ?.addEventListener(
      "click",
      () => {

        const sidebar =
          document.getElementById(
            "sidebar"
          );


        if (sidebar) {

          sidebar.classList.toggle(
            "open"
          );

        }

      }
    );

}


/* =========================================================
   ONLINE / OFFLINE EVENTS
========================================================= */

window.addEventListener(
  "online",
  () => {

    updateOnlineStatus();

    syncQueue();

  }
);


window.addEventListener(
  "offline",
  updateOnlineStatus
);


/* =========================================================
   GLOBAL COMPATIBILITY
========================================================= */

window.show =
  show;

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

window.addAuthorizedPerson =
  addAuthorizedPerson;

window.deleteStudent =
  deleteStudent;

window.editStudent =
  editStudent;

window.renderStudents =
  renderStudents;

window.generateStudentQR =
  generateStudentQR;


/* =========================================================
   APPLICATION STARTUP
========================================================= */

async function startApplication() {

  try {

    await openDB();


    updateOnlineStatus();


    setupButtonEvents();


    await refreshDashboard();


    await renderStudents();


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

      message.textContent =
        "Application startup error. Please refresh the page.";

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
