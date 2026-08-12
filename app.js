/* ============================================================
   VISION SCHOOL
   MULTI-DEVICE SUPABASE VERSION

   Shared database:
   Supabase

   Tables:
   public.students
   public.attendance
============================================================ */


/* ============================================================
   SUPABASE CONFIGURATION
============================================================ */

const SUPABASE_URL =
  "https://ymonpeujmhaymkxfmmtq.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* ============================================================
   GLOBAL VARIABLES
============================================================ */

let currentStudent = null;

let selectedPickup = null;

let qrScanner = null;

let scannerRunning = false;

let studentsCache = [];

let attendanceCache = [];

let refreshTimer = null;


/* ============================================================
   BASIC HELPERS
============================================================ */

function today() {

  const d = new Date();

  const year =
    d.getFullYear();

  const month =
    String(d.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(d.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function currentTime() {

  return new Date().toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character])
    );
}


function csv(value) {

  return `"${String(value ?? "")
    .replaceAll('"', '""')}"`;
}


function toast(message) {

  const element =
    document.getElementById("toast");

  if (!element) return;

  element.textContent =
    message;

  element.style.display =
    "block";

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(
      () => {
        element.style.display =
          "none";
      },
      3000
    );
}


/* ============================================================
   CONNECTION STATUS
============================================================ */

function updateConnectionStatus() {

  const box =
    document.getElementById(
      "connectionStatus"
    );

  const text =
    document.getElementById(
      "connectionText"
    );

  if (!box || !text) return;

  if (navigator.onLine) {

    box.classList.add("online");

    text.textContent =
      "ONLINE";

  } else {

    box.classList.remove("online");

    text.textContent =
      "OFFLINE";

  }
}


/* ============================================================
   NAVIGATION
============================================================ */

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

    console.error(
      "Screen not found:",
      screenId
    );

    return;
  }


  screen.classList.add(
    "active"
  );


  if (screenId !== "scanner") {

    stopScanner();

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


  window.scrollTo(
    {
      top: 0,
      behavior: "smooth"
    }
  );
}


/* ============================================================
   SUPABASE ERROR HANDLING
============================================================ */

function showSupabaseError(
  error,
  fallbackMessage
) {

  console.error(
    "Supabase error:",
    error
  );


  let message =
    fallbackMessage;


  if (error?.message) {

    message +=
      " " +
      error.message;

  }


  toast(message);
}


/* ============================================================
   LOAD STUDENTS
============================================================ */

async function loadStudents() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("students")
      .select("*")
      .order(
        "name",
        {
          ascending: true
        }
      );


  if (error) {

    showSupabaseError(
      error,
      "Unable to load students."
    );

    return [];

  }


  studentsCache =
    data || [];


  return studentsCache;
}


/* ============================================================
   LOAD TODAY'S ATTENDANCE
============================================================ */

async function loadTodayAttendance() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("attendance")
      .select("*")
      .eq(
        "date",
        today()
      );


  if (error) {

    showSupabaseError(
      error,
      "Unable to load attendance."
    );

    return [];

  }


  attendanceCache =
    data || [];


  return attendanceCache;
}


/* ============================================================
   LOAD ALL ATTENDANCE
============================================================ */

async function loadAllAttendance() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("attendance")
      .select("*")
      .order(
        "date",
        {
          ascending: false
        }
      )
      .order(
        "time_in",
        {
          ascending: false
        }
      );


  if (error) {

    showSupabaseError(
      error,
      "Unable to load reports."
    );

    return [];

  }


  return data || [];
}


/* ============================================================
   DASHBOARD
============================================================ */

async function refreshDashboard() {

  try {

    await Promise.all([
      loadStudents(),
      loadTodayAttendance()
    ]);


    const students =
      studentsCache;


    const attendance =
      attendanceCache;


    const timeInRecords =
      attendance.filter(
        record =>
          record.time_in
      );


    const inSchool =
      attendance.filter(
        record =>
          record.time_in &&
          !record.time_out
      );


    const pickedUp =
      attendance.filter(
        record =>
          record.time_out
      );


    const totalElement =
      document.getElementById(
        "totalStudents"
      );


    const timeInElement =
      document.getElementById(
        "timeInCount"
      );


    const inSchoolElement =
      document.getElementById(
        "inSchoolCount"
      );


    const pickedElement =
      document.getElementById(
        "pickedCount"
      );


    const notInElement =
      document.getElementById(
        "notInCount"
      );


    if (totalElement)
      totalElement.textContent =
        students.length;


    if (timeInElement)
      timeInElement.textContent =
        timeInRecords.length;


    if (inSchoolElement)
      inSchoolElement.textContent =
        inSchool.length;


    if (pickedElement)
      pickedElement.textContent =
        pickedUp.length;


    if (notInElement)
      notInElement.textContent =
        Math.max(
          0,
          students.length -
          timeInRecords.length
        );


    renderRecentActivity(
      attendance
    );


  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );

  }
}


