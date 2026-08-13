/* =========================================================
   VISION SCHOOL
   Student Attendance + QR Pickup System
========================================================= */


/* =========================================================
   SUPABASE CONFIGURATION
=========================================================

   IMPORTANT:
   Replace the two values below with your existing
   Supabase Project URL and Publishable Key.

   NEVER use the service_role key here.
========================================================= */

const SUPABASE_URL="https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";


/* =========================================================
   SUPABASE CLIENT
========================================================= */

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


/* =========================================================
   GLOBAL VARIABLES
========================================================= */

let students = [];
let attendanceRecords = [];

let html5QrCode = null;
let scannerRunning = false;

let selectedStudent = null;

let realtimeChannel = null;


/* =========================================================
   DOM READY
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  initializeNavigation();

  initializeMobileMenu();

  initializeClock();

  initializeStudentModal();

  initializeScannerControls();

  initializeSearch();

  initializeReportButton();

  await checkSupabaseConnection();

  await loadStudents();

  await loadTodayAttendance();

  initializeRealtime();

});


/* =========================================================
   CLOCK
========================================================= */

function initializeClock() {

  updateClock();

  /*
    This is intentionally started with setInterval.

    It prevents the clock from stopping after page load.
  */

  setInterval(updateClock, 1000);
}


function updateClock() {

  const now = new Date();

  const time = now.toLocaleTimeString(
    "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Vientiane"
    }
  );


  const date = now.toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Vientiane"
    }
  );


  const shortDate = now.toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Asia/Vientiane"
    }
  );


  const liveTime = document.getElementById("liveTime");

  const liveDate = document.getElementById("liveDate");

  const dashboardDate =
    document.getElementById("dashboardDate");


  if (liveTime) {
    liveTime.textContent = time;
  }

  if (liveDate) {
    liveDate.textContent = date;
  }

  if (dashboardDate) {
    dashboardDate.textContent = shortDate;
  }
}


/* =========================================================
   NAVIGATION
========================================================= */

function initializeNavigation() {

  document.querySelectorAll("[data-section]").forEach(button => {

    button.addEventListener("click", () => {

      const section = button.dataset.section;

      showSection(section);

    });

  });

}


function showSection(sectionId) {

  document.querySelectorAll(".page-section")
    .forEach(section => {
      section.classList.remove("active");
    });


  const target = document.getElementById(sectionId);

  if (target) {
    target.classList.add("active");
  }


  document.querySelectorAll(".nav-item")
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.section === sectionId
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
      "Record student attendance"
    ],

    attendance: [
      "Attendance",
      "Today's student attendance records"
    ],

    reports: [
      "Reports",
      "Attendance reports and exports"
    ]

  };


  const data = titles[sectionId] || titles.dashboard;


  document.getElementById("pageTitle").textContent =
    data[0];

  document.getElementById("pageSubtitle").textContent =
    data[1];


  /*
    Automatically load relevant data when opening sections.
  */

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

  const button =
    document.getElementById("mobileMenu");

  const sidebar =
    document.getElementById("sidebar");


  if (!button || !sidebar) {
    return;
  }


  button.addEventListener("click", () => {

    sidebar.classList.toggle("open");

  });


  document.querySelectorAll(".nav-item")
    .forEach(item => {

      item.addEventListener("click", () => {

        sidebar.classList.remove("open");

      });

    });

}


/* =========================================================
   SUPABASE CONNECTION
========================================================= */

async function checkSupabaseConnection() {

  const dot =
    document.getElementById("connectionDot");

  const text =
    document.getElementById("connectionText");


  try {

    const { error } =
      await supabaseClient
        .from("students")
        .select("id")
        .limit(1);


    if (error) {
      throw error;
    }


    dot.classList.add("connected");

    dot.classList.remove("offline");

    text.textContent = "Connected";


  } catch (error) {

    console.error(
      "Supabase connection error:",
      error
    );


    dot.classList.remove("connected");

    dot.classList.add("offline");

    text.textContent = "Connection Error";


    showToast(
      "Supabase connection failed. Check your API key.",
      "error"
    );

  }

}


