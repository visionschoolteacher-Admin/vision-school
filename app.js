// ============================================================
// VISION SCHOOL
// STUDENT MANAGEMENT + QR ATTENDANCE + PICKUP SYSTEM
// ============================================================

const DB = "visionSchoolDB";
const STORE_STUDENTS = "students";
const STORE_ATT = "attendance";
const STORE_QUEUE = "queue";

let db = null;
let stream = null;
let currentStudent = null;
let selectedPickup = null;


// ============================================================
// NO SAMPLE STUDENTS
// ============================================================

const demoStudents = [];


// ============================================================
// DATABASE
// ============================================================

function openDB() {
  return new Promise((resolve, reject) => {

    const request = indexedDB.open(DB, 1);

    request.onupgradeneeded = function (event) {

      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_STUDENTS)) {
        database.createObjectStore(
          STORE_STUDENTS,
          { keyPath: "id" }
        );
      }

      if (!database.objectStoreNames.contains(STORE_ATT)) {
        database.createObjectStore(
          STORE_ATT,
          { keyPath: "key" }
        );
      }

      if (!database.objectStoreNames.contains(STORE_QUEUE)) {
        database.createObjectStore(
          STORE_QUEUE,
          {
            keyPath: "id",
            autoIncrement: true
          }
        );
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


function tx(store, mode = "readonly") {

  return db
    .transaction(store, mode)
    .objectStore(store);

}


function put(store, object) {

  return new Promise((resolve, reject) => {

    const request =
      tx(store, "readwrite").put(object);

    request.onsuccess = () =>
      resolve();

    request.onerror = () =>
      reject(request.error);

  });

}


function get(store, key) {

  return new Promise((resolve, reject) => {

    const request =
      tx(store).get(key);

    request.onsuccess = () =>
      resolve(request.result);

    request.onerror = () =>
      reject(request.error);

  });

}


function all(store) {

  return new Promise((resolve, reject) => {

    const request =
      tx(store).getAll();

    request.onsuccess = () =>
      resolve(request.result || []);

    request.onerror = () =>
      reject(request.error);

  });

}


function deleteStudentFromDB(id) {

  return new Promise((resolve, reject) => {

    const request =
      tx(STORE_STUDENTS, "readwrite")
        .delete(id);

    request.onsuccess = () =>
      resolve();

    request.onerror = () =>
      reject(request.error);

  });

}


// ============================================================
// DATE / TIME
// ============================================================

function today() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}


function now() {

  return new Date().toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


function keyFor(id) {

  return `${today()}_${id}`;

}


// ============================================================
// INITIALIZE APPLICATION
// ============================================================

async function initializeApp() {

  try {

    await openDB();

    online();

    await refresh();

    await renderStudents();

    await syncQueue();

  } catch (error) {

    console.error(
      "Application initialization error:",
      error
    );

  }

}


// ============================================================
// SCREEN NAVIGATION
// ============================================================

function show(id) {

  document
    .querySelectorAll(".screen")
    .forEach(screen => {

      screen.classList.remove("active");

    });


  const target =
    document.getElementById(id);


  if (!target) {

    console.error(
      "Screen not found:",
      id
    );

    return;

  }


  target.classList.add("active");


  if (id === "home") {

    refresh();

  }


  if (id === "reports") {

    renderReport();

  }


  if (id === "students") {

    renderStudents();

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================================================
// TOAST MESSAGE
// ============================================================

function toast(message) {

  const element =
    document.getElementById("toast");


  if (!element) return;


  element.textContent = message;

  element.style.display = "block";


  setTimeout(() => {

    element.style.display = "none";

  }, 2600);

}


// ============================================================
// ONLINE / OFFLINE
// ============================================================

function online() {

  const badge =
    document.getElementById("onlineBadge");


  if (!badge) return;


  if (navigator.onLine) {

    badge.textContent = "ONLINE";

    badge.className =
      "badge online";

  } else {

    badge.textContent = "OFFLINE";

    badge.className =
      "badge offline";

  }

}


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


// ============================================================
// DASHBOARD
// ============================================================

async function refresh() {

  if (!db) return;


  try {

    const students =
      await all(STORE_STUDENTS);


    const attendance =
      await all(STORE_ATT);


    const date =
      today();


    const todays =
      attendance.filter(
        record => record.date === date
      );


    const totalStudents =
      document.getElementById(
        "totalStudents"
      );


    const timeInCount =
      document.getElementById(
        "timeInCount"
      );


    const inSchoolCount =
      document.getElementById(
        "inSchoolCount"
      );


    const pickedCount =
      document.getElementById(
        "pickedCount"
      );


    const notInCount =
      document.getElementById(
        "notInCount"
      );


    if (totalStudents) {

      totalStudents.textContent =
        students.length;

    }


    if (timeInCount) {

      timeInCount.textContent =
        todays.filter(
          record => record.timeIn
        ).length;

    }


    if (inSchoolCount) {

      inSchoolCount.textContent =
        todays.filter(
          record =>
            record.timeIn &&
            !record.timeOut
        ).length;

    }


    if (pickedCount) {

      pickedCount.textContent =
        todays.filter(
          record => record.timeOut
        ).length;

    }


    if (notInCount) {

      notInCount.textContent =
        Math.max(
          0,
          students.length -
          todays.filter(
            record => record.timeIn
          ).length
        );

    }


    const activity =
      document.getElementById(
        "activity"
      );


    if (!activity) return;


    const recent =
      todays
        .slice()
        .reverse()
        .slice(0, 8);


    if (!recent.length) {

      activity.innerHTML =
        '<p class="muted">No activity yet.</p>';

      return;

    }


    activity.innerHTML =
      recent.map(record => {

        const status =
          record.timeOut
            ? "PICKED UP"
            : "IN SCHOOL";


        const pickup =
          record.pickupPerson
            ? ` • ${escapeHtml(record.pickupPerson)}`
            : "";


        return `

          <div class="activity-row">

            <b>
              ${escapeHtml(record.studentName)}
            </b>

            — ${status}

            <br>

            <span class="muted">

              ${escapeHtml(record.timeIn || "")}

              ${
                record.timeOut
                  ? ` → ${escapeHtml(record.timeOut)}`
                  : ""
              }

              ${pickup}

            </span>

          </div>

        `;

      }).join("");

  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );

  }

}


// ============================================================
// ADD STUDENT
// ============================================================

async function addStudent() {

  const id =
    document
      .getElementById("studentIdInput")
      ?.value
      .trim()
      .toUpperCase();


  const name =
    document
      .getElementById("studentNameInput")
      ?.value
      .trim();


  const grade =
    document
      .getElementById("studentGradeInput")
      ?.value
      .trim();


  const section =
    document
      .getElementById("studentSectionInput")
      ?.value
      .trim();


  const parent =
    document
      .getElementById("studentParentInput")
      ?.value
      .trim();


  const phone =
    document
      .getElementById("studentPhoneInput")
      ?.value
      .trim();


  // ----------------------------------------------------------
  // REQUIRED INFORMATION
  // ----------------------------------------------------------

  if (
    !id ||
    !name ||
    !grade ||
    !section ||
    !parent ||
    !phone
  ) {

    showStudentMessage(
      "Please complete all required student information.",
      "warning"
    );

    return;

  }


  // ----------------------------------------------------------
  // CHECK DUPLICATE ID
  // ----------------------------------------------------------

  const existing =
    await get(
      STORE_STUDENTS,
      id
    );


  if (existing) {

    showStudentMessage(
      "This Student ID already exists.",
      "warning"
    );

    return;

  }


  // ----------------------------------------------------------
  // GET ALL AUTHORIZED PICKUP PEOPLE
  // ----------------------------------------------------------

  const pickupForms =
    document.querySelectorAll(
      ".pickup-person-form"
    );


  const authorized = [];


  pickupForms.forEach(form => {

    const pickupName =
      form
        .querySelector(".pickup-name")
        ?.value
        .trim();


    const pickupRelationship =
      form
        .querySelector(".pickup-relationship")
        ?.value
        .trim();


    const pickupPhone =
      form
        .querySelector(".pickup-phone")
        ?.value
        .trim();


    if (pickupName) {

      authorized.push({

        name:
          pickupName,

        relationship:
          pickupRelationship ||
          "Not specified",

        phone:
          pickupPhone || ""

      });

    }

  });


  // ----------------------------------------------------------
  // CREATE STUDENT
  // ----------------------------------------------------------

  const student = {

    id: id,

    name: name,

    grade: grade,

    section: section,

    parent: parent,

    phone: phone,

    authorized: authorized

  };


  try {

    await put(
      STORE_STUDENTS,
      student
    );


    showStudentMessage(
      `${name} was added successfully with ${authorized.length} authorized pickup person(s).`,
      "success"
    );


    clearStudentForm();


    await renderStudents();

    await refresh();


    toast(
      "Student added successfully."
    );


  } catch (error) {

    console.error(
      "Add student error:",
      error
    );


    showStudentMessage(
      "Unable to save the student.",
      "warning"
    );

  }

}


// ============================================================
// ADD ANOTHER AUTHORIZED PERSON
// ============================================================

function addPickupPersonField() {

  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );


  if (!container) {

    console.error(
      "pickupPeopleContainer not found."
    );

    return;

  }


  const form =
    document.createElement(
      "div"
    );


  form.className =
    "pickup-person-form";


  form.style.cssText = `

    border:1px solid #ddd;
    border-radius:12px;
    padding:15px;
    margin-top:12px;

  `;


  form.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:10px;
      "
    >

      <b>
        Additional Authorized Person
      </b>


      <button
        type="button"
        class="danger"
        onclick="
          this.closest('.pickup-person-form').remove()
        "
      >

        🗑 Remove

      </button>

    </div>


    <label>
      Full Name
    </label>


    <input
      class="pickup-name"
      placeholder="Example: Ana Santos"
    >


    <label>
      Relationship
    </label>


    <input
      class="pickup-relationship"
      placeholder="Example: Aunt"
    >


    <label>
      Contact Number
    </label>


    <input
      class="pickup-phone"
      placeholder="Example: 02012345678"
    >

  `;


  container.appendChild(
    form
  );

}


// ============================================================
// CLEAR ADD STUDENT FORM
// ============================================================

function clearStudentForm() {

  const fields = [

    "studentIdInput",
    "studentNameInput",
    "studentGradeInput",
    "studentSectionInput",
    "studentParentInput",
    "studentPhoneInput"

  ];


  fields.forEach(id => {

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

    container.innerHTML = `

      <div class="pickup-person-form">

        <label>
          Full Name
        </label>


        <input
          class="pickup-name"
          placeholder="Example: Maria Dela Cruz"
        >


        <label>
          Relationship
        </label>


        <input
          class="pickup-relationship"
          placeholder="Example: Mother"
        >


        <label>
          Contact Number
        </label>


        <input
          class="pickup-phone"
          placeholder="Example: 02012345678"
        >

      </div>

    `;

  }

}


// ============================================================
// STUDENT MESSAGE
// ============================================================

function showStudentMessage(
  message,
  type = "success"
) {

  const element =
    document.getElementById(
      "studentMessage"
    );


  if (!element) return;


  const className =
    type === "warning"
      ? "warning"
      : "success";


  element.innerHTML = `

    <div
      class="${className}"
      style="margin-top:12px"
    >

      ${escapeHtml(message)}

    </div>

  `;


  setTimeout(() => {

    element.innerHTML = "";

  }, 3500);

}


// ============================================================
// SEARCH / DISPLAY STUDENTS
// ============================================================

async function renderStudents() {

  if (!db) return;


  const students =
    await all(
      STORE_STUDENTS
    );


  const searchElement =
    document.getElementById(
      "studentSearch"
    );


  const search =
    searchElement
      ? searchElement.value
          .trim()
          .toLowerCase()
      : "";


  const filtered =
    students
      .filter(student => {

        if (!search) {

          return true;

        }


        return (

          student.id
            .toLowerCase()
            .includes(search)

          ||

          student.name
            .toLowerCase()
            .includes(search)

        );

      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name)
      );


  const container =
    document.getElementById(
      "studentList"
    );


  if (!container) return;


  if (!filtered.length) {

    container.innerHTML = `

      <div class="card">

        <p class="muted">

          No students added yet.

        </p>

      </div>

    `;

    return;

  }


  container.innerHTML =
    filtered.map(student => {

      const authorized =
        student.authorized || [];


      return `

        <div
          class="card"
          style="margin-top:12px"
        >

          <div class="student-head">

            <img
              class="avatar"
              src="logo.png"
              alt="Student"
            >


            <div>

              <h3>

                ${escapeHtml(
                  student.name
                )}

              </h3>


              <div>

                ${escapeHtml(
                  student.id
                )}

                •

                ${escapeHtml(
                  student.grade
                )}

                -

                ${escapeHtml(
                  student.section
                )}

              </div>


              <div class="muted">

                Parent:

                ${escapeHtml(
                  student.parent
                )}

              </div>

            </div>

          </div>


          <p>

            <b>
              Authorized pickup:
            </b>

            ${authorized.length}
            person(s)

          </p>


          ${
            authorized.length
              ? `

                <div
                  style="
                    margin:10px 0;
                    padding:10px;
                    background:#f7f7f7;
                    border-radius:10px;
                  "
                >

                  ${authorized
                    .map(
                      (person, index) => `

                        <div
                          style="margin-bottom:6px"
                        >

                          <b>
                            ${index + 1}.
                            ${escapeHtml(
                              person.name
                            )}
                          </b>

                          —

                          ${escapeHtml(
                            person.relationship ||
                            ""
                          )}

                          ${
                            person.phone
                              ? ` • ${escapeHtml(person.phone)}`
                              : ""
                          }

                        </div>

                      `
                    )
                    .join("")}

                </div>

              `
              : ""
          }


          <div class="row">

            <button
              class="primary"
              onclick="
                generateStudentQR(
                  '${safeAttribute(student.id)}'
                )
              "
            >

              🔲 Generate QR

            </button>


            <button
              class="secondary"
              onclick="
                viewStudent(
                  '${safeAttribute(student.id)}'
                )
              "
            >

              👁 View

            </button>


            <button
              class="danger"
              onclick="
                deleteStudent(
                  '${safeAttribute(student.id)}'
                )
              "
            >

              🗑 Remove

            </button>

          </div>

        </div>

      `;

    }).join("");

}


// ============================================================
// VIEW STUDENT
// ============================================================

async function viewStudent(id) {

  const student =
    await get(
      STORE_STUDENTS,
      id
    );


  if (!student) {

    toast(
      "Student not found."
    );

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
// DELETE STUDENT
// ============================================================

async function deleteStudent(id) {

  const student =
    await get(
      STORE_STUDENTS,
      id
    );


  if (!student) {

    toast(
      "Student not found."
    );

    return;

  }


  const confirmed =
    confirm(
      `Remove ${student.name} (${student.id}) from the student list?`
    );


  if (!confirmed) {

    return;

  }


  try {

    await deleteStudentFromDB(
      id
    );


    toast(
      `${student.name} was removed.`
    );


    await renderStudents();

    await refresh();


  } catch (error) {

    console.error(
      "Delete student error:",
      error
    );


    toast(
      "Unable to remove student."
    );

  }

}


// ============================================================
// GENERATE QR
// ============================================================

function generateStudentQR(id) {

  const studentId =
    String(id)
      .trim()
      .toUpperCase();


  const existing =
    document.getElementById(
      "qrModal"
    );


  if (existing) {

    existing.remove();

  }


  const modal =
    document.createElement(
      "div"
    );


  modal.id =
    "qrModal";


  modal.style.cssText = `

    position:fixed;
    inset:0;
    background:rgba(0,0,0,.75);
    display:flex;
    align-items:center;
    justify-content:center;
    z-index:9999;
    padding:20px;

  `;


  modal.innerHTML = `

    <div
      class="card"
      style="
        max-width:380px;
        width:100%;
        text-align:center;
      "
    >

      <h2>
        Student QR Code
      </h2>


      <p class="muted">
        Student ID
      </p>


      <h2>
        ${escapeHtml(studentId)}
      </h2>


      <div
        id="qrCodeBox"
        style="
          display:flex;
          justify-content:center;
          margin:20px 0;
        "
      ></div>


      <p class="muted">

        This QR code contains
        only the Student ID.

      </p>


      <div class="row">

        <button
          class="primary"
          onclick="
            downloadStudentQR(
              '${safeAttribute(studentId)}'
            )
          "
        >

          💾 Download QR

        </button>


        <button
          class="secondary"
          onclick="closeQRModal()"
        >

          Close

        </button>

      </div>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  if (
    typeof QRCode ===
    "undefined"
  ) {

    document.getElementById(
      "qrCodeBox"
    ).innerHTML = `

      <div class="warning">

        QR generator library
        could not be loaded.

      </div>

    `;

    return;

  }


  try {

    new QRCode(

      document.getElementById(
        "qrCodeBox"
      ),

      {

        text:
          studentId,

        width:
          240,

        height:
          240,

        correctLevel:
          QRCode.CorrectLevel.H

      }

    );

  } catch (error) {

    console.error(
      "QR generation error:",
      error
    );

  }

}


// ============================================================
// CLOSE QR
// ============================================================

function closeQRModal() {

  const modal =
    document.getElementById(
      "qrModal"
    );


  if (modal) {

    modal.remove();

  }

}


// ============================================================
// DOWNLOAD QR
// ============================================================

function downloadStudentQR(id) {

  const box =
    document.getElementById(
      "qrCodeBox"
    );


  if (!box) {

    return;

  }


  const canvas =
    box.querySelector(
      "canvas"
    );


  if (canvas) {

    const link =
      document.createElement(
        "a"
      );


    link.download =
      `${id}_QR.png`;


    link.href =
      canvas.toDataURL(
        "image/png"
      );


    link.click();


    return;

  }


  const image =
    box.querySelector(
      "img"
    );


  if (image) {

    const link =
      document.createElement(
        "a"
      );


    link.download =
      `${id}_QR.png`;


    link.href =
      image.src;


    link.click();


    return;

  }


  toast(
    "QR code image is not ready."
  );

}


// ============================================================
// STUDENT RECORD SCREEN
// ============================================================

async function awaitRecord(id) {

  return await get(
    STORE_ATT,
    keyFor(id)
  );

}


async function renderStudent(student) {

  const container =
    document.getElementById(
      "studentCard"
    );


  if (!container) return;


  const record =
    await awaitRecord(
      student.id
    );


  const authorized =
    student.authorized || [];


  const status =
    record?.timeOut
      ? "PICKED UP"
      : record?.timeIn
        ? "IN SCHOOL"
        : "NOT CHECKED IN";


  const statusClass =
    record?.timeOut
      ? "out"
      : record?.timeIn
        ? "in"
        : "";


  container.innerHTML = `

    <div class="student-head">

      <img
        class="avatar"
        src="logo.png"
        alt="Student"
      >


      <div>

        <h2>

          ${escapeHtml(
            student.name
          )}

        </h2>


        <div>

          ${escapeHtml(
            student.id
          )}

          •

          ${escapeHtml(
            student.grade
          )}

          -

          ${escapeHtml(
            student.section
          )}

        </div>

      </div>

    </div>


    <hr>


    <p>

      <b>
        Parent/Guardian:
      </b>

      ${escapeHtml(
        student.parent
      )}

    </p>


    <p>

      <b>
        Parent Phone:
      </b>

      ${escapeHtml(
        student.phone
      )}

    </p>


    <p>

      <b>
        Authorized Pickup People:
      </b>

      ${authorized.length}

    </p>


    ${
      authorized.length
        ? `

          <div
            style="
              padding:12px;
              background:#f7f7f7;
              border-radius:10px;
              margin:12px 0;
            "
          >

            ${authorized
              .map(
                (person, index) => `

                  <div
                    style="margin-bottom:7px"
                  >

                    <b>
                      ${index + 1}.
                      ${escapeHtml(
                        person.name
                      )}
                    </b>

                    —

                    ${escapeHtml(
                      person.relationship ||
                      ""
                    )}

                    ${
                      person.phone
                        ? ` • ${escapeHtml(person.phone)}`
                        : ""
                    }

                  </div>

                `
              )
              .join("")}

          </div>

        `
        : `
          <p class="muted">
            No authorized pickup people registered.
          </p>
        `
    }


    <p>

      <b>
        Status:
      </b>

      <span
        class="status ${statusClass}"
      >

        ${status}

      </span>

    </p>


    ${
      record?.timeIn
        ? `

          <p>

            <b>
              Time In:
            </b>

            ${escapeHtml(
              record.timeIn
            )}

          </p>

        `
        : ""
    }


    ${
      record?.timeOut
        ? `

          <p>

            <b>
              Time Out:
            </b>

            ${escapeHtml(
              record.timeOut
            )}

          </p>


          <p>

            <b>
              Pickup Person:
            </b>

            ${escapeHtml(
              record.pickupPerson ||
              "-"
            )}

          </p>

        `
        : ""
    }


    <div class="row">

      <button
        class="primary"
        onclick="timeIn()"
      >

        ⏱️ TIME IN

      </button>


      <button
        class="secondary"
        onclick="openPickup()"
      >

        🚗 PICKUP / TIME OUT

      </button>


      <button
        class="secondary"
        onclick="show('students')"
      >

        ← Students

      </button>

    </div>

  `;

}


// ============================================================
// TIME IN
// ============================================================

async function timeIn() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;

  }


  const key =
    keyFor(
      currentStudent.id
    );


  const old =
    await get(
      STORE_ATT,
      key
    );


  if (old?.timeIn) {

    toast(
      `Already checked in at ${old.timeIn}.`
    );

    return;

  }


  const record = {

    key:
      key,

    date:
      today(),

    studentId:
      currentStudent.id,

    studentName:
      currentStudent.name,

    grade:
      currentStudent.grade,

    section:
      currentStudent.section,

    timeIn:
      now(),

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
    STORE_ATT,
    record
  );


  await queue(
    record,
    "TIME_IN"
  );


  toast(
    "TIME IN SUCCESSFUL"
  );


  await renderStudent(
    currentStudent
  );


  await refresh();

}


// ============================================================
// PICKUP SCREEN
// ============================================================

function openPickup() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;

  }


  get(
    STORE_ATT,
    keyFor(
      currentStudent.id
    )
  ).then(record => {


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


    const authorized =
      currentStudent.authorized || [];


    const pickupCard =
      document.getElementById(
        "pickupCard"
      );


    if (!pickupCard) return;


    pickupCard.innerHTML = `

      <h2>
        🚗 Pickup / Time Out
      </h2>


      <div class="student-head">

        <img
          class="avatar"
          src="logo.png"
          alt="Student"
        >


        <div>

          <b>

            ${escapeHtml(
              currentStudent.name
            )}

          </b>


          <br>


          ${escapeHtml(
            currentStudent.id
          )}

          •

          ${escapeHtml(
            currentStudent.grade
          )}

          -

          ${escapeHtml(
            currentStudent.section
          )}

        </div>

      </div>


      <hr>


      <p class="muted">

        Select the person who is
        picking up the student.

      </p>


      <label>
        Authorized Pickup Person
      </label>


      <div class="option-grid">

        ${
          authorized.length

            ? authorized
                .map(
                  person => `

                    <div
                      class="option"
                      onclick='selectAuth(${JSON.stringify(person)})'
                    >

                      <b>

                        ${escapeHtml(
                          person.name
                        )}

                      </b>

                      <br>

                      ${escapeHtml(
                        person.relationship ||
                        ""
                      )}

                      •

                      ${escapeHtml(
                        person.phone ||
                        ""
                      )}

                    </div>

                  `
                )
                .join("")

            : `

              <div class="warning">

                No authorized pickup
                persons have been added.

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
          Unauthorized person — Request Admin Approval
        </option>


        <option value="EMERGENCY_APPROVAL">
          Emergency / Parent Phone Confirmation
        </option>


        <option value="OTHER_APPROVAL">
          Other — Admin Approval Required
        </option>

      </select>


      <div
        id="unauthorizedFields"
      ></div>


      <div
        class="row"
        style="margin-top:14px"
      >

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


    show("pickup");

  });

}