/* ============================================================
   RECENT ACTIVITY
============================================================ */

function renderRecentActivity(
  records
) {

  const container =
    document.getElementById(
      "activity"
    );


  if (!container) return;


  const recent =
    records
      .slice()
      .sort(
        (a, b) =>
          String(
            b.time_in || ""
          ).localeCompare(
            String(
              a.time_in || ""
            )
          )
      )
      .slice(0, 8);


  if (!recent.length) {

    container.innerHTML =
      '<p class="muted">No activity yet.</p>';

    return;

  }


  container.innerHTML =
    recent.map(
      record => {

        let status =
          "IN SCHOOL";

        if (record.time_out) {

          status =
            "PICKED UP";

        }


        return `
          <div class="activity-row">

            <strong>
              ${escapeHtml(
                record.student_name
              )}
            </strong>

            — ${status}

            <br>

            <span class="muted">

              ${escapeHtml(
                record.time_in || ""
              )}

              ${
                record.time_out
                  ? ` → ${escapeHtml(
                      record.time_out
                    )}`
                  : ""
              }

              ${
                record.pickup_person
                  ? ` • ${escapeHtml(
                      record.pickup_person
                    )}`
                  : ""
              }

            </span>

          </div>
        `;

      }
    ).join("");
}


/* ============================================================
   ADD STUDENT
============================================================ */

async function addStudent() {

  const id =
    document
      .getElementById(
        "studentIdInput"
      )
      .value
      .trim()
      .toUpperCase();


  const name =
    document
      .getElementById(
        "studentNameInput"
      )
      .value
      .trim();


  const level =
    document
      .getElementById(
        "studentLevelInput"
      )
      .value
      .trim();


  const section =
    document
      .getElementById(
        "studentSectionInput"
      )
      .value
      .trim();


  const parent =
    document
      .getElementById(
        "studentParentInput"
      )
      .value
      .trim();


  const phone =
    document
      .getElementById(
        "studentPhoneInput"
      )
      .value
      .trim();


  if (!id || !name || !level || !parent) {

    showStudentMessage(
      "Please complete Student ID, Name, Level and Parent/Guardian.",
      "warning"
    );

    return;
  }


  const authorized = [];


  document
    .querySelectorAll(
      ".authorized-person"
    )
    .forEach(
      form => {

        const personName =
          form
            .querySelector(
              ".pickup-name"
            )
            ?.value
            .trim();


        const relationship =
          form
            .querySelector(
              ".pickup-relationship"
            )
            ?.value
            .trim();


        const personPhone =
          form
            .querySelector(
              ".pickup-phone"
            )
            ?.value
            .trim();


        if (personName) {

          authorized.push({

            name:
              personName,

            relationship:
              relationship ||
              "Not specified",

            phone:
              personPhone ||
              ""

          });

        }

      }
    );


  try {

    const {
      data: existing,
      error: checkError
    } =
      await supabaseClient
        .from("students")
        .select("id")
        .eq(
          "id",
          id
        )
        .maybeSingle();


    if (checkError) {

      showSupabaseError(
        checkError,
        "Unable to check Student ID."
      );

      return;
    }


    if (existing) {

      showStudentMessage(
        "This Student ID already exists.",
        "warning"
      );

      return;
    }


    const student = {

      id,

      name,

      level,

      section:
        section || "",

      parent,

      phone:
        phone || "",

      authorized

    };


    const {
      error
    } =
      await supabaseClient
        .from("students")
        .insert(
          student
        );


    if (error) {

      showSupabaseError(
        error,
        "Unable to save student."
      );

      return;
    }


    showStudentMessage(
      `${name} was added successfully.`,
      "success"
    );


    toast(
      "Student added to shared database."
    );


    clearStudentForm();


    await loadStudents();

    await renderStudents();

    await refreshDashboard();


    setTimeout(
      () => show("students"),
      700
    );


  } catch (error) {

    console.error(
      "Add student error:",
      error
    );

    toast(
      "Unable to save student."
    );

  }
}


/* ============================================================
   ADD AUTHORIZED PICKUP PERSON
============================================================ */

function addPickupPersonField() {

  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );


  const form =
    document.createElement(
      "div"
    );


  form.className =
    "authorized-person";


  form.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
      "
    >

      <strong>
        Additional Authorized Person
      </strong>

      <button
        type="button"
        class="danger remove-person"
      >
        Remove
      </button>

    </div>


    <label>
      Full Name
    </label>

    <input
      class="pickup-name"
      placeholder="Example: Ana Santos">


    <label>
      Relationship
    </label>

    <input
      class="pickup-relationship"
      placeholder="Example: Aunt">


    <label>
      Contact Number
    </label>

    <input
      class="pickup-phone"
      placeholder="Example: 02012345678">

  `;


  form
    .querySelector(
      ".remove-person"
    )
    .addEventListener(
      "click",
      () => form.remove()
    );


  container.appendChild(
    form
  );
}


/* ============================================================
   CLEAR STUDENT FORM
============================================================ */

function clearStudentForm() {

  [
    "studentIdInput",
    "studentNameInput",
    "studentLevelInput",
    "studentSectionInput",
    "studentParentInput",
    "studentPhoneInput"
  ]
    .forEach(
      id => {

        const element =
          document.getElementById(
            id
          );

        if (element)
          element.value =
            "";

      }
    );


  const container =
    document.getElementById(
      "pickupPeopleContainer"
    );


  if (container) {

    container.innerHTML = `

      <div class="authorized-person">

        <label>Full Name</label>

        <input
          class="pickup-name"
          placeholder="Example: Maria Santos">

        <label>Relationship</label>

        <input
          class="pickup-relationship"
          placeholder="Example: Mother">

        <label>Contact Number</label>

        <input
          class="pickup-phone"
          placeholder="Example: 02012345678">

      </div>

    `;

  }


  const message =
    document.getElementById(
      "studentMessage"
    );


  if (message)
    message.innerHTML =
      "";
}


/* ============================================================
   STUDENT MESSAGE
============================================================ */

function showStudentMessage(
  message,
  type = "success"
) {

  const element =
    document.getElementById(
      "studentMessage"
    );


  if (!element) return;


  element.innerHTML = `

    <div class="message ${type}">

      ${escapeHtml(message)}

    </div>

  `;

}


/* ============================================================
   RENDER STUDENTS
============================================================ */

async function renderStudents() {

  await loadStudents();


  const container =
    document.getElementById(
      "studentList"
    );


  if (!container) return;


  const search =
    document
      .getElementById(
        "studentSearch"
      )
      ?.value
      .trim()
      .toLowerCase() ||
    "";


  const filtered =
    studentsCache
      .filter(
        student => {

          if (!search)
            return true;


          return (

            String(
              student.id || ""
            )
              .toLowerCase()
              .includes(search)

            ||

            String(
              student.name || ""
            )
              .toLowerCase()
              .includes(search)

          );

        }
      );


  if (!filtered.length) {

    container.innerHTML = `

      <div class="card">

        <p class="muted">
          No students found.
        </p>

      </div>

    `;

    return;
  }


  container.innerHTML =
    filtered.map(
      student => {

        const authorized =
          Array.isArray(
            student.authorized
          )
            ? student.authorized
            : [];


        return `

          <div class="student-item">

            <div class="student-top">

              <div>

                <div class="student-name">

                  ${escapeHtml(
                    student.name
                  )}

                </div>

                <div class="student-id">

                  ${escapeHtml(
                    student.id
                  )}

                </div>

                <div class="muted">

                  ${escapeHtml(
                    student.level || "-"
                  )}

                  ${
                    student.section
                      ? ` • ${escapeHtml(
                          student.section
                        )}`
                      : ""
                  }

                </div>

              </div>


              <div>

                <button
                  class="primary"
                  onclick="generateStudentQR('${safeJs(student.id)}')"
                >
                  🔲 Generate QR
                </button>

              </div>

            </div>


            <div
              style="
                margin-top:12px;
                color:#475467;
              "
            >

              Parent/Guardian:
              <strong>
                ${escapeHtml(
                  student.parent || "-"
                )}
              </strong>

            </div>


            <div
              style="
                margin-top:6px;
                color:#475467;
              "
            >

              Authorized Pickup:
              <strong>
                ${authorized.length}
              </strong>

              person(s)

            </div>


            <div
              class="row"
              style="margin-top:14px"
            >

              <button
                class="primary"
                onclick="viewStudent('${safeJs(student.id)}')"
              >
                👁 View Details
              </button>

              <button
                class="danger"
                onclick="deleteStudent('${safeJs(student.id)}')"
              >
                🗑 Remove
              </button>

            </div>

          </div>

        `;

      }
    ).join("");
}


/* ============================================================
   SAFE JAVASCRIPT ATTRIBUTE
============================================================ */

function safeJs(value) {

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


/* ============================================================
   GET TODAY ATTENDANCE FOR STUDENT
============================================================ */

async function getTodayRecord(
  studentId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("attendance")
      .select("*")
      .eq(
        "student_id",
        studentId
      )
      .eq(
        "date",
        today()
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
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


/* ============================================================
   VIEW STUDENT
============================================================ */

async function viewStudent(
  id
) {

  const {
    data: student,
    error
  } =
    await supabaseClient
      .from("students")
      .select("*")
      .eq(
        "id",
        id
      )
      .maybeSingle();


  if (error || !student) {

    showSupabaseError(
      error,
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


/* ============================================================
   STUDENT DETAILS
============================================================ */

async function renderStudent(
  student
) {

  const card =
    document.getElementById(
      "studentCard"
    );


  if (!card) return;


  const record =
    await getTodayRecord(
      student.id
    );


  const authorized =
    Array.isArray(
      student.authorized
    )
      ? student.authorized
      : [];


  let status =
    "NOT CHECKED IN";


  let statusClass =
    "none";


  if (
    record?.time_in &&
    !record?.time_out
  ) {

    status =
      "IN SCHOOL";

    statusClass =
      "in";

  }


  if (
    record?.time_out
  ) {

    status =
      "PICKED UP";

    statusClass =
      "out";

  }


  card.innerHTML = `

    <div class="section-title">

      <div>

        <div class="muted">
          STUDENT DETAILS
        </div>

        <h2>
          ${escapeHtml(
            student.name
          )}
        </h2>

        <div class="student-id">
          ${escapeHtml(
            student.id
          )}
        </div>

      </div>

      <span
        class="status ${statusClass}"
      >
        ${status}
      </span>

    </div>


    <div class="details-grid">

      <div class="detail-box">

        <div class="detail-label">
          Student ID
        </div>

        <div class="detail-value">
          ${escapeHtml(
            student.id
          )}
        </div>

      </div>


      <div class="detail-box">

        <div class="detail-label">
          Level / Grade
        </div>

        <div class="detail-value">
          ${escapeHtml(
            student.level || "-"
          )}
        </div>

      </div>


      <div class="detail-box">

        <div class="detail-label">
          Section
        </div>

        <div class="detail-value">
          ${escapeHtml(
            student.section || "-"
          )}
        </div>

      </div>


      <div class="detail-box">

        <div class="detail-label">
          Parent / Guardian
        </div>

        <div class="detail-value">
          ${escapeHtml(
            student.parent || "-"
          )}
        </div>

      </div>


      <div class="detail-box">

        <div class="detail-label">
          Parent Phone
        </div>

        <div class="detail-value">
          ${escapeHtml(
            student.phone || "-"
          )}
        </div>

      </div>


      <div class="detail-box">

        <div class="detail-label">
          Today's Time In
        </div>

        <div class="detail-value">
          ${escapeHtml(
            record?.time_in || "-"
          )}
        </div>

      </div>

    </div>


    <hr>


    <h3>
      Authorized Pickup People
    </h3>


    ${
      authorized.length

      ?

      authorized
        .map(
          (person, index) => `

            <div class="authorized-person">

              <strong>
                ${index + 1}.
                ${escapeHtml(
                  person.name
                )}
              </strong>

              <br>

              <span class="muted">

                ${escapeHtml(
                  person.relationship ||
                  "Not specified"
                )}

                ${
                  person.phone
                    ? ` • ${escapeHtml(
                        person.phone
                      )}`
                    : ""
                }

              </span>

            </div>

          `
        )
        .join("")

      :

      `
        <p class="muted">
          No authorized pickup people registered.
        </p>
      `
    }


    <div
      class="row"
      style="margin-top:20px"
    >

      ${
        !record?.time_in
          ?

          `
            <button
              class="primary big"
              onclick="timeIn()"
            >
              ⏱️ TIME IN
            </button>
          `

          :

          ""
      }


      ${
        record?.time_in &&
        !record?.time_out

          ?

          `
            <button
              class="primary big"
              onclick="openPickup()"
            >
              🚗 PICKUP / TIME OUT
            </button>
          `

          :

          ""
      }


      <button
        class="secondary"
        onclick="show('students')"
      >
        ← Students
      </button>


      <button
        class="secondary"
        onclick="show('scanner')"
      >
        📷 Scan Another
      </button>

    </div>

  `;
}


/* ============================================================
   DELETE STUDENT
============================================================ */

async function deleteStudent(
  id
) {

  const student =
    studentsCache.find(
      item =>
        item.id === id
    );


  if (!student) {

    toast(
      "Student not found."
    );

    return;
  }


  if (
    !confirm(
      `Remove ${student.name} (${student.id})?`
    )
  ) {

    return;
  }


  const {
    error
  } =
    await supabaseClient
      .from("students")
      .delete()
      .eq(
        "id",
        id
      );


  if (error) {

    showSupabaseError(
      error,
      "Unable to remove student."
    );

    return;
  }


  toast(
    "Student removed."
  );


  await renderStudents();

  await refreshDashboard();
}


/* ============================================================
   GENERATE STUDENT QR
============================================================ */

function generateStudentQR(
  id
) {

  const studentId =
    String(id)
      .trim()
      .toUpperCase();


  document
    .getElementById(
      "qrModal"
    )
    ?.remove();


  const modal =
    document.createElement(
      "div"
    );


  modal.id =
    "qrModal";

  modal.className =
    "qr-modal";


  modal.innerHTML = `

    <div class="qr-box">

      <h2>
        Student QR Code
      </h2>

      <p class="muted">
        Student ID
      </p>

      <h2>
        ${escapeHtml(
          studentId
        )}
      </h2>


      <div
        id="qrCodeBox"
      ></div>


      <p class="muted">
        This QR code contains only the Student ID.
      </p>


      <div
        class="row"
        style="
          justify-content:center;
        "
      >

        <button
          class="primary"
          onclick="downloadStudentQR()"
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


  const box =
    document.getElementById(
      "qrCodeBox"
    );


  if (
    typeof QRCode ===
    "undefined"
  ) {

    box.innerHTML = `

      <div class="message error">

        QR generator library
        could not be loaded.

        <br><br>

        Please check the internet
        connection and reload the page.

      </div>

    `;

    return;
  }


  try {

    new QRCode(
      box,
      {
        text:
          studentId,

        width:
          240,

        height:
          240,

        colorDark:
          "#000000",

        colorLight:
          "#ffffff",

        correctLevel:
          QRCode.CorrectLevel.H
      }
    );


  } catch (error) {

    console.error(
      "QR generation error:",
      error
    );


    box.innerHTML = `

      <div class="message error">

        Unable to generate QR code.

      </div>

    `;

  }
}


