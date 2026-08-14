/* =========================================================
   VISION SCHOOL
   STUDENT QR ATTENDANCE + PICKUP SYSTEM

   SUPABASE TABLES

   students:
   id
   name
   level
   parent
   phone
   authorized
   created_at

   attendance:
   id
   student_id
   student_name
   date
   time_in
   time_out
   pickup_person
   Pickup_relationship
   pickup_phone
   pickup_option
   approver
   notes
   created_at

   IMPORTANT:
   The students.parent field supports up to 3 people.

   Example:
   Mother: Maria | Father: John | Aunt: Anna

   ========================================================= */


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL =
  "https://ymonpeujmhaymkxfmmtq.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

const supabaseClient =
  window.supabase.createClient(
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
   START APPLICATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

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
  }
);


/* =========================================================
   CLOCK - VIENTIANE
   ========================================================= */

function initializeClock() {

  updateClock();

  setInterval(
    updateClock,
    1000
  );
}


function updateClock() {

  const now = new Date();

  const time =
    now.toLocaleTimeString(
      "en-US",
      {
        timeZone: "Asia/Vientiane",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }
    );

  const date =
    now.toLocaleDateString(
      "en-US",
      {
        timeZone: "Asia/Vientiane",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );

  const shortDate =
    now.toLocaleDateString(
      "en-US",
      {
        timeZone: "Asia/Vientiane",
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
      }
    );

  const clock =
    document.getElementById(
      "liveTime"
    );

  const dateElement =
    document.getElementById(
      "liveDate"
    );

  const dashboardDate =
    document.getElementById(
      "dashboardDate"
    );

  if (clock) {
    clock.textContent = time;
  }

  if (dateElement) {
    dateElement.textContent = date;
  }

  if (dashboardDate) {
    dashboardDate.textContent =
      shortDate;
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function initializeNavigation() {

  document
    .querySelectorAll("[data-section]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showSection(
            button.dataset.section
          );

        }
      );

    });
}


function showSection(sectionId) {

  document
    .querySelectorAll(".page-section")
    .forEach(section => {

      section.classList.remove(
        "active"
      );

    });


  const section =
    document.getElementById(
      sectionId
    );


  if (section) {

    section.classList.add(
      "active"
    );

  }


  document
    .querySelectorAll(".nav-item")
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.section ===
          sectionId
      );

    });


  const titles = {

    dashboard: [
      "Dashboard",
      "Student attendance overview"
    ],

    students: [
      "Students",
      "Manage Vision School students"
    ],

    scanner: [
      "QR Scanner",
      "Scan student QR codes"
    ],

    attendance: [
      "Attendance",
      "Today's attendance records"
    ],

    reports: [
      "Reports",
      "Attendance reports and exports"
    ]

  };


  const title =
    titles[sectionId] ||
    titles.dashboard;


  const pageTitle =
    document.getElementById(
      "pageTitle"
    );

  const pageSubtitle =
    document.getElementById(
      "pageSubtitle"
    );


  if (pageTitle) {
    pageTitle.textContent =
      title[0];
  }


  if (pageSubtitle) {
    pageSubtitle.textContent =
      title[1];
  }


  if (sectionId === "students") {

    renderStudents();

  }


  if (sectionId === "attendance") {

    renderAttendance();

  }

}


/* =========================================================
   MOBILE MENU
   ========================================================= */

function initializeMobileMenu() {

  const menu =
    document.getElementById(
      "mobileMenu"
    );

  const sidebar =
    document.getElementById(
      "sidebar"
    );


  if (menu && sidebar) {

    menu.addEventListener(
      "click",
      () => {

        sidebar.classList.toggle(
          "open"
        );

      }
    );

  }


  document
    .querySelectorAll(".nav-item")
    .forEach(item => {

      item.addEventListener(
        "click",
        () => {

          sidebar?.classList.remove(
            "open"
          );

        }
      );

    });

}


/* =========================================================
   SUPABASE CONNECTION
   ========================================================= */

async function checkSupabaseConnection() {

  const dot =
    document.getElementById(
      "connectionDot"
    );

  const text =
    document.getElementById(
      "connectionText"
    );


  try {

    const {
      error
    } =
      await supabaseClient
        .from("students")
        .select("id")
        .limit(1);


    if (error) {
      throw error;
    }


    dot?.classList.add(
      "connected"
    );

    dot?.classList.remove(
      "offline"
    );


    if (text) {
      text.textContent =
        "Connected";
    }


  } catch (error) {

    console.error(
      "Supabase connection error:",
      error
    );


    dot?.classList.remove(
      "connected"
    );

    dot?.classList.add(
      "offline"
    );


    if (text) {
      text.textContent =
        "Connection Error";
    }


    showToast(
      "Supabase connection failed. Check your publishable key.",
      "error"
    );

  }

}


/* =========================================================
   STUDENTS
   ========================================================= */

async function loadStudents() {

  try {

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
      throw error;
    }


    students =
      data || [];


    const total =
      document.getElementById(
        "totalStudents"
      );


    if (total) {
      total.textContent =
        students.length;
    }


    populateLevelFilter();

    renderStudents();


  } catch (error) {

    console.error(
      "Unable to load students:",
      error
    );


    showToast(
      "Unable to load students.",
      "error"
    );

  }

}


/* =========================================================
   LEVEL FILTER
   ========================================================= */

function populateLevelFilter() {

  const filter =
    document.getElementById(
      "levelFilter"
    );


  if (!filter) {
    return;
  }


  const currentValue =
    filter.value;


  const levels =
    [
      ...new Set(
        students
          .map(
            student =>
              student.level
          )
          .filter(Boolean)
      )
    ].sort();


  filter.innerHTML =
    `<option value="">All Levels</option>`;


  levels.forEach(level => {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      level;

    option.textContent =
      level;


    filter.appendChild(
      option
    );

  });


  filter.value =
    currentValue;

}


/* =========================================================
   PARENT / GUARDIAN PARSER
   =========================================================

   Supported:

   Mother: Maria | Father: John | Aunt: Anna

   OR

   Maria | John | Anna

   OR

   Maria, John, Anna

   ========================================================= */

function getParentOptions(parentValue) {

  if (!parentValue) {
    return [];
  }


  let value =
    String(parentValue).trim();


  let parts = [];


  if (value.includes("|")) {

    parts =
      value
        .split("|")
        .map(item => item.trim())
        .filter(Boolean);

  } else {

    parts =
      value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

  }


  return parts
    .slice(0, 3)
    .map((item, index) => {

      let label =
        item;

      let name =
        item;

      if (item.includes(":")) {

        const split =
          item.split(":");

        label =
          split[0].trim();

        name =
          split
            .slice(1)
            .join(":")
            .trim();

      }


      return {

        index: index + 1,

        label:
          label ||
          `Parent / Guardian ${index + 1}`,

        name:
          name ||
          item

      };

    });

}


/* =========================================================
   STUDENT TABLE
   ========================================================= */

function renderStudents() {

  const body =
    document.getElementById(
      "studentsBody"
    );


  if (!body) {
    return;
  }


  const search =
    document
      .getElementById(
        "studentSearch"
      )
      ?.value
      ?.toLowerCase()
      ?.trim() || "";


  const level =
    document
      .getElementById(
        "levelFilter"
      )
      ?.value || "";


  const filtered =
    students.filter(
      student => {

        const searchable = [

          student.id,
          student.name,
          student.level,
          student.parent,
          student.phone

        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


        return (

          (!search ||
            searchable.includes(
              search
            ))

          &&

          (!level ||
            student.level ===
              level)

        );

      }
    );


  if (!filtered.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="9"
          class="empty-state"
        >

          No students found.

        </td>

      </tr>

    `;

    return;

  }


  body.innerHTML =
    filtered
      .map(student => {

        const authorized =
          student.authorized !== false;


        const parents =
          getParentOptions(
            student.parent
          );


        const parentDisplay =
          parents.length
            ? parents
                .map(
                  parent =>
                    `${escapeHtml(
                      parent.name
                    )}`
                )
                .join("<br>")
            : "-";


        return `

          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  student.id
                )}
              </strong>
            </td>


            <td>
              ${escapeHtml(
                student.name
              )}
            </td>


            <td>
              ${escapeHtml(
                student.level ||
                  "-"
              )}
            </td>


            <td>
              ${parentDisplay}
            </td>


            <td>
              ${escapeHtml(
                student.phone ||
                  "-"
              )}
            </td>


            <td>

              <span
                class="status ${
                  authorized
                    ? "authorized"
                    : "not-authorized"
                }"
              >

                ${
                  authorized
                    ? "Authorized"
                    : "Not Authorized"
                }

              </span>

            </td>


            <td>

              <button
                class="small-button view-student"
                data-id="${escapeAttribute(
                  student.id
                )}"
              >
                View
              </button>


              <button
                class="small-button edit-student"
                data-id="${escapeAttribute(
                  student.id
                )}"
              >
                Edit
              </button>


              <button
                class="small-button generate-qr"
                data-id="${escapeAttribute(
                  student.id
                )}"
              >
                QR
              </button>


              <button
                class="small-button remove-student"
                data-id="${escapeAttribute(
                  student.id
                )}"
                style="color:#dc2626"
              >
                Remove
              </button>

            </td>

          </tr>

        `;

      })
      .join("");


  /* VIEW */

  body
    .querySelectorAll(
      ".view-student"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const student =
            findStudent(
              button.dataset.id
            );


          if (student) {

            showStudentProfile(
              student
            );

          }

        }
      );

    });


  /* EDIT */

  body
    .querySelectorAll(
      ".edit-student"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const student =
            findStudent(
              button.dataset.id
            );


          if (student) {

            editStudent(
              student
            );

          }

        }
      );

    });


  /* QR */

  body
    .querySelectorAll(
      ".generate-qr"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const student =
            findStudent(
              button.dataset.id
            );


          if (student) {

            showStudentQr(
              student
            );

          }

        }
      );

    });


  /* REMOVE */

  body
    .querySelectorAll(
      ".remove-student"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const student =
            findStudent(
              button.dataset.id
            );


          if (student) {

            removeStudent(
              student
            );

          }

        }
      );

    });

}


/* =========================================================
   FIND STUDENT
   ========================================================= */

function findStudent(id) {

  return students.find(
    student =>
      String(student.id)
        .trim()
        .toLowerCase() ===
      String(id)
        .trim()
        .toLowerCase()
  );

}


/* =========================================================
   REMOVE STUDENT
   ========================================================= */

async function removeStudent(
  student
) {

  const confirmed =
    window.confirm(
      `Remove ${student.name} from the student list?\n\nThis will NOT automatically delete attendance records.`
    );


  if (!confirmed) {
    return;
  }


  try {

    const {
      error
    } =
      await supabaseClient
        .from("students")
        .delete()
        .eq(
          "id",
          student.id
        );


    if (error) {
      throw error;
    }


    showToast(
      `${student.name} has been removed.`,
      "success"
    );


    await loadStudents();


  } catch (error) {

    console.error(
      "Remove student error:",
      error
    );


    showToast(
      "Unable to remove student.",
      "error"
    );

  }

}


/* =========================================================
   STUDENT MODAL
   ========================================================= */

function initializeStudentModal() {

  document
    .getElementById(
      "addStudentButton"
    )
    ?.addEventListener(
      "click",
      () => {

        resetStudentForm();


        document
          .getElementById(
            "studentModal"
          )
          ?.classList.add(
            "show"
          );

      }
    );


  document
    .getElementById(
      "studentForm"
    )
    ?.addEventListener(
      "submit",
      saveStudent
    );

}


/* =========================================================
   RESET STUDENT FORM
   ========================================================= */

function resetStudentForm() {

  const form =
    document.getElementById(
      "studentForm"
    );


  if (form) {
    form.reset();
  }


  const authorized =
    document.getElementById(
      "studentAuthorized"
    );


  if (authorized) {

    authorized.checked =
      true;

  }


  const id =
    document.getElementById(
      "studentId"
    );


  if (id) {

    id.disabled =
      false;

  }


  const title =
    document.querySelector(
      "#studentModal .modal-header h2"
    );


  if (title) {

    title.textContent =
      "Add Student";

  }


  const submit =
    document.querySelector(
      "#studentForm button[type='submit']"
    );


  if (submit) {

    submit.textContent =
      "Save Student";

  }


  currentStudent =
    null;

}


/* =========================================================
   EDIT STUDENT
   ========================================================= */

function editStudent(
  student
) {

  currentStudent =
    student;


  const modal =
    document.getElementById(
      "studentModal"
    );


  const id =
    document.getElementById(
      "studentId"
    );

  const name =
    document.getElementById(
      "studentName"
    );

  const level =
    document.getElementById(
      "studentLevel"
    );

  const parent =
    document.getElementById(
      "studentParent"
    );

  const phone =
    document.getElementById(
      "studentPhone"
    );

  const authorized =
    document.getElementById(
      "studentAuthorized"
    );


  if (id) {
    id.value =
      student.id || "";
  }


  if (name) {
    name.value =
      student.name || "";
  }


  if (level) {
    level.value =
      student.level || "";
  }


  if (parent) {
    parent.value =
      student.parent || "";
  }


  if (phone) {
    phone.value =
      student.phone || "";
  }


  if (authorized) {
    authorized.checked =
      student.authorized !== false;
  }


  const title =
    document.querySelector(
      "#studentModal .modal-header h2"
    );


  if (title) {

    title.textContent =
      "Edit Student";

  }


  const submit =
    document.querySelector(
      "#studentForm button[type='submit']"
    );


  if (submit) {

    submit.textContent =
      "Update Student";

  }


  if (id) {

    id.disabled =
      true;

  }


  modal?.classList.add(
    "show"
  );

}


/* =========================================================
   SAVE STUDENT
   ========================================================= */

async function saveStudent(
  event
) {

  event.preventDefault();


  const id =
    document
      .getElementById(
        "studentId"
      )
      .value
      .trim();


  const name =
    document
      .getElementById(
        "studentName"
      )
      .value
      .trim();


  const level =
    document
      .getElementById(
        "studentLevel"
      )
      .value
      .trim();


  const parent =
    document
      .getElementById(
        "studentParent"
      )
      .value
      .trim();


  const phone =
    document
      .getElementById(
        "studentPhone"
      )
      .value
      .trim();


  const authorized =
    document
      .getElementById(
        "studentAuthorized"
      )
      .checked;


  if (!id || !name || !level) {

    showToast(
      "Please complete Student ID, Name and Level.",
      "error"
    );

    return;

  }


  try {

    let result;


    if (currentStudent) {

      result =
        await supabaseClient
          .from("students")
          .update({

            name,
            level,
            parent,
            phone,
            authorized

          })
          .eq(
            "id",
            currentStudent.id
          );

    } else {

      result =
        await supabaseClient
          .from("students")
          .insert({

            id,
            name,
            level,
            parent,
            phone,
            authorized

          });

    }


    if (result.error) {
      throw result.error;
    }


    showToast(
      currentStudent
        ? "Student updated successfully."
        : "Student added successfully.",
      "success"
    );


    closeStudentModal();


    await loadStudents();


  } catch (error) {

    console.error(
      "Student save error:",
      error
    );


    showToast(
      error?.message ||
        "Unable to save student.",
      "error"
    );

  }

}


/* =========================================================
   CLOSE STUDENT MODAL
   ========================================================= */

function closeStudentModal() {

  document
    .getElementById(
      "studentModal"
    )
    ?.classList.remove(
      "show"
    );


  resetStudentForm();

}


/* =========================================================
   STUDENT PROFILE
   ========================================================= */

function showStudentProfile(
  student
) {

  const modal =
    document.getElementById(
      "studentResultModal"
    );


  const result =
    document.getElementById(
      "studentResult"
    );


  if (!modal || !result) {
    return;
  }


  const authorized =
    student.authorized !== false;


  const parents =
    getParentOptions(
      student.parent
    );


  const parentList =
    parents.length
      ? parents
          .map(
            (parent, index) => `
              <div
                style="
                  padding:8px 10px;
                  margin:5px 0;
                  background:#f8fafc;
                  border-radius:8px;
                "
              >
                <strong>
                  ${escapeHtml(
                    parent.label
                  )}
                </strong>
                :
                ${escapeHtml(
                  parent.name
                )}
              </div>
            `
          )
          .join("")
      : "-";


  result.innerHTML = `

    <div class="student-result">

      <div class="result-avatar">
        👨‍🎓
      </div>


      <h2>
        ${escapeHtml(
          student.name
        )}
      </h2>


      <p>
        ${escapeHtml(
          student.level || ""
        )}
      </p>


      <hr>


      <p>
        <strong>
          Student ID:
        </strong>

        ${escapeHtml(
          student.id
        )}
      </p>


      <p>
        <strong>
          Phone:
        </strong>

        ${escapeHtml(
          student.phone || "-"
        )}
      </p>


      <p>
        <strong>
          Pickup Authorization:
        </strong>

        <span
          class="status ${
            authorized
              ? "authorized"
              : "not-authorized"
          }"
        >

          ${
            authorized
              ? "AUTHORIZED"
              : "UNAUTHORIZED"
          }

        </span>

      </p>


      <div
        style="
          text-align:left;
          margin-top:15px;
        "
      >

        <strong>
          Authorized Pickup People:
        </strong>

        ${parentList}

      </div>


      ${
        !authorized
          ? `

            <div
              style="
                margin-top:15px;
                padding:14px;
                background:#fee2e2;
                color:#991b1b;
                border-radius:10px;
                text-align:left;
              "
            >

              <strong>
                ⚠ SECURITY NOTICE
              </strong>

              <p style="margin:6px 0 0">

                This student is currently
                marked as
                <strong>
                  UNAUTHORIZED
                </strong>.
                Staff should verify
                the pickup person carefully
                before releasing the student.

              </p>

            </div>

          `
          : ""
      }


      <div
        class="result-actions"
        style="margin-top:20px"
      >

        <button
          class="time-in-button"
          id="profileEditButton"
        >
          ✏️ Edit
        </button>


        <button
          class="time-out-button"
          id="profileQrButton"
        >
          ▣ QR Code
        </button>

      </div>

    </div>

  `;


  modal.classList.add(
    "show"
  );


  document
    .getElementById(
      "profileEditButton"
    )
    ?.addEventListener(
      "click",
      () => {

        modal.classList.remove(
          "show"
        );

        editStudent(
          student
        );

      }
    );


  document
    .getElementById(
      "profileQrButton"
    )
    ?.addEventListener(
      "click",
      () => {

        modal.classList.remove(
          "show"
        );

        showStudentQr(
          student
        );

      }
    );

}


/* =========================================================
   QR GENERATOR
   ========================================================= */

function showStudentQr(
  student
) {

  const modal =
    document.getElementById(
      "studentResultModal"
    );


  const result =
    document.getElementById(
      "studentResult"
    );


  if (!modal || !result) {
    return;
  }


  result.innerHTML = `

    <div class="student-result">

      <div class="result-avatar">
        👨‍🎓
      </div>


      <h2>
        ${escapeHtml(
          student.name
        )}
      </h2>


      <p>
        ${escapeHtml(
          student.level || ""
        )}
      </p>


      <div
        id="generatedQr"
        style="
          display:flex;
          justify-content:center;
          margin:20px 0;
        "
      >
      </div>


      <p>

        Student ID:

        <strong>
          ${escapeHtml(
            student.id
          )}
        </strong>

      </p>


      <button
        class="primary-button"
        id="downloadQr"
      >
        Download QR
      </button>

    </div>

  `;


  modal.classList.add(
    "show"
  );


  loadQrGenerator(
    () => {

      new QRCode(

        document.getElementById(
          "generatedQr"
        ),

        {

          text:
            String(
              student.id
            ),

          width:
            220,

          height:
            220

        }

      );


      document
        .getElementById(
          "downloadQr"
        )
        ?.addEventListener(
          "click",
          () =>
            downloadQr(
              student
            )
        );

    }
  );

}


/* =========================================================
   LOAD QR LIBRARY
   ========================================================= */

function loadQrGenerator(
  callback
) {

  if (window.QRCode) {

    callback();

    return;

  }


  const script =
    document.createElement(
      "script"
    );


  script.src =
    "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";


  script.onload =
    callback;


  script.onerror =
    () => {

      showToast(
        "QR generator could not load.",
        "error"
      );

    };


  document.head.appendChild(
    script
  );

}


/* =========================================================
   DOWNLOAD QR
   ========================================================= */

function downloadQr(
  student
) {

  const canvas =
    document.querySelector(
      "#generatedQr canvas"
    );


  const image =
    document.querySelector(
      "#generatedQr img"
    );


  const url =
    canvas
      ? canvas.toDataURL(
          "image/png"
        )
      : image?.src;


  if (!url) {

    showToast(
      "QR image is not ready.",
      "error"
    );

    return;

  }


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;


  link.download =
    `${student.id}-QR.png`;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();

}


/* =========================================================
   QR SCANNER
   ========================================================= */

function initializeScanner() {

  document
    .getElementById(
      "startScanner"
    )
    ?.addEventListener(
      "click",
      startScanner
    );


  document
    .getElementById(
      "stopScanner"
    )
    ?.addEventListener(
      "click",
      stopScanner
    );


  document
    .getElementById(
      "manualSearchButton"
    )
    ?.addEventListener(
      "click",
      manualStudentSearch
    );

}


/* =========================================================
   START SCANNER
   ========================================================= */

async function startScanner() {

  if (
    typeof Html5Qrcode ===
    "undefined"
  ) {

    showToast(
      "QR scanner is still loading. Try again.",
      "error"
    );

    return;

  }


  if (scannerRunning) {
    return;
  }


  try {

    html5QrCode =
      new Html5Qrcode(
        "reader"
      );


    await html5QrCode.start(

      {
        facingMode:
          "environment"
      },

      {
        fps:
          10,

        qrbox:
          {
            width:
              250,

            height:
              250
          }
      },

      decodedText => {

        handleQrScan(
          decodedText
        );

      },

      () => {}

    );


    scannerRunning =
      true;


    showToast(
      "Camera started.",
      "success"
    );


  } catch (error) {

    console.error(
      "Scanner error:",
      error
    );


    showToast(
      "Unable to start camera. Check camera permission.",
      "error"
    );

  }

}


/* =========================================================
   STOP SCANNER
   ========================================================= */

async function stopScanner() {

  if (
    !html5QrCode ||
    !scannerRunning
  ) {

    return;

  }


  try {

    await html5QrCode.stop();

    html5QrCode.clear();

    scannerRunning =
      false;


  } catch (error) {

    console.error(
      "Scanner stop error:",
      error
    );

  }

}


/* =========================================================
   QR SCAN
   ========================================================= */

async function handleQrScan(
  decodedText
) {

  await stopScanner();


  const id =
    String(
      decodedText
    ).trim();


  const student =
    findStudent(
      id
    );


  if (!student) {

    showToast(
      `Student ID "${id}" was not found.`,
      "error"
    );

    return;

  }


  await loadTodayAttendance();


  showAttendanceAction(
    student
  );

}


/* =========================================================
   MANUAL STUDENT SEARCH
   ========================================================= */

function manualStudentSearch() {

  const input =
    document.getElementById(
      "manualStudentId"
    );


  const id =
    input?.value.trim();


  if (!id) {

    showToast(
      "Enter a Student ID.",
      "error"
    );

    return;

  }


  const student =
    findStudent(
      id
    );


  if (!student) {

    showToast(
      "Student not found.",
      "error"
    );

    return;

  }


  showAttendanceAction(
    student
  );

}


/* =========================================================
   DATE
   ========================================================= */

function getVientianeDate() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Vientiane",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit"
      }
    ).formatToParts(
      new Date()
    );


  const map = {};


  parts.forEach(
    part => {

      if (
        part.type !==
        "literal"
      ) {

        map[
          part.type
        ] =
          part.value;

      }

    }
  );


  return `${map.year}-${map.month}-${map.day}`;

}


/* =========================================================
   TIME FORMAT
   ========================================================= */

function formatTime(
  value
) {

  if (!value) {
    return "-";
  }


  return new Date(
    value
  ).toLocaleTimeString(
    "en-US",
    {
      timeZone:
        "Asia/Vientiane",
      hour:
        "2-digit",
      minute:
        "2-digit",
      second:
        "2-digit",
      hour12:
        true
    }
  );

}


/* =========================================================
   ATTENDANCE ACTION
   ========================================================= */

function showAttendanceAction(
  student
) {

  const modal =
    document.getElementById(
      "studentResultModal"
    );


  const result =
    document.getElementById(
      "studentResult"
    );


  if (!modal || !result) {
    return;
  }


  const record =
    attendanceRecords.find(
      item =>
        String(
          item.student_id
        ) ===
        String(
          student.id
        )
    );


  const authorized =
    student.authorized !== false;


  const parents =
    getParentOptions(
      student.parent
    );


  const parentList =
    parents.length
      ? parents
          .map(
            parent =>
              `<li>
                ${escapeHtml(
                  parent.label
                )}:
                <strong>
                  ${escapeHtml(
                    parent.name
                  )}
                </strong>
              </li>`
          )
          .join("")
      : "<li>No authorized person listed.</li>";


  result.innerHTML = `

    <div class="student-result">

      <div class="result-avatar">
        👨‍🎓
      </div>


      <h2>
        ${escapeHtml(
          student.name
        )}
      </h2>


      <p>
        ${escapeHtml(
          student.level || ""
        )}
      </p>


      <p>
        Student ID:
        <strong>
          ${escapeHtml(
            student.id
          )}
        </strong>
      </p>


      <div
        style="
          text-align:left;
          margin:15px 0;
          padding:12px;
          background:#f8fafc;
          border-radius:10px;
        "
      >

        <strong>
          Pickup Authorization
        </strong>


        <div
          style="margin-top:6px"
        >

          <span
            class="status ${
              authorized
                ? "authorized"
                : "not-authorized"
            }"
          >

            ${
              authorized
                ? "AUTHORIZED"
                : "UNAUTHORIZED"
            }

          </span>

        </div>


        <div
          style="
            margin-top:10px;
          "
        >

          <strong>
            Registered Pickup People:
          </strong>


          <ul
            style="
              margin:7px 0;
              padding-left:20px;
            "
          >

            ${parentList}

          </ul>

        </div>

      </div>


      ${
        !authorized
          ? `

            <div
              style="
                padding:14px;
                background:#fee2e2;
                border:1px solid #fecaca;
                color:#991b1b;
                border-radius:10px;
                text-align:left;
                margin-bottom:15px;
              "
            >

              <strong>
                ⚠ UNAUTHORIZED STUDENT
              </strong>

              <p
                style="
                  margin:6px 0 0;
                "
              >

                This student is marked
                <strong>
                  unauthorized
                </strong>.
                Do not release the student
                without staff verification
                and approval.

              </p>

            </div>

          `
          : ""
      }


      <p>
        Time In:
        <strong>
          ${formatTime(
            record?.time_in
          )}
        </strong>
      </p>


      <p>
        Time Out:
        <strong>
          ${formatTime(
            record?.time_out
          )}
        </strong>
      </p>


      ${
        record?.pickup_person
          ? `

            <div
              style="
                text-align:left;
                margin:15px 0;
                padding:12px;
                background:#ecfdf5;
                border-radius:10px;
              "
            >

              <strong>
                Pickup Information
              </strong>

              <p>
                Person:
                <strong>
                  ${escapeHtml(
                    record.pickup_person
                  )}
                </strong>
              </p>

              <p>
                Relationship:
                ${escapeHtml(
                  record.Pickup_relationship ||
                    "-"
                )}
              </p>

              <p>
                Phone:
                ${escapeHtml(
                  record.pickup_phone ||
                    "-"
                )}
              </p>

              <p>
                Option:
                ${escapeHtml(
                  record.pickup_option ||
                    "-"
                )}
              </p>

              <p>
                Approved by:
                ${escapeHtml(
                  record.approver ||
                    "-"
                )}
              </p>

            </div>

          `
          : ""
      }


      <div
        class="result-actions"
      >

        <button
          class="time-in-button"
          id="recordTimeIn"
          ${
            record?.time_in
              ? "disabled"
              : ""
          }
        >
          ✓ Time In
        </button>


        <button
          class="time-out-button"
          id="recordTimeOut"
          ${
            !record?.time_in ||
            record?.time_out
              ? "disabled"
              : ""
          }
        >
          ↗ Time Out
        </button>

      </div>


      ${
        record?.time_in &&
        !record?.time_out
          ? `

            <div
              style="
                margin-top:20px;
              "
            >

              <button
                class="primary-button"
                id="openPickup"
              >
                👤 Select Pickup Person
              </button>

            </div>

          `
          : ""
      }

    </div>

  `;


  modal.classList.add(
    "show"
  );


  document
    .getElementById(
      "recordTimeIn"
    )
    ?.addEventListener(
      "click",
      () =>
        recordTimeIn(
          student
        )
    );


  document
    .getElementById(
      "recordTimeOut"
    )
    ?.addEventListener(
      "click",
      () =>
        recordTimeOut(
          student
        )
    );


  document
    .getElementById(
      "openPickup"
    )
    ?.addEventListener(
      "click",
      () =>
        openPickupForm(
          student
        )
    );

}


/* =========================================================
   TIME IN
   ========================================================= */

async function recordTimeIn(student) {

  console.log("TIME IN clicked:", student);

  try {

    const today = getVientianeDate();

    console.log("Today's date:", today);

    /* Get today's existing record */

    const {
      data: existingRecords,
      error: searchError
    } = await supabaseClient
      .from("attendance")
      .select("*")
      .eq("student_id", student.id)
      .eq("date", today)
      .limit(1);

    if (searchError) {
      throw searchError;
    }

    const existing =
      existingRecords &&
      existingRecords.length
        ? existingRecords[0]
        : null;


    /* Already timed in */

    if (existing?.time_in) {

      showToast(
        "This student already has a Time In today.",
        "error"
      );

      return;
    }


    /* Current time */

    const now =
      new Date().toISOString();


    /* =====================================================
       UPDATE EXISTING RECORD
       ===================================================== */

    if (existing) {

      console.log(
        "Updating existing attendance:",
        existing.id
      );


      const {
        data,
        error
      } = await supabaseClient
        .from("attendance")
        .update({
          time_in: now
        })
        .eq("id", existing.id)
        .select()
        .single();


      if (error) {
        throw error;
      }


      console.log(
        "TIME IN UPDATED:",
        data
      );

    }


    /* =====================================================
       CREATE NEW RECORD
       ===================================================== */

    else {

      const payload = {

        student_id:
          student.id,

        student_name:
          student.name,

        date:
          today,

        time_in:
          now

      };


      console.log(
        "Creating attendance:",
        payload
      );


      const {
        data,
        error
      } = await supabaseClient
        .from("attendance")
        .insert(payload)
        .select()
        .single();


      if (error) {
        throw error;
      }


      console.log(
        "TIME IN CREATED:",
        data
      );

    }


    showToast(
      `${student.name} — Time In recorded successfully.`,
      "success"
    );


    /* Reload today's attendance */

    await loadTodayAttendance();


    /* Close student modal */

    closeResultModal();


  } catch (error) {

    console.error(
      "TIME IN ERROR:",
      error
    );


    showToast(
      `Time In failed: ${
        error?.message ||
        "Unknown error"
      }`,
      "error"
    );

  }

}


/* =========================================================
   TIME OUT
   ========================================================= */

async function recordTimeOut(student) {

  console.log("TIME OUT clicked:", student);

  try {

    const today =
      getVientianeDate();


    console.log(
      "Today's date:",
      today
    );


    /* Find today's attendance */

    const {
      data: existingRecords,
      error: searchError
    } = await supabaseClient
      .from("attendance")
      .select("*")
      .eq("student_id", student.id)
      .eq("date", today)
      .limit(1);


    if (searchError) {
      throw searchError;
    }


    const existing =
      existingRecords &&
      existingRecords.length
        ? existingRecords[0]
        : null;


    /* No attendance record */

    if (!existing) {

      showToast(
        "This student has not been timed in today.",
        "error"
      );

      return;

    }


    /* Time In required */

    if (!existing.time_in) {

      showToast(
        "Time In must be recorded first.",
        "error"
      );

      return;

    }


    /* Already timed out */

    if (existing.time_out) {

      showToast(
        "This student already has a Time Out today.",
        "error"
      );

      return;

    }


    /* Current time */

    const now =
      new Date().toISOString();


    console.log(
      "Recording TIME OUT:",
      now
    );


    /* Update */

    const {
      data,
      error
    } = await supabaseClient
      .from("attendance")
      .update({
        time_out: now
      })
      .eq("id", existing.id)
      .select()
      .single();


    if (error) {
      throw error;
    }


    console.log(
      "TIME OUT SUCCESS:",
      data
    );


    showToast(
      `${student.name} — Time Out recorded successfully.`,
      "success"
    );


    /* Reload attendance */

    await loadTodayAttendance();


    /* Close modal */

    closeResultModal();


  } catch (error) {

    console.error(
      "TIME OUT ERROR:",
      error
    );


    showToast(
      `Time Out failed: ${
        error?.message ||
        "Unknown error"
      }`,
      "error"
    );

  }

}

/* =========================================================
   PICKUP FORM
   ========================================================= */

function openPickupForm(
  student
) {

  const record =
    attendanceRecords.find(
      item =>
        String(
          item.student_id
        ) ===
        String(
          student.id
        )
    );


  if (!record) {

    showToast(
      "Attendance record not found.",
      "error"
    );

    return;

  }


  const result =
    document.getElementById(
      "studentResult"
    );


  const parents =
    getParentOptions(
      student.parent
    );


  const authorized =
    student.authorized !== false;


  const pickupOptions =
    parents.length
      ? parents
          .map(
            (parent, index) => `

              <option
                value="${escapeAttribute(
                  parent.name
                )}"
                data-parent-index="${index}"
              >

                ${escapeHtml(
                  parent.label
                )}
                —
                ${escapeHtml(
                  parent.name
                )}

              </option>

            `
          )
          .join("")
      : "";


  result.innerHTML = `

    <div class="student-result">

      <div class="result-avatar">
        👤
      </div>


      <h2>
        Student Pickup
      </h2>


      <p>
        ${escapeHtml(
          student.name
        )}
      </p>


      ${
        !authorized
          ? `

            <div
              style="
                padding:12px;
                background:#fee2e2;
                color:#991b1b;
                border-radius:10px;
                margin:15px 0;
                text-align:left;
              "
            >

              <strong>
                ⚠ UNAUTHORIZED
              </strong>

              <p
                style="
                  margin:5px 0 0;
                "
              >

                This student is not currently
                authorized for normal pickup.
                Verify carefully before release.

              </p>

            </div>

          `
          : ""
      }


      <div
        style="
          text-align:left;
          margin-top:20px;
        "
      >


        <label>
          <strong>
            Who is picking up the student?
          </strong>
        </label>


        <select
          id="pickupPersonSelect"
          style="
            width:100%;
            padding:12px;
            margin:6px 0 14px;
            border:1px solid #d1d5db;
            border-radius:8px;
            background:white;
          "
        >

          <option value="">
            -- Select Authorized Person --
          </option>

          ${pickupOptions}

          <option value="Other">
            Other / Guest
          </option>

        </select>


        <div
          id="otherPickupContainer"
          style="display:none"
        >

          <label>
            Other / Guest Name
          </label>

          <input
            id="otherPickupName"
            type="text"
            placeholder="Full name"
            style="
              width:100%;
              padding:11px;
              margin:6px 0 14px;
              border:1px solid #d1d5db;
              border-radius:8px;
            "
          >

        </div>


        <label>
          Relationship
        </label>


        <input
          id="pickupRelationshipInput"
          type="text"
          placeholder="Mother, Father, Guardian, Aunt..."
          value="${escapeAttribute(
            record.Pickup_relationship ||
              ""
          )}"
          style="
            width:100%;
            padding:11px;
            margin:6px 0 14px;
            border:1px solid #d1d5db;
            border-radius:8px;
          "
        >


        <label>
          Phone
        </label>


        <input
          id="pickupPhoneInput"
          type="text"
          placeholder="Phone number"
          value="${escapeAttribute(
            record.pickup_phone ||
              ""
          )}"
          style="
            width:100%;
            padding:11px;
            margin:6px 0 14px;
            border:1px solid #d1d5db;
            border-radius:8px;
          "
        >


        <label>
          Pickup Option
        </label>


        <select
          id="pickupOptionInput"
          style="
            width:100%;
            padding:11px;
            margin:6px 0 14px;
            border:1px solid #d1d5db;
            border-radius:8px;
          "
        >

          <option value="">
            Select option
          </option>

          <option value="Parent">
            Parent
          </option>

          <option value="Guardian">
            Guardian
          </option>

          <option value="Authorized Person">
            Authorized Person
          </option>

          <option value="Guest">
            Guest
          </option>

        </select>


        <label>
          Approver / Staff
        </label>


        <input
          id="approverInput"
          type="text"
          placeholder="Staff / Teacher name"
          value="${escapeAttribute(
            record.approver ||
              ""
          )}"
          style="
            width:100%;
            padding:11px;
            margin:6px 0 14px;
            border:1px solid #d1d5db;
            border-radius:8px;
          "
        >


        <label>
          Notes
        </label>


        <textarea
          id="notesInput"
          placeholder="Additional security or pickup notes..."
          style="
            width:100%;
            min-height:80px;
            padding:11px;
            margin:6px 0 14px;
            border:1px solid #d1d5db;
            border-radius:8px;
          "
        >${escapeHtml(
          record.notes || ""
        )}</textarea>


      </div>


      <div
        class="result-actions"
      >

        <button
          class="secondary-button"
          id="cancelPickup"
        >
          Cancel
        </button>


        <button
          class="primary-button"
          id="savePickup"
        >
          Save Pickup
        </button>

      </div>


    </div>

  `;


  /* PERSON SELECT */

  document
    .getElementById(
      "pickupPersonSelect"
    )
    ?.addEventListener(
      "change",
      event => {

        const value =
          event.target.value;


        const otherContainer =
          document.getElementById(
            "otherPickupContainer"
          );


        if (otherContainer) {

          otherContainer.style.display =
            value === "Other"
              ? "block"
              : "none";

        }


        const selected =
          parents.find(
            parent =>
              parent.name ===
              value
          );


        if (
          selected
        ) {

          const relationship =
            document.getElementById(
              "pickupRelationshipInput"
            );


          if (
            relationship &&
            !relationship.value
          ) {

            relationship.value =
              selected.label;

          }

        }

      }
    );


  /* CANCEL */

  document
    .getElementById(
      "cancelPickup"
    )
    ?.addEventListener(
      "click",
      () =>
        showAttendanceAction(
          student
        )
    );


  /* SAVE */

  document
    .getElementById(
      "savePickup"
    )
    ?.addEventListener(
      "click",
      () =>
        savePickup(
          student,
          record
        )
    );

}


/* =========================================================
   SAVE PICKUP
   ========================================================= */

async function savePickup(
  student,
  record
) {

  try {

    const selectedPerson =
      document
        .getElementById(
          "pickupPersonSelect"
        )
        .value;


    const otherName =
      document
        .getElementById(
          "otherPickupName"
        )
        ?.value
        ?.trim() || "";


    if (!selectedPerson) {

      showToast(
        "Please select who is picking up the student.",
        "error"
      );

      return;

    }


    let pickup_person =
      selectedPerson;


    if (
      selectedPerson ===
      "Other"
    ) {

      if (!otherName) {

        showToast(
          "Please enter the guest/pickup person's name.",
          "error"
        );

        return;

      }


      pickup_person =
        otherName;

    }


    const Pickup_relationship =
      document
        .getElementById(
          "pickupRelationshipInput"
        )
        .value
        .trim();


    const pickup_phone =
      document
        .getElementById(
          "pickupPhoneInput"
        )
        .value
        .trim();


    const pickup_option =
      document
        .getElementById(
          "pickupOptionInput"
        )
        .value;


    const approver =
      document
        .getElementById(
          "approverInput"
        )
        .value
        .trim();


    const notes =
      document
        .getElementById(
          "notesInput"
        )
        .value
        .trim();


    if (!pickup_option) {

      showToast(
        "Please select the pickup option.",
        "error"
      );

      return;

    }


    if (!approver) {

      showToast(
        "Please enter the approving staff/teacher.",
        "error"
      );

      return;

    }


    const {
      error
    } =
      await supabaseClient
        .from("attendance")
        .update({

          pickup_person,

          Pickup_relationship,

          pickup_phone,

          pickup_option,

          approver,

          notes

        })
        .eq(
          "id",
          record.id
        );


    if (error) {
      throw error;
    }


    showToast(
      `Pickup saved: ${pickup_person}`,
      "success"
    );


    closeResultModal();


    await loadTodayAttendance();


  } catch (error) {

    console.error(
      "Pickup save error:",
      error
    );


    showToast(
      error?.message ||
        "Unable to save pickup information.",
      "error"
    );

  }

}


/* =========================================================
   LOAD TODAY ATTENDANCE
   ========================================================= */

async function loadTodayAttendance() {

  try {

    const today =
      getVientianeDate();


    console.log(
      "Loading attendance for:",
      today
    );


    const {
      data,
      error
    } =
      await supabaseClient
        .from("attendance")
        .select("*")
        .eq(
          "date",
          today
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    attendanceRecords =
      data || [];


    console.log(
      "Today's attendance:",
      attendanceRecords
    );


    updateAttendanceStats();

    renderAttendance();

    renderDashboardAttendance();


  } catch (error) {

    console.error(
      "Attendance loading error:",
      error
    );


    showToast(
      `Unable to load attendance: ${
        error?.message ||
        "Unknown error"
      }`,
      "error"
    );

  }

}
/* =========================================================
   ATTENDANCE STATS
   ========================================================= */

function updateAttendanceStats() {

  const timeIn =
    attendanceRecords.filter(
      record =>
        record.time_in
    ).length;


  const timeOut =
    attendanceRecords.filter(
      record =>
        record.time_out
    ).length;


  const currentlyIn =
    attendanceRecords.filter(
      record =>
        record.time_in &&
        !record.time_out
    ).length;


  const timeInElement =
    document.getElementById(
      "timeInCount"
    );


  const timeOutElement =
    document.getElementById(
      "timeOutCount"
    );


  const currentElement =
    document.getElementById(
      "currentlyInCount"
    );


  if (timeInElement) {

    timeInElement.textContent =
      timeIn;

  }


  if (timeOutElement) {

    timeOutElement.textContent =
      timeOut;

  }


  if (currentElement) {

    currentElement.textContent =
      currentlyIn;

  }

}


/* =========================================================
   ATTENDANCE TABLE
   ========================================================= */

function renderAttendance() {

  const body =
    document.getElementById(
      "attendanceBody"
    );


  if (!body) {
    return;
  }


  const search =
    document
      .getElementById(
        "attendanceSearch"
      )
      ?.value
      ?.toLowerCase()
      ?.trim() || "";


  const filtered =
    attendanceRecords.filter(
      record => {

        const text = [

          record.student_id,
          record.student_name,
          record.pickup_person,
          record.Pickup_relationship,
          record.pickup_phone,
          record.pickup_option,
          record.approver,
          record.notes

        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


        return (
          !search ||
          text.includes(search)
        );

      }
    );


  if (!filtered.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="empty-state"
        >

          No attendance records today.

        </td>

      </tr>

    `;

    return;

  }


  body.innerHTML =
    filtered
      .map(record => {

        const student =
          findStudent(
            record.student_id
          );


        return `

          <tr>

            <td>

              <strong>
                ${escapeHtml(
                  record.student_name ||
                  record.student_id ||
                  ""
                )}
              </strong>

            </td>


            <td>

              ${escapeHtml(
                student?.level ||
                  "-"
              )}

            </td>


            <td>

              ${formatTime(
                record.time_in
              )}

            </td>


            <td>

              ${formatTime(
                record.time_out
              )}

            </td>


            <td>

              ${escapeHtml(
                record.pickup_person ||
                  "-"
              )}

            </td>


            <td>

              ${escapeHtml(
                record.Pickup_relationship ||
                  "-"
              )}

            </td>


            <td>

              ${escapeHtml(
                record.approver ||
                  "-"
              )}

            </td>


            <td>

              <span
                class="status ${
                  record.time_out
                    ? "out"
                    : "in"
                }"
              >

                ${
                  record.time_out
                    ? "Completed"
                    : "In School"
                }

              </span>

            </td>

          </tr>

        `;

      })
      .join("");

}


/* =========================================================
   DASHBOARD ATTENDANCE
   ========================================================= */

function renderDashboardAttendance() {

  const body =
    document.getElementById(
      "dashboardAttendanceBody"
    );


  if (!body) {
    return;
  }


  const records =
    attendanceRecords.slice(
      0,
      10
    );


  if (!records.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="6"
          class="empty-state"
        >

          No attendance records yet.

        </td>

      </tr>

    `;

    return;

  }


  body.innerHTML =
    records
      .map(record => {

        const student =
          findStudent(
            record.student_id
          );


        return `

          <tr>

            <td>

              ${escapeHtml(
                record.student_name ||
                record.student_id
              )}

            </td>


            <td>

              ${escapeHtml(
                student?.level ||
                  "-"
              )}

            </td>


            <td>

              ${formatTime(
                record.time_in
              )}

            </td>


            <td>

              ${formatTime(
                record.time_out
              )}

            </td>


            <td>

              ${escapeHtml(
                record.pickup_person ||
                  "-"
              )}

            </td>


            <td>

              <span
                class="status ${
                  record.time_out
                    ? "out"
                    : "in"
                }"
              >

                ${
                  record.time_out
                    ? "Completed"
                    : "In School"
                }

              </span>

            </td>

          </tr>

        `;

      })
      .join("");

}


/* =========================================================
   SEARCH
   ========================================================= */

function initializeSearch() {

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
      "levelFilter"
    )
    ?.addEventListener(
      "change",
      renderStudents
    );


  document
    .getElementById(
      "attendanceSearch"
    )
    ?.addEventListener(
      "input",
      renderAttendance
    );


  document
    .getElementById(
      "refreshAttendance"
    )
    ?.addEventListener(
      "click",
      loadTodayAttendance
    );

}


/* =========================================================
   REPORTS / CSV
   ========================================================= */

function initializeReports() {

  document
    .getElementById(
      "exportCsv"
    )
    ?.addEventListener(
      "click",
      exportAttendanceCsv
    );

}


/* =========================================================
   EXPORT ATTENDANCE
   ========================================================= */

function exportAttendanceCsv() {

  if (!attendanceRecords.length) {

    showToast(
      "There are no attendance records to export.",
      "error"
    );

    return;

  }


  const headers = [

    "Date",
    "Student ID",
    "Student Name",
    "Level",
    "Time In",
    "Time Out",
    "Pickup Person",
    "Relationship",
    "Pickup Phone",
    "Pickup Option",
    "Approver",
    "Notes"

  ];


  const rows =
    attendanceRecords.map(
      record => {

        const student =
          findStudent(
            record.student_id
          );


        return [

          record.date ||
            "",

          record.student_id ||
            "",

          record.student_name ||
            "",

          student?.level ||
            "",

          record.time_in
            ? formatTime(
                record.time_in
              )
            : "",

          record.time_out
            ? formatTime(
                record.time_out
              )
            : "",

          record.pickup_person ||
            "",

          record.Pickup_relationship ||
            "",

          record.pickup_phone ||
            "",

          record.pickup_option ||
            "",

          record.approver ||
            "",

          record.notes ||
            ""

        ];

      }
    );


  const csv =
    [

      headers,
      ...rows

    ]

      .map(
        row =>
          row
            .map(
              value =>
                `"${String(
                  value ?? ""
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\n");


  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;"
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
    `Vision-School-Attendance-${getVientianeDate()}.csv`;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  URL.revokeObjectURL(
    url
  );


  showToast(
    "Attendance Excel-compatible file downloaded.",
    "success"
  );

}


/* =========================================================
   REALTIME
   ========================================================= */

function initializeRealtime() {

  if (realtimeChannel) {

    supabaseClient.removeChannel(
      realtimeChannel
    );

  }


  realtimeChannel =
    supabaseClient
      .channel(
        "vision-school-attendance"
      )

      .on(

        "postgres_changes",

        {

          event: "*",

          schema: "public",

          table: "attendance"

        },

        () => {

          loadTodayAttendance();

        }

      )

      .on(

        "postgres_changes",

        {

          event: "*",

          schema: "public",

          table: "students"

        },

        () => {

          loadStudents();

        }

      )

      .subscribe(
        status => {

          console.log(
            "Realtime:",
            status
          );

        }
      );

}


/* =========================================================
   MODAL CLOSING
   ========================================================= */

function initializeModalClosing() {

  document
    .getElementById(
      "closeResultModal"
    )
    ?.addEventListener(
      "click",
      closeResultModal
    );


  document
    .getElementById(
      "closeStudentModal"
    )
    ?.addEventListener(
      "click",
      closeStudentModal
    );


  document
    .getElementById(
      "cancelStudent"
    )
    ?.addEventListener(
      "click",
      closeStudentModal
    );


  document
    .querySelectorAll(
      ".modal"
    )
    .forEach(modal => {

      modal.addEventListener(
        "click",
        event => {

          if (
            event.target ===
            modal
          ) {

            modal.classList.remove(
              "show"
            );

          }

        }
      );

    });

}


/* =========================================================
   CLOSE RESULT MODAL
   ========================================================= */

function closeResultModal() {

  document
    .getElementById(
      "studentResultModal"
    )
    ?.classList.remove(
      "show"
    );

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
  message,
  type = "info"
) {

  const toast =
    document.getElementById(
      "toast"
    );


  if (!toast) {
    return;
  }


  toast.textContent =
    message;


  toast.classList.remove(
    "show"
  );


  toast.classList.remove(
    "success",
    "error",
    "info"
  );


  toast.classList.add(
    type
  );


  clearTimeout(
    toastTimer
  );


  void toast.offsetWidth;


  toast.classList.add(
    "show"
  );


  toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      3500
    );

}


/* =========================================================
   SECURITY / HTML ESCAPING
   ========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   ATTRIBUTE ESCAPING
   ========================================================= */

function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );

}