// ============================================================
// SELECT AUTHORIZED PERSON
// ============================================================

function selectAuth(person) {

  selectedPickup = {

    ...person,

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


  toast(
    `${person.name} selected.`
  );

}


// ============================================================
// PICKUP OPTION
// ============================================================

function optionChanged() {

  const option =
    document.getElementById(
      "pickupOption"
    );


  const fields =
    document.getElementById(
      "unauthorizedFields"
    );


  if (!option || !fields) {
    return;
  }


  const value =
    option.value;


  if (
    !value ||
    value === "AUTHORIZED"
  ) {

    fields.innerHTML =
      "";

    return;

  }


  fields.innerHTML = `

    <label>
      Pickup Person Full Name
    </label>


    <input
      id="upName"
      placeholder="Full name"
    >


    <label>
      Relationship
    </label>


    <input
      id="upRel"
      placeholder="Example: Aunt, Grandparent"
    >


    <label>
      Contact Number
    </label>


    <input
      id="upPhone"
      placeholder="Phone number"
    >


    <label>
      Reason / Notes
    </label>


    <textarea
      id="upReason"
      rows="3"
      placeholder="Explain why this person is picking up the student."
    ></textarea>


    <div class="warning">

      <b>
        ⚠ APPROVAL REQUIRED
      </b>

      <br>

      Do not release the student until
      an authorized staff member approves
      this request.

    </div>


    <label>
      Approving Staff
    </label>


    <input
      id="approver"
      placeholder="Admin / authorized staff name"
    >

  `;

}


// ============================================================
// CONFIRM PICKUP
// ============================================================

async function confirmPickup() {

  const optionElement =
    document.getElementById(
      "pickupOption"
    );


  const option =
    optionElement
      ? optionElement.value
      : "";


  if (!option) {

    toast(
      "Please select a pickup option."
    );

    return;

  }


  let pickup =
    selectedPickup;


  if (
    option !== "AUTHORIZED"
  ) {

    const name =
      document
        .getElementById("upName")
        ?.value
        .trim();


    const relationship =
      document
        .getElementById("upRel")
        ?.value
        .trim();


    const phone =
      document
        .getElementById("upPhone")
        ?.value
        .trim();


    const reason =
      document
        .getElementById("upReason")
        ?.value
        .trim();


    const approver =
      document
        .getElementById("approver")
        ?.value
        .trim();


    if (
      !name ||
      !approver
    ) {

      toast(
        "Pickup person name and approving staff are required."
      );

      return;

    }


    pickup = {

      name:
        name,

      relationship:
        relationship,

      phone:
        phone,

      option:
        option,

      reason:
        reason,

      approver:
        approver

    };

  }


  if (!pickup) {

    toast(
      "Select an authorized person or pickup option."
    );

    return;

  }


  if (
    option !== "AUTHORIZED"
  ) {

    const approved =
      confirm(
        "Confirm ADMIN APPROVAL and release this student?"
      );


    if (!approved) {
      return;
    }

  }


  const key =
    keyFor(
      currentStudent.id
    );


  const record =
    await get(
      STORE_ATT,
      key
    );


  if (
    !record ||
    !record.timeIn
  ) {

    toast(
      "No TIME IN record."
    );

    return;

  }


  if (record.timeOut) {

    toast(
      "Student has already been picked up."
    );

    return;

  }


  record.timeOut =
    now();


  record.pickupPerson =
    pickup.name || "";


  record.pickupRelationship =
    pickup.relationship || "";


  record.pickupPhone =
    pickup.phone || "";


  record.pickupOption =
    option;


  record.notes =
    pickup.reason || "";


  record.approver =
    pickup.approver || "";


  await put(
    STORE_ATT,
    record
  );


  await queue(
    record,
    "PICKUP"
  );


  toast(
    "PICKUP SUCCESSFUL"
  );


  show("home");


  await refresh();

}


// ============================================================
// OFFLINE QUEUE
// ============================================================

async function queue(
  record,
  action
) {

  return new Promise(
    (resolve, reject) => {

      const store =
        tx(
          STORE_QUEUE,
          "readwrite"
        );


      const request =
        store.add({

          record:
            record,

          action:
            action,

          createdAt:
            new Date()
              .toISOString()

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


// ============================================================
// SYNC
// ============================================================

async function syncQueue() {

  if (!navigator.onLine) {
    return;
  }


  const url =
    localStorage.getItem(
      "VISION_SYNC_URL"
    );


  if (!url) {
    return;
  }


  const items =
    await all(
      STORE_QUEUE
    );


  if (!items.length) {
    return;
  }


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
              JSON.stringify(item)

          }
        );


      if (!response.ok) {
        break;
      }


      await new Promise(
        (resolve, reject) => {

          const store =
            tx(
              STORE_QUEUE,
              "readwrite"
            );


          const request =
            store.delete(
              item.id
            );


          request.onsuccess =
            () => resolve();


          request.onerror =
            () => reject(
              request.error
            );

        }
      );


    } catch (error) {

      console.error(
        "Sync error:",
        error
      );

      break;

    }

  }

}


// ============================================================
// EXPORT CSV
// ============================================================

async function exportCSV() {

  const rows =
    await all(
      STORE_ATT
    );


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

    "Date":
      "date",

    "Student ID":
      "studentId",

    "Student Name":
      "studentName",

    "Grade":
      "grade",

    "Section":
      "section",

    "Time In":
      "timeIn",

    "Time Out":
      "timeOut",

    "Pickup Person":
      "pickupPerson",

    "Relationship":
      "pickupRelationship",

    "Phone":
      "pickupPhone",

    "Pickup Option":
      "pickupOption",

    "Staff":
      "staff",

    "Approver":
      "approver",

    "Notes":
      "notes"

  };


  const lines = [

    headers,

    ...rows.map(
      row =>
        headers.map(
          header =>
            csv(
              row[
                map[header]
              ] ?? ""
            )
        )
    )

  ];


  const content =
    lines
      .map(
        line =>
          line.join(",")
      )
      .join("\n");


  const blob =
    new Blob(
      [content],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    URL.createObjectURL(
      blob
    );


  link.download =
    `vision_school_attendance_${today()}.csv`;


  link.click();


  URL.revokeObjectURL(
    link.href
  );

}


// ============================================================
// CSV HELPER
// ============================================================

function csv(value) {

  return `"${String(value)
    .replaceAll('"', '""')}"`;

}


// ============================================================
// REPORT
// ============================================================

async function renderReport() {

  const container =
    document.getElementById(
      "reportTable"
    );


  if (!container) {
    return;
  }


  const rows =
    await all(
      STORE_ATT
    );


  if (!rows.length) {

    container.innerHTML = `

      <p class="muted">

        No attendance records yet.

      </p>

    `;

    return;

  }


  container.innerHTML = `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>
              Date
            </th>

            <th>
              Student
            </th>

            <th>
              Time In
            </th>

            <th>
              Time Out
            </th>

            <th>
              Pickup
            </th>

            <th>
              Option
            </th>

          </tr>

        </thead>


        <tbody>

          ${
            rows
              .slice()
              .reverse()
              .map(
                record => `

                  <tr>

                    <td>
                      ${escapeHtml(
                        record.date
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        record.studentName
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        record.timeIn ||
                        "-"
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        record.timeOut ||
                        "-"
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        record.pickupPerson ||
                        "-"
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        record.pickupOption ||
                        "-"
                      )}
                    </td>

                  </tr>

                `
              )
              .join("")
          }

        </tbody>

      </table>

    </div>

  `;

}


// ============================================================
// RESET LOCAL DATABASE
// ============================================================

async function clearDemo() {

  const confirmed =
    confirm(
      "WARNING: This will delete ALL students and attendance records stored on this device. Continue?"
    );


  if (!confirmed) {
    return;
  }


  try {

    stopScanner();


    await new Promise(
      (resolve, reject) => {

        const request =
          indexedDB.deleteDatabase(
            DB
          );


        request.onsuccess =
          () => resolve();


        request.onerror =
          () => reject(
            request.error
          );

        request.onblocked =
          () => {

            console.warn(
              "Database deletion blocked."
            );

          };

      }
    );


    location.reload();


  } catch (error) {

    console.error(
      "Reset database error:",
      error
    );


    toast(
      "Unable to reset database."
    );

  }

}


// ============================================================
// HTML SECURITY
// ============================================================

function escapeHtml(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      character => {

        const map = {

          "&":
            "&amp;",

          "<":
            "&lt;",

          ">":
            "&gt;",

          '"':
            "&quot;",

          "'":
            "&#039;"

        };


        return map[character];

      }
    );

}


function safeAttribute(value) {

  return String(value ?? "")
    .replaceAll(
      "\\",
      "\\\\"
    )
    .replaceAll(
      "'",
      "\\'"
    );

}


// ============================================================
// QR CAMERA
// ============================================================

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

    stream =
      await navigator.mediaDevices
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


    await video.play();


    const message =
      document.getElementById(
        "scanMessage"
      );


    if (message) {

      message.innerHTML = `

        <div class="success">

          Camera started.

          Point it at a student's QR code.

        </div>

      `;

    }


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


// ============================================================
// STOP CAMERA
// ============================================================

function stopScanner() {

  if (stream) {

    stream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );


    stream = null;

  }


  const video =
    document.getElementById(
      "video"
    );


  if (video) {

    video.srcObject =
      null;

  }

}