/* ============================================================
   CLOSE QR
============================================================ */

function closeQRModal() {

  document
    .getElementById(
      "qrModal"
    )
    ?.remove();
}


/* ============================================================
   DOWNLOAD QR
============================================================ */

function downloadStudentQR() {

  const box =
    document.getElementById(
      "qrCodeBox"
    );


  if (!box) {

    toast(
      "QR code is not ready."
    );

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
      `${currentStudent?.id || "student"}_QR.png`;


    link.href =
      canvas.toDataURL(
        "image/png"
      );


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();


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
      `${currentStudent?.id || "student"}_QR.png`;


    link.href =
      image.src;


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();


    return;
  }


  toast(
    "QR code image is not ready."
  );
}


/* ============================================================
   TIME IN
============================================================ */

async function timeIn() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;
  }


  try {

    const existing =
      await getTodayRecord(
        currentStudent.id
      );


    if (existing?.time_in) {

      toast(
        `Already checked in at ${existing.time_in}.`
      );

      return;
    }


    const record = {

      date:
        today(),

      student_id:
        currentStudent.id,

      student_name:
        currentStudent.name,

      level:
        currentStudent.level || "",

      section:
        currentStudent.section || "",

      time_in:
        currentTime(),

      time_out:
        null,

      pickup_person:
        "",

      pickup_relationship:
        "",

      pickup_phone:
        "",

      pickup_option:
        "",

      staff:
        "Staff",

      approver:
        "",

      notes:
        ""

    };


    const {
      error
    } =
      await supabaseClient
        .from("attendance")
        .insert(
          record
        );


    if (error) {

      showSupabaseError(
        error,
        "Unable to save Time In."
      );

      return;
    }


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


/* ============================================================
   OPEN PICKUP
============================================================ */

async function openPickup() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;
  }


  const record =
    await getTodayRecord(
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
      `Student already picked up at ${record.time_out}.`
    );

    return;
  }


  selectedPickup =
    null;


  const authorized =
    Array.isArray(
      currentStudent.authorized
    )
      ? currentStudent.authorized
      : [];


  const card =
    document.getElementById(
      "pickupCard"
    );


  card.innerHTML = `

    <h2>
      🚗 Pickup / Time Out
    </h2>


    <p class="muted">
      Student
    </p>

    <h3>
      ${escapeHtml(
        currentStudent.name
      )}
    </h3>

    <p class="student-id">
      ${escapeHtml(
        currentStudent.id
      )}
    </p>


    <hr>


    <h3>
      Authorized Pickup Person
    </h3>


    <p class="muted">
      Select the person collecting the student.
    </p>


    <div
      class="option-grid"
      id="authorizedOptions"
    >

      ${
        authorized.length

          ?

          authorized
            .map(
              (person, index) => `

                <div
                  class="option"
                  data-auth-index="${index}"
                >

                  <strong>
                    ${escapeHtml(
                      person.name
                    )}
                  </strong>

                  <br>

                  <span class="muted">

                    ${escapeHtml(
                      person.relationship ||
                      ""
                    )}

                    ${
                      person.phone
                        ? ` • ${escapeHtml(
                            person.phone
                          )}`
                        : ""
                    }

                  </span>

                </div>

              `
            )
            .join("")

          :

          `
            <div class="message warning">

              No authorized pickup
              people registered.

            </div>
          `
      }

    </div>


    <label>
      Pickup / Release Option
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
        Emergency / Parent Confirmation
      </option>

      <option value="OTHER_APPROVAL">
        Other — Admin Approval
      </option>

    </select>


    <div
      id="unauthorizedFields"
    ></div>


    <div
      class="row"
      style="margin-top:20px"
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


  document
    .querySelectorAll(
      "[data-auth-index]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          () => {

            const index =
              Number(
                element.dataset.authIndex
              );


            selectAuth(
              authorized[index]
            );


            document
              .querySelectorAll(
                "[data-auth-index]"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "selected"
                  )
              );


            element.classList.add(
              "selected"
            );

          }
        );

      }
    );


  show("pickup");
}


/* ============================================================
   SELECT AUTHORIZED PICKUP
============================================================ */

function selectAuth(
  person
) {

  if (!person)
    return;


  selectedPickup = {

    name:
      person.name,

    relationship:
      person.relationship ||
      "",

    phone:
      person.phone ||
      "",

    option:
      "AUTHORIZED"

  };


  const select =
    document.getElementById(
      "pickupOption"
    );


  if (select)
    select.value =
      "AUTHORIZED";


  const fields =
    document.getElementById(
      "unauthorizedFields"
    );


  if (fields)
    fields.innerHTML =
      "";

}


/* ============================================================
   PICKUP OPTION CHANGED
============================================================ */

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
    !value ||
    value === "AUTHORIZED"
  ) {

    fields.innerHTML =
      "";

    selectedPickup =
      null;

    return;
  }


  selectedPickup =
    null;


  fields.innerHTML = `

    <div class="message warning">

      <strong>
        ⚠ ADMIN APPROVAL REQUIRED
      </strong>

      <br><br>

      Do not release the student
      until an authorized staff member
      approves this request.

    </div>


    <label>
      Pickup Person Full Name *
    </label>

    <input
      id="upName"
      placeholder="Full name">


    <label>
      Relationship
    </label>

    <input
      id="upRel"
      placeholder="Example: Aunt, Grandparent">


    <label>
      Contact Number
    </label>

    <input
      id="upPhone"
      placeholder="Phone number">


    <label>
      Car Plate Number
      <span
        class="muted"
        style="font-weight:normal"
      >
        (Optional)
      </span>
    </label>

    <input
      id="upPlate"
      placeholder="Example: LA-1234">


    <label>
      Reason / Notes
    </label>

    <textarea
      id="upReason"
      rows="3"
      placeholder="Explain why this person is picking up the student."
    ></textarea>


    <label>
      Approving Staff *
    </label>

    <input
      id="approver"
      placeholder="Admin / authorized staff name">

  `;
}


/* ============================================================
   CONFIRM PICKUP
============================================================ */

async function confirmPickup() {

  if (!currentStudent) {

    toast(
      "No student selected."
    );

    return;
  }


  const option =
    document.getElementById(
      "pickupOption"
    )?.value ||
    "";


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


    const plate =
      document
        .getElementById(
          "upPlate"
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
        "Pickup person's name is required."
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


  try {

    const record =
      await getTodayRecord(
        currentStudent.id
      );


    if (!record?.time_in) {

      toast(
        "No TIME IN record."
      );

      return;
    }


    if (record.time_out) {

      toast(
        "Student has already been picked up."
      );

      return;
    }


    const updateData = {

      time_out:
        currentTime(),

      pickup_person:
        pickup.name || "",

      pickup_relationship:
        pickup.relationship || "",

      pickup_phone:
        pickup.phone || "",

      pickup_option:
        option,

      approver:
        pickup.approver || "",

      notes:
        pickup.reason || ""

    };


    /*
      Plate number is stored inside notes
      if your current attendance table does
      not yet have a dedicated plate_number
      column.

      This lets us use the existing table
      without another SQL change.
    */

    if (pickup.plate) {

      updateData.notes =
        `Plate: ${pickup.plate}` +
        (
          pickup.reason
            ? ` | ${pickup.reason}`
            : ""
        );

    }


    const {
      error
    } =
      await supabaseClient
        .from("attendance")
        .update(
          updateData
        )
        .eq(
          "id",
          record.id
        );


    if (error) {

      showSupabaseError(
        error,
        "Unable to save pickup."
      );

      return;
    }


    toast(
      "PICKUP SUCCESSFUL"
    );


    selectedPickup =
      null;


    await refreshDashboard();


    show("home");


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


/* ============================================================
   QR SCANNER
============================================================ */

async function startScanner() {

  if (
    typeof Html5Qrcode ===
    "undefined"
  ) {

    toast(
      "QR scanner library did not load."
    );

    return;
  }


  if (scannerRunning) {

    toast(
      "Scanner is already running."
    );

    return;
  }


  const reader =
    document.getElementById(
      "reader"
    );


  if (!reader)
    return;


  reader.innerHTML =
    "";


  qrScanner =
    new Html5Qrcode(
      "reader"
    );


  const config = {

    fps: 10,

    qrbox: {
      width: 250,
      height: 250
    },

    aspectRatio: 1.0

  };


  try {

    await qrScanner.start(

      {
        facingMode:
          "environment"
      },

      config,

      decodedText => {

        if (
          !decodedText ||
          !scannerRunning
        )
          return;


        handleScan(
          decodedText
        );

      },

      () => {}

    );


    scannerRunning =
      true;


    document.getElementById(
      "scanMessage"
    ).innerHTML = `

      <div class="message success">

        Camera is ready.

        <br>

        Point it at the student's QR code.

      </div>

    `;


  } catch (error) {

    console.error(
      "Camera error:",
      error
    );


    scannerRunning =
      false;


    document.getElementById(
      "scanMessage"
    ).innerHTML = `

      <div class="message warning">

        <strong>
          Camera could not start.
        </strong>

        <br><br>

        Please allow camera permission
        in Chrome and try again.

      </div>

    `;


    try {

      await qrScanner.clear();

    } catch (_) {}


    qrScanner =
      null;

  }
}


/* ============================================================
   STOP SCANNER
============================================================ */

async function stopScanner() {

  if (!qrScanner) {

    scannerRunning =
      false;

    return;

  }


  try {

    if (scannerRunning) {

      await qrScanner.stop();

    }

  } catch (error) {

    console.warn(
      "Scanner stop:",
      error
    );

  }


  try {

    await qrScanner.clear();

  } catch (_) {}


  qrScanner =
    null;

  scannerRunning =
    false;
}


/* ============================================================
   HANDLE QR SCAN
============================================================ */

async function handleScan(
  raw
) {

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


  await stopScanner();


  await viewStudent(
    id
  );
}


/* ============================================================
   MANUAL OPEN
============================================================ */

function manualOpenStudent() {

  const value =
    document.getElementById(
      "manualId"
    )?.value ||
    "";


  handleScan(
    value
  );
}


/* ============================================================
   REPORTS
============================================================ */

async function renderReport() {

  const container =
    document.getElementById(
      "reportTable"
    );


  if (!container)
    return;


  const rows =
    await loadAllAttendance();


  if (!rows.length) {

    container.innerHTML = `

      <p class="muted">
        No attendance records yet.
      </p>

    `;

    return;
  }


  container.innerHTML = `

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
            Level
          </th>

          <th>
            Time In
          </th>

          <th>
            Time Out
          </th>

          <th>
            Pickup Person
          </th>

          <th>
            Option
          </th>

        </tr>

      </thead>


      <tbody>

        ${rows.map(
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
                    record.student_name
                  )}
                </strong>

                <br>

                <small>
                  ${escapeHtml(
                    record.student_id
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
                  record.time_in || "-"
                )}
              </td>


              <td>
                ${escapeHtml(
                  record.time_out || "-"
                )}
              </td>


              <td>
                ${escapeHtml(
                  record.pickup_person || "-"
                )}
              </td>


              <td>
                ${escapeHtml(
                  record.pickup_option || "-"
                )}
              </td>

            </tr>

          `
        ).join("")}

      </tbody>

    </table>

  `;
}


/* ============================================================
   EXPORT CSV
============================================================ */

async function exportCSV() {

  const rows =
    await loadAllAttendance();


  if (!rows.length) {

    toast(
      "There are no attendance records to export."
    );

    return;
  }


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


  const fields = [

    "date",

    "student_id",

    "student_name",

    "level",

    "section",

    "time_in",

    "time_out",

    "pickup_person",

    "pickup_relationship",

    "pickup_phone",

    "pickup_option",

    "staff",

    "approver",

    "notes"

  ];


  const lines = [

    headers
      .map(csv)
      .join(","),

    ...rows.map(
      row =>
        fields
          .map(
            field =>
              csv(
                row[field]
              )
          )
          .join(",")
    )

  ];


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
    `vision_school_attendance_${today()}.csv`;


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
}


/* ============================================================
   AUTOMATIC MULTI-DEVICE REFRESH
============================================================ */

async function refreshSharedData() {

  try {

    await loadStudents();

    await loadTodayAttendance();


    const activeScreen =
      document.querySelector(
        ".screen.active"
      )?.id;


    if (
      activeScreen ===
      "students"
    ) {

      await renderStudents();

    }


    if (
      activeScreen ===
      "home"
    ) {

      await refreshDashboard();

    }


    if (
      activeScreen ===
      "reports"
    ) {

      await renderReport();

    }


    if (
      currentStudent
    ) {

      const updatedStudent =
        studentsCache.find(
          student =>
            student.id ===
            currentStudent.id
        );


      if (updatedStudent) {

        currentStudent =
          updatedStudent;


        if (
          activeScreen ===
          "student"
        ) {

          await renderStudent(
            updatedStudent
          );

        }

      }

    }

  } catch (error) {

    console.error(
      "Shared refresh error:",
      error
    );

  }
}


/* ============================================================
   SUPABASE REALTIME
============================================================ */

function startRealtime() {

  try {

    supabaseClient
      .channel(
        "vision-school-live"
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "students"
        },
        async () => {

          await refreshSharedData();

        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance"
        },
        async () => {

          await refreshSharedData();

        }
      )

      .subscribe(
        status => {

          console.log(
            "Realtime status:",
            status
          );

        }
      );


  } catch (error) {

    console.warn(
      "Realtime could not start:",
      error
    );

  }
}


/* ============================================================
   STARTUP
============================================================ */

async function startApplication() {

  updateConnectionStatus();


  await refreshDashboard();


  await renderStudents();


  startRealtime();


  /*
    Backup refresh every 8 seconds.

    This means the phone will still receive
    changes even if Realtime has not been
    enabled in the Supabase publication.
  */

  refreshTimer =
    setInterval(
      refreshSharedData,
      8000
    );


  console.log(
    "Vision School multi-device application started."
  );
}


/* ============================================================
   ONLINE / OFFLINE
============================================================ */

window.addEventListener(
  "online",
  () => {

    updateConnectionStatus();

    refreshSharedData();

  }
);


window.addEventListener(
  "offline",
  () => {

    updateConnectionStatus();

  }
);


/* ============================================================
   GLOBAL FUNCTIONS
============================================================ */

window.show =
  show;

window.startScanner =
  startScanner;

window.stopScanner =
  stopScanner;

window.handleScan =
  handleScan;

window.manualOpenStudent =
  manualOpenStudent;

window.addStudent =
  addStudent;

window.clearStudentForm =
  clearStudentForm;

window.addPickupPersonField =
  addPickupPersonField;

window.renderStudents =
  renderStudents;

window.viewStudent =
  viewStudent;

window.deleteStudent =
  deleteStudent;

window.generateStudentQR =
  generateStudentQR;

window.closeQRModal =
  closeQRModal;

window.downloadStudentQR =
  downloadStudentQR;

window.timeIn =
  timeIn;

window.openPickup =
  openPickup;

window.selectAuth =
  selectAuth;

window.optionChanged =
  optionChanged;

window.confirmPickup =
  confirmPickup;

window.exportCSV =
  exportCSV;

window.refreshDashboard =
  refreshDashboard;


/* ============================================================
   START
============================================================ */

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