/* =========================================================
   LOAD STUDENTS
========================================================= */

async function loadStudents() {

  try {

    const { data, error } =
      await supabaseClient
        .from("students")
        .select("*")
        .order("name", {
          ascending: true
        });


    if (error) {
      throw error;
    }


    students = data || [];


    updateStudentStats();

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
   STUDENT STATS
========================================================= */

function updateStudentStats() {

  const element =
    document.getElementById("totalStudents");


  if (element) {
    element.textContent =
      students.length;
  }

}


/* =========================================================
   LEVEL FILTER
========================================================= */

function populateLevelFilter() {

  const select =
    document.getElementById("levelFilter");


  if (!select) {
    return;
  }


  const currentValue =
    select.value;


  const levels = [
    ...new Set(
      students
        .map(student => student.level)
        .filter(Boolean)
    )
  ].sort();


  select.innerHTML =
    `<option value="">All Levels</option>`;


  levels.forEach(level => {

    const option =
      document.createElement("option");

    option.value = level;

    option.textContent = level;

    select.appendChild(option);

  });


  select.value = currentValue;

}


/* =========================================================
   RENDER STUDENTS
========================================================= */

function renderStudents() {

  const body =
    document.getElementById("studentsBody");


  if (!body) {
    return;
  }


  const search =
    (
      document.getElementById("studentSearch")
        ?.value || ""
    )
      .toLowerCase()
      .trim();


  const level =
    document.getElementById("levelFilter")
      ?.value || "";


  const filtered =
    students.filter(student => {

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


      const matchesSearch =
        !search ||
        searchable.includes(search);


      const matchesLevel =
        !level ||
        student.level === level;


      return (
        matchesSearch &&
        matchesLevel
      );

    });


  if (!filtered.length) {

    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          No students found.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    filtered.map(student => {

      const authorized =
        student.authorized !== false;


      return `

        <tr>

          <td>
            <strong>
              ${escapeHtml(student.id || "")}
            </strong>
          </td>

          <td>
            ${escapeHtml(student.name || "")}
          </td>

          <td>
            ${escapeHtml(student.level || "-")}
          </td>

          <td>
            ${escapeHtml(student.parent || "-")}
          </td>

          <td>
            ${escapeHtml(student.phone || "-")}
          </td>

          <td>
            <span class="status ${
              authorized
                ? "authorized"
                : "not-authorized"
            }">
              ${
                authorized
                  ? "Authorized"
                  : "Not Authorized"
              }
            </span>
          </td>

          <td>

            <button
              class="small-button generate-qr"
              data-id="${escapeHtml(student.id || "")}"
            >
              QR
            </button>

          </td>

        </tr>

      `;

    }).join("");


  body.querySelectorAll(".generate-qr")
    .forEach(button => {

      button.addEventListener("click", () => {

        const id =
          button.dataset.id;

        const student =
          students.find(
            item => String(item.id) === String(id)
          );


        if (student) {
          showStudentQr(student);
        }

      });

    });

}


/* =========================================================
   STUDENT MODAL
========================================================= */

function initializeStudentModal() {

  const modal =
    document.getElementById("studentModal");


  const openButton =
    document.getElementById("addStudentButton");


  const closeButton =
    document.getElementById("closeStudentModal");


  const cancelButton =
    document.getElementById("cancelStudent");


  const form =
    document.getElementById("studentForm");


  openButton?.addEventListener(
    "click",
    () => {
      modal.classList.add("show");
    }
  );


  closeButton?.addEventListener(
    "click",
    closeStudentModal
  );


  cancelButton?.addEventListener(
    "click",
    closeStudentModal
  );


  form?.addEventListener(
    "submit",
    saveStudent
  );

}


function closeStudentModal() {

  document
    .getElementById("studentModal")
    ?.classList.remove("show");

}


/* =========================================================
   SAVE STUDENT
========================================================= */

async function saveStudent(event) {

  event.preventDefault();


  const id =
    document.getElementById("studentId")
      .value.trim();


  const name =
    document.getElementById("studentName")
      .value.trim();


  const level =
    document.getElementById("studentLevel")
      .value.trim();


  const parent =
    document.getElementById("studentParent")
      .value.trim();


  const phone =
    document.getElementById("studentPhone")
      .value.trim();


  const authorized =
    document.getElementById("studentAuthorized")
      .checked;


  if (!id || !name || !level) {

    showToast(
      "Please complete the required fields.",
      "error"
    );

    return;
  }


  try {

    const { error } =
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


    if (error) {
      throw error;
    }


    showToast(
      "Student added successfully.",
      "success"
    );


    document
      .getElementById("studentForm")
      .reset();


    document
      .getElementById("studentAuthorized")
      .checked = true;


    closeStudentModal();


    await loadStudents();


  } catch (error) {

    console.error(error);


    if (
      String(error.message)
        .toLowerCase()
        .includes("duplicate")
    ) {

      showToast(
        "That Student ID already exists.",
        "error"
      );

    } else {

      showToast(
        "Unable to save student.",
        "error"
      );

    }

  }

}


/* =========================================================
   QR DISPLAY
========================================================= */

function showStudentQr(student) {

  const modal =
    document.getElementById(
      "studentResultModal"
    );


  const result =
    document.getElementById(
      "studentResult"
    );


  const qrData =
    String(student.id);


  result.innerHTML = `

    <div class="student-result">

      <div class="result-avatar">
        👨‍🎓
      </div>

      <h2>
        ${escapeHtml(student.name || "")}
      </h2>

      <p>
        ${escapeHtml(student.level || "")}
      </p>

      <div
        id="generatedQr"
        style="
          display:flex;
          justify-content:center;
          margin:20px 0;
        "
      ></div>

      <p>
        Student ID:
        <strong>
          ${escapeHtml(student.id || "")}
        </strong>
      </p>

      <button
        class="primary-button"
        id="downloadQr"
      >
        Download QR Code
      </button>

    </div>

  `;


  modal.classList.add("show");


  if (
    typeof QRCode !== "undefined"
  ) {

    new QRCode(
      document.getElementById("generatedQr"),
      {
        text: qrData,
        width: 220,
        height: 220
      }
    );

  } else {

    /*
      Dynamically load QRCode library
      if it is not already available.
    */

    loadQrGenerator(() => {

      new QRCode(
        document.getElementById("generatedQr"),
        {
          text: qrData,
          width: 220,
          height: 220
        }
      );

    });

  }


  document
    .getElementById("downloadQr")
    ?.addEventListener(
      "click",
      () => {

        downloadGeneratedQr(
          student
        );

      }
    );

}


function loadQrGenerator(callback) {

  const script =
    document.createElement("script");


  script.src =
    "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";


  script.onload = callback;


  document.head.appendChild(script);

}


/* =========================================================
   DOWNLOAD QR
========================================================= */

function downloadGeneratedQr(student) {

  const canvas =
    document.querySelector(
      "#generatedQr canvas"
    );


  const image =
    document.querySelector(
      "#generatedQr img"
    );


  let url = null;


  if (canvas) {

    url =
      canvas.toDataURL(
        "image/png"
      );

  } else if (image) {

    url = image.src;

  }


  if (!url) {

    showToast(
      "QR image is not ready yet.",
      "error"
    );

    return;

  }


  const link =
    document.createElement("a");


  link.href = url;

  link.download =
    `${student.id}-QR.png`;


  document.body.appendChild(link);

  link.click();

  link.remove();

}


/* =========================================================
   CLOSE RESULT MODAL
========================================================= */

document
  .getElementById("closeResultModal")
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "studentResultModal"
        )
        .classList.remove("show");

    }
  );


/* =========================================================
   SCANNER
========================================================= */

function initializeScannerControls() {

  document
    .getElementById("startScanner")
    ?.addEventListener(
      "click",
      startScanner
    );


  document
    .getElementById("stopScanner")
    ?.addEventListener(
      "click",
      stopScanner
    );


  document
    .getElementById("manualSearchButton")
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
    typeof Html5Qrcode === "undefined"
  ) {

    showToast(
      "QR scanner library is still loading. Try again.",
      "error"
    );

    return;

  }


  if (scannerRunning) {
    return;
  }


  try {

    html5QrCode =
      new Html5Qrcode("reader");


    await html5QrCode.start(

      {
        facingMode: "environment"
      },

      {
        fps: 10,

        qrbox: {
          width: 250,
          height: 250
        },

        aspectRatio: 1.0

      },

      decodedText => {

        handleQrScan(decodedText);

      },

      () => {

        /*
          Ignore normal scanning errors.
        */

      }

    );


    scannerRunning = true;


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
      "Unable to start camera. Check browser camera permission.",
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

    scannerRunning = false;


    showToast(
      "Camera stopped.",
      "success"
    );


  } catch (error) {

    console.error(error);

  }

}


/* =========================================================
   QR SCAN
========================================================= */

async function handleQrScan(decodedText) {

  const studentId =
    String(decodedText)
      .trim();


  /*
    Prevent repeated scans
    while camera is still seeing QR.
  */

  await stopScanner();


  const student =
    students.find(
      item =>
        String(item.id).trim() === studentId
    );


  if (!student) {

    showToast(
      `Student ID "${studentId}" was not found.`,
      "error"
    );

    return;

  }


  selectedStudent = student;


  showAttendanceAction(student);

}


/* =========================================================
   MANUAL SEARCH
========================================================= */

function manualStudentSearch() {

  const input =
    document.getElementById(
      "manualStudentId"
    );


  const studentId =
    input.value.trim();


  if (!studentId) {

    showToast(
      "Enter a Student ID.",
      "error"
    );

    return;

  }


  const student =
    students.find(
      item =>
        String(item.id).trim().toLowerCase() ===
        studentId.toLowerCase()
    );


  if (!student) {

    showToast(
      "Student not found.",
      "error"
    );

    return;

  }


  selectedStudent = student;


  showAttendanceAction(student);

}


/* =========================================================
   SHOW ATTENDANCE ACTION
========================================================= */

async function showAttendanceAction(student) {

  const modal =
    document.getElementById(
      "studentResultModal"
    );


  const result =
    document.getElementById(
      "studentResult"
    );


  const todayRecord =
    attendanceRecords.find(
      record =>
        String(record.student_id) ===
        String(student.id)
    );


  let timeInText =
    todayRecord?.time_in
      ? formatTime(todayRecord.time_in)
      : "Not recorded";


  let timeOutText =
    todayRecord?.time_out
      ? formatTime(todayRecord.time_out)
      : "Not recorded";


  result.innerHTML = `

    <div class="student-result">

      <div class="result-avatar">
        👨‍🎓
      </div>

      <h2>
        ${escapeHtml(student.name || "")}
      </h2>

      <p>
        ${escapeHtml(student.level || "")}
      </p>

      <p>
        Student ID:
        <strong>
          ${escapeHtml(student.id || "")}
        </strong>
      </p>

      <p>
        Time In:
        <strong>
          ${timeInText}
        </strong>
      </p>

      <p>
        Time Out:
        <strong>
          ${timeOutText}
        </strong>
      </p>

      ${
        student.authorized === false
          ? `
            <p style="
              color:#dc2626;
              font-weight:700;
              margin-top:15px;
            ">
              ⚠ This student is marked as
              not authorized.
            </p>
          `
          : ""
      }

      <div class="result-actions">

        <button
          class="time-in-button"
          id="recordTimeIn"
          ${
            todayRecord?.time_in
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
            !todayRecord?.time_in ||
            todayRecord?.time_out
              ? "disabled"
              : ""
          }
        >
          ↗ Time Out
        </button>

      </div>

    </div>

  `;


  modal.classList.add("show");


  document
    .getElementById("recordTimeIn")
    ?.addEventListener(
      "click",
      () => recordTimeIn(student)
    );


  document
    .getElementById("recordTimeOut")
    ?.addEventListener(
      "click",
      () => recordTimeOut(student)
    );

}


/* =========================================================
   GET TODAY
========================================================= */

function getVientianeDate() {

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Vientiane",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(
    new Date()
  );

}


/* =========================================================
   TIME IN
========================================================= */

async function recordTimeIn(student) {

  try {

    const today =
      getVientianeDate();


    const existing =
      attendanceRecords.find(
        record =>
          String(record.student_id) ===
          String(student.id)
      );


    if (existing?.time_in) {

      showToast(
        "This student already has a Time In.",
        "error"
      );

      return;

    }


    const now =
      new Date()
        .toISOString();


    if (existing) {

      const { error } =
        await supabaseClient
          .from("attendance")
          .update({

            time_in: now

          })
          .eq(
            "id",
            existing.id
          );


      if (error) {
        throw error;
      }

    } else {

      const { error } =
        await supabaseClient
          .from("attendance")
          .insert({

            date: today,

            student_id: student.id,

            student_name: student.name,

            level: student.level,

            time_in: now

          });


      if (error) {
        throw error;
      }

    }


    showToast(
      `${student.name} — Time In recorded.`,
      "success"
    );


    closeResultModal();


    await loadTodayAttendance();


  } catch (error) {

    console.error(
      "Time In error:",
      error
    );


    showToast(
      "Unable to record Time In.",
      "error"
    );

  }

}


/* =========================================================
   TIME OUT
========================================================= */

async function recordTimeOut(student) {

  try {

    const existing =
      attendanceRecords.find(
        record =>
          String(record.student_id) ===
          String(student.id)
      );


    if (!existing) {

      showToast(
        "Time In must be recorded first.",
        "error"
      );

      return;

    }


    if (existing.time_out) {

      showToast(
        "This student already has a Time Out.",
        "error"
      );

      return;

    }


    const now =
      new Date()
        .toISOString();


    const { error } =
      await supabaseClient
        .from("attendance")
        .update({

          time_out: now

        })
        .eq(
          "id",
          existing.id
        );


    if (error) {
      throw error;
    }


    showToast(
      `${student.name} — Time Out recorded.`,
      "success"
    );


    closeResultModal();


    await loadTodayAttendance();


  } catch (error) {

    console.error(
      "Time Out error:",
      error
    );


    showToast(
      "Unable to record Time Out.",
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


    const { data, error } =
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


    updateAttendanceStats();

    renderAttendance();

    renderDashboardAttendance();


  } catch (error) {

    console.error(
      "Attendance loading error:",
      error
    );


    showToast(
      "Unable to load attendance records.",
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
      record => record.time_in
    ).length;


  const timeOut =
    attendanceRecords.filter(
      record => record.time_out
    ).length;


  const currentlyIn =
    attendanceRecords.filter(
      record =>
        record.time_in &&
        !record.time_out
    ).length;


  document.getElementById(
    "timeInCount"
  ).textContent = timeIn;


  document.getElementById(
    "timeOutCount"
  ).textContent = timeOut;


  document.getElementById(
    "currentlyInCount"
  ).textContent = currentlyIn;

}


/* =========================================================
   RENDER ATTENDANCE
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
    (
      document.getElementById(
        "attendanceSearch"
      )?.value || ""
    )
      .toLowerCase()
      .trim();


  const filtered =
    attendanceRecords.filter(record => {

      const searchable = [

        record.student_id,

        record.student_name,

        record.level,

        record.pickup_person,

        record.pickup_relationship,

        record.staff

      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();


      return (
        !search ||
        searchable.includes(search)
      );

    });


  if (!filtered.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="6"
          class="empty-state"
        >
          No attendance records today.
        </td>

      </tr>

    `;

    return;

  }


  body.innerHTML =
    filtered.map(record => {

      const isOut =
        Boolean(record.time_out);


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
              record.level || "-"
            )}
          </td>

          <td>
            ${
              record.time_in
                ? formatTime(record.time_in)
                : "-"
            }
          </td>

          <td>
            ${
              record.time_out
                ? formatTime(record.time_out)
                : "-"
            }
          </td>

          <td>
            ${escapeHtml(
              record.pickup_person || "-"
            )}
          </td>

          <td>

            <span class="status ${
              isOut
                ? "out"
                : "in"
            }">

              ${
                isOut
                  ? "Completed"
                  : "In School"
              }

            </span>

          </td>

        </tr>

      `;

    }).join("");

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
          colspan="5"
          class="empty-state"
        >
          No attendance records yet.
        </td>

      </tr>

    `;

    return;

  }


  body.innerHTML =
    records.map(record => {

      const completed =
        Boolean(record.time_out);


      return `

        <tr>

          <td>
            ${escapeHtml(
              record.student_name ||
              record.student_id ||
              ""
            )}
          </td>

          <td>
            ${escapeHtml(
              record.level || "-"
            )}
          </td>

          <td>
            ${
              record.time_in
                ? formatTime(record.time_in)
                : "-"
            }
          </td>

          <td>
            ${
              record.time_out
                ? formatTime(record.time_out)
                : "-"
            }
          </td>

          <td>

            <span class="status ${
              completed
                ? "out"
                : "in"
            }">

              ${
                completed
                  ? "Completed"
                  : "In School"
              }

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

  document
    .getElementById("studentSearch")
    ?.addEventListener(
      "input",
      renderStudents
    );


  document
    .getElementById("levelFilter")
    ?.addEventListener(
      "change",
      renderStudents
    );


  document
    .getElementById("attendanceSearch")
    ?.addEventListener(
      "input",
      renderAttendance
    );


  document
    .getElementById("refreshAttendance")
    ?.addEventListener(
      "click",
      loadTodayAttendance
    );

}


/* =========================================================
   REALTIME
========================================================= */

function initializeRealtime() {

  if (realtimeChannel) {

    supabaseClient
      .removeChannel(
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

        async () => {

          console.log(
            "Attendance changed — refreshing."
          );


          await loadTodayAttendance();

        }

      )
      .on(

        "postgres_changes",

        {
          event: "*",

          schema: "public",

          table: "students"

        },

        async () => {

          console.log(
            "Students changed — refreshing."
          );


          await loadStudents();

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
   CSV EXPORT
========================================================= */

function initializeReportButton() {

  document
    .getElementById("exportCsv")
    ?.addEventListener(
      "click",
      exportCsv
    );

}


function exportCsv() {

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

    "Staff",

    "Approver",

    "Notes"

  ];


  const rows =
    attendanceRecords.map(record => [

      record.date,

      record.student_id,

      record.student_name,

      record.level,

      record.time_in
        ? formatTime(record.time_in)
        : "",

      record.time_out
        ? formatTime(record.time_out)
        : "",

      record.pickup_person || "",

      record.pickup_relationship || "",

      record.pickup_phone || "",

      record.staff || "",

      record.approver || "",

      record.notes || ""

    ]);


  const csv = [

    headers,

    ...rows

  ]
    .map(row =>
      row
        .map(value =>
          `"${String(value ?? "")
            .replace(/"/g, '""')}"`
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
    URL.createObjectURL(blob);


  const link =
    document.createElement("a");


  link.href = url;


  link.download =
    `Vision-School-Attendance-${getVientianeDate()}.csv`;


  document.body.appendChild(link);

  link.click();

  link.remove();


  URL.revokeObjectURL(url);


  showToast(
    "Attendance CSV downloaded.",
    "success"
  );

}


/* =========================================================
   HELPERS
========================================================= */

function formatTime(value) {

  if (!value) {
    return "-";
  }


  const date =
    new Date(value);


  return date.toLocaleTimeString(
    "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Vientiane"
    }
  );

}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function closeResultModal() {

  document
    .getElementById(
      "studentResultModal"
    )
    ?.classList.remove("show");

}


let toastTimer = null;


function showToast(
  message,
  type = "info"
) {

  const toast =
    document.getElementById("toast");


  if (!toast) {
    return;
  }


  toast.textContent =
    message;


  toast.classList.add("show");


  clearTimeout(toastTimer);


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
   CLOSE MODALS WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener(
  "click",
  event => {

    if (
      event.target.classList.contains(
        "modal"
      )
    ) {

      event.target.classList.remove(
        "show"
      );

    }

  }
);