// ============================================================
// QR SCANNER LOOP
// ============================================================

function scanLoop() {

  if (!stream) {
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
    video.readyState >= 2
  ) {

    canvas.width =
      video.videoWidth;


    canvas.height =
      video.videoHeight;


    if (
      !canvas.width ||
      !canvas.height
    ) {

      requestAnimationFrame(
        scanLoop
      );

      return;

    }


    const context =
      canvas.getContext(
        "2d"
      );


    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );


    if (
      "BarcodeDetector"
      in window
    ) {

      const detector =
        new BarcodeDetector({

          formats:
            ["qr_code"]

        });


      detector
        .detect(canvas)
        .then(
          results => {

            if (
              results.length
            ) {

              handleScan(
                results[0]
                  .rawValue
              );

            } else {

              requestAnimationFrame(
                scanLoop
              );

            }

          }
        )
        .catch(
          error => {

            console.error(
              "QR detection error:",
              error
            );


            requestAnimationFrame(
              scanLoop
            );

          }
        );


    } else {

      const message =
        document.getElementById(
          "scanMessage"
        );


      if (message) {

        message.innerHTML = `

          <div class="warning">

            This browser does not support
            built-in QR detection.

            <br><br>

            Use Manual Student ID for testing.

          </div>

        `;

      }


      requestAnimationFrame(
        scanLoop
      );

    }

  } else {

    requestAnimationFrame(
      scanLoop
    );

  }

}


// ============================================================
// HANDLE QR RESULT
// ============================================================

async function handleScan(raw) {

  const id =
    String(raw || "")
      .trim()
      .toUpperCase();


  if (!id) {

    toast(
      "No Student ID detected."
    );

    return;

  }


  stopScanner();


  const student =
    await get(
      STORE_STUDENTS,
      id
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

          <b>
            ${escapeHtml(id)}
          </b>

          <br><br>

          Please check the QR code
          or add this student first.

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
// SERVICE WORKER
// ============================================================

if (
  "serviceWorker"
  in navigator
) {

  window.addEventListener(
    "load",
    () => {

      navigator.serviceWorker
        .register("sw.js")
        .then(
          registration => {

            console.log(
              "Service Worker registered:",
              registration.scope
            );

          }
        )
        .catch(
          error => {

            console.error(
              "Service Worker registration failed:",
              error
            );

          }
        );

    }
  );

}


// ============================================================
// START APP
// ============================================================

window.addEventListener(
  "DOMContentLoaded",
  initializeApp
);