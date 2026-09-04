/* =========================================================
   VISION SCHOOL
   STUDENT QR ATTENDANCE + PICKUP SYSTEM

   MATCHING HTML:
   - Dashboard
   - Students
   - QR Scanner
   - Attendance
   - Reports
   - 3 Parent / Guardian selection
   - Pickup authorization
   - Supabase

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
========================================================= */


/* =========================================================
   SUPABASE CONFIGURATION
========================================================= */

const SUPABASE_URL =
    "https://ymonpeujmhaymkxfmmtq.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

let supabaseClient = null;


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

// Small in-memory caches/flags to avoid repeated work during realtime updates.
const parentQrTokenCache = new Map();
let realtimeRefreshTimer = null;
let realtimeNeedsStudents = false;
let realtimeNeedsAttendance = false;


/* =========================================================
   START APPLICATION
========================================================= */

// The CDN libraries in index.html use `defer`.  Do not assume that
// Supabase is available at the exact moment DOMContentLoaded fires.
// Wait briefly for the library, while initializing the UI immediately.
function waitForSupabase(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (window.supabase) {
            resolve(window.supabase);
            return;
        }

        const started = Date.now();
        const timer = setInterval(() => {
            if (window.supabase) {
                clearInterval(timer);
                resolve(window.supabase);
                return;
            }

            if (Date.now() - started >= timeoutMs) {
                clearInterval(timer);
                reject(new Error("Supabase library did not load. Check the CDN/internet connection."));
            }
        }, 100);
    });
}

function setConnectionStatus(state, message) {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");

    if (dot) {
        dot.classList.remove("offline", "connected");
        dot.classList.add(state === "connected" ? "connected" : "offline");
    }

    if (text) {
        text.textContent = message;
    }
}

function ensureVisionSchoolModalStyles() {
    if (document.getElementById("visionSchoolModalFixStyles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "visionSchoolModalFixStyles";
    style.textContent = `
        /* =====================================================
           STUDENT MODAL FIX
           Keeps the existing dashboard UI unchanged.
        ===================================================== */

        #studentModal.modal,
        #studentResultModal.modal {
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            padding: 20px;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            display: none;
            align-items: flex-start;
            justify-content: center;
        }

        #studentModal.modal.show,
        #studentResultModal.modal.show {
            display: flex;
        }

        #studentModal .modal-content,
        #studentResultModal .modal-content {
            width: min(620px, 100%);
            max-width: 620px;
            max-height: calc(100vh - 40px);
            margin: auto;
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            border-radius: 14px;
            padding: 24px;
        }

        #studentModal form {
            width: 100%;
            box-sizing: border-box;
        }

        #studentModal .form-group {
            width: 100%;
            box-sizing: border-box;
        }

        #studentModal input,
        #studentModal select {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
        }

        #studentModal .modal-header {
            position: sticky;
            top: -24px;
            z-index: 2;
            padding-bottom: 14px;
            background: inherit;
        }

        #studentModal .result-actions {
            display: flex;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 10px;
            padding-bottom: 4px;
        }

        @media (max-width: 700px) {
            #studentModal.modal,
            #studentResultModal.modal {
                padding: 10px;
            }

            #studentModal .modal-content,
            #studentResultModal .modal-content {
                width: 100%;
                max-width: none;
                max-height: calc(100vh - 20px);
                padding: 18px;
            }

            #studentModal .modal-header {
                top: -18px;
            }
        }
    `;
    document.head.appendChild(style);
}

function ensureVisionSchoolModals() {
    ensureVisionSchoolModalStyles();

    // The current index.html intentionally contains the page UI, but older
    // versions of the app expected these two shared modals to be present.
    // Create them once at runtime so View / Edit / Student QR / Parent QR
    // continue to work without changing the existing page layout.

    if (!document.getElementById("studentResultModal")) {
        const modal = document.createElement("div");
        modal.id = "studentResultModal";
        modal.className = "modal";
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Student Information</h2>
                    <button type="button" class="modal-close" id="closeResultModal" aria-label="Close">&times;</button>
                </div>
                <div id="studentResult"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    if (!document.getElementById("studentModal")) {
        const modal = document.createElement("div");
        modal.id = "studentModal";
        modal.className = "modal";
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Add Student</h2>
                    <button type="button" class="modal-close" id="closeStudentModal" aria-label="Close">&times;</button>
                </div>

                <form id="studentForm">
                    <div class="form-group">
                        <label for="studentId">Student ID</label>
                        <input id="studentId" type="text" required>
                    </div>

                    <div class="form-group">
                        <label for="studentName">Student Name</label>
                        <input id="studentName" type="text" required>
                    </div>

                    <div class="form-group">
                        <label for="studentLevel">Level</label>
                        <input id="studentLevel" type="text" required>
                    </div>

                    <div class="form-group">
                        <label for="studentParent">Parent / Guardian 1</label>
                        <input id="studentParent" type="text">
                    </div>

                    <div class="form-group">
                        <label for="studentPhone">Phone 1</label>
                        <input id="studentPhone" type="tel">
                    </div>

                    <div class="form-group">
                        <label for="studentParent2">Parent / Guardian 2</label>
                        <input id="studentParent2" type="text">
                    </div>

                    <div class="form-group">
                        <label for="studentPhone2">Phone 2</label>
                        <input id="studentPhone2" type="tel">
                    </div>

                    <div class="form-group">
                        <label for="studentParent3">Parent / Guardian 3</label>
                        <input id="studentParent3" type="text">
                    </div>

                    <div class="form-group">
                        <label for="studentPhone3">Phone 3</label>
                        <input id="studentPhone3" type="tel">
                    </div>

                    <div class="form-group">
                        <label style="display:flex;align-items:center;gap:8px;">
                            <input id="studentAuthorized" type="checkbox" checked>
                            Pickup Authorized
                        </label>
                    </div>

                    <div class="result-actions">
                        <button type="button" class="secondary-button" id="cancelStudent">Cancel</button>
                        <button type="submit" class="primary-button">Save Student</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function initializeAppUI() {
    ensureVisionSchoolModals();

    // These must never depend on Supabase. The app remains clickable while
    // the cloud connection is being established.
    initializeNavigation();
    initializeMobileMenu();
    initializeClock();
    initializeStudentModal();
    initializeScanner();
    initializeSearch();
    initializeReports();
    initializeModalClosing();

    // Make navigation delegated so dynamically rendered Dashboard controls
    // and any current/future [data-section] buttons always work.
    if (!window.__visionNavigationBound) {
        document.addEventListener("click", event => {
            const button = event.target.closest?.("[data-section]");
            if (!button) return;

            const sectionId = button.dataset.section;
            if (sectionId) {
                event.preventDefault();
                showSection(sectionId);
            }
        });
        window.__visionNavigationBound = true;
    }
}

async function startVisionSchoolApp() {
    console.log("Vision School Attendance System starting...");

    // Service worker registration must never block the application.
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(registration => {
                console.log("Vision School service worker registered:", registration.scope);
                registration.update().catch(() => {});
            })
            .catch(error => {
                console.warn("Service worker registration failed:", error);
            });
    }

    // IMPORTANT: initialize all buttons/navigation BEFORE Supabase.
    initializeAppUI();

    setConnectionStatus("offline", "Connecting...");

    try {
        const supabaseLib = await waitForSupabase();

        supabaseClient = supabaseLib.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

        // Connection test and data loads are independent. One failed request
        // must not prevent the rest of the application from initializing.
        const results = await Promise.allSettled([
            testSupabaseConnection(),
            loadStudents(),
            loadTodayAttendance()
        ]);

        const connectionResult = results[0];

        if (connectionResult.status === "fulfilled") {
            initializeRealtime();
        } else {
            console.error("Supabase connection failed:", connectionResult.reason);
        }

        console.log("Vision School startup completed.");

    } catch (error) {
        console.error("Vision School startup error:", error);
        setConnectionStatus("offline", "Connection Error");
        showToast(error?.message || "Application connection failed.", "error");
    }
}

document.addEventListener("DOMContentLoaded", startVisionSchoolApp, { once: true });


/* =========================================================
   CLOCK
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


    const liveTime =
        document.getElementById(
            "liveTime"
        );

    const liveDate =
        document.getElementById(
            "liveDate"
        );

    const dashboardDate =
        document.getElementById(
            "dashboardDate"
        );


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

    document
        .querySelectorAll(
            "[data-section]"
        )
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
        .querySelectorAll(
            ".page-section"
        )
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
        .querySelectorAll(
            ".nav-item"
        )
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


    if (sectionId === "dashboard") {
        renderDashboard();
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


    if (!menu || !sidebar) {
        return;
    }


    menu.addEventListener(
        "click",
        () => {

            sidebar.classList.toggle(
                "open"
            );

        }
    );
}


/* =========================================================
   SUPABASE CONNECTION
========================================================= */

async function testSupabaseConnection() {

    const dot =
        document.getElementById(
            "connectionDot"
        );

    const text =
        document.getElementById(
            "connectionText"
        );


    try {

        /*
         IMPORTANT:
         The students table uses "id".

         DO NOT use:
         .select("student_id")

         That was the source of the 400 error
         from the old app.js.
        */

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


        dot?.classList.remove(
            "offline"
        );

        dot?.classList.add(
            "connected"
        );


        if (text) {
            text.textContent =
                "Connected";
        }


        console.log(
            "Supabase connection successful."
        );


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
            "Supabase connection failed.",
            "error"
        );


        throw error;
    }
}


/* =========================================================
   LOCAL FALLBACK CACHE
========================================================= */

const STUDENTS_CACHE_KEY = "visionSchool_students_cache_v1";
const ATTENDANCE_CACHE_KEY = "visionSchool_attendance_today_cache_v1";

function readLocalCache(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        console.warn("Local cache read failed:", error);
        return fallback;
    }
}

function writeLocalCache(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn("Local cache write failed:", error);
    }
}

function restoreStudentCache() {
    const cached = readLocalCache(STUDENTS_CACHE_KEY, null);
    if (Array.isArray(cached)) {
        students = cached;
        populateLevelFilter();
        renderStudents();
        renderDashboard();
        return true;
    }
    return false;
}

function restoreAttendanceCache() {
    const cached = readLocalCache(ATTENDANCE_CACHE_KEY, null);
    if (Array.isArray(cached)) {
        attendanceRecords = cached;
        renderAttendance();
        renderDashboard();
        return true;
    }
    return false;
}


/* =========================================================
   LOAD STUDENTS
========================================================= */

async function loadStudents() {
    try {
        const { data, error } = await supabaseClient
            .from("students")
            .select("*")
            .order("name", { ascending: true });

        if (error) throw error;

        students = data || [];
        writeLocalCache(STUDENTS_CACHE_KEY, students);

        const total = document.getElementById("totalStudents");
        if (total) total.textContent = students.length;

        populateLevelFilter();
        renderStudents();
        renderDashboard();

    } catch (error) {
        console.error("Unable to load students:", error);

        // Never replace good data with an empty array because of a temporary
        // network/API failure during refresh.
        if (!restoreStudentCache()) {
            showToast(error?.message || "Unable to load students.", "error");
        } else {
            showToast("Using saved student data while reconnecting.", "error");
        }
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


    const oldValue =
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
        ]
        .sort();


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
        oldValue;
}


/* =========================================================
   PARENT / GUARDIAN DATA
========================================================= */

/*
   New records are stored as JSON inside the existing
   students.parent TEXT field.

   Example:

   [
     {
       "label":"Parent / Guardian 1",
       "name":"Maria",
       "phone":"020..."
     },
     {
       "label":"Parent / Guardian 2",
       "name":"John",
       "phone":"020..."
     },
     {
       "label":"Parent / Guardian 3",
       "name":"Anna",
       "phone":"020..."
     }
   ]

   Old records such as:

   Mother: Maria | Father: John | Aunt: Anna

   are still supported.
*/


function getParentOptions(parentValue) {

    if (!parentValue) {
        return [];
    }


    const value =
        String(
            parentValue
        ).trim();


    /* NEW JSON FORMAT */

    if (
        value.startsWith("[") &&
        value.endsWith("]")
    ) {

        try {

            const parsed =
                JSON.parse(
                    value
                );


            if (
                Array.isArray(
                    parsed
                )
            ) {

                return parsed
                    .map(
                        (
                            item,
                            index
                        ) => ({

                            index:
                                index + 1,

                            label:
                                item.label ||
                                `Parent / Guardian ${index + 1}`,

                            name:
                                item.name ||
                                "",

                            phone:
                                item.phone ||
                                ""

                        })
                    )
                    .filter(
                        item =>
                            item.name
                    );
            }

        } catch (error) {

            console.warn(
                "Parent JSON parse failed. Using legacy format."
            );

        }
    }


    /* OLD TEXT FORMAT */

    let parts = [];


    if (
        value.includes("|")
    ) {

        parts =
            value
                .split("|")
                .map(
                    item =>
                        item.trim()
                )
                .filter(Boolean);

    } else {

        parts =
            value
                .split(",")
                .map(
                    item =>
                        item.trim()
                )
                .filter(Boolean);

    }


    return parts
        .map(
            (
                item,
                index
            ) => {

                let label =
                    `Parent / Guardian ${index + 1}`;

                let name =
                    item;


                if (
                    item.includes(":")
                ) {

                    const split =
                        item.split(":");


                    label =
                        split[0]
                            .trim();


                    name =
                        split
                            .slice(1)
                            .join(":")
                            .trim();

                }


                return {

                    index:
                        index + 1,

                    label:
                        label,

                    name:
                        name,

                    phone:
                        index === 0
                            ? ""
                            : ""

                };

            }
        );
}


/* =========================================================
   BUILD PARENT JSON
========================================================= */

function buildParentData() {

    const parents = [];


    const parent1 =
        document.getElementById(
            "studentParent"
        )?.value.trim() || "";


    const phone1 =
        document.getElementById(
            "studentPhone"
        )?.value.trim() || "";


    const parent2 =
        document.getElementById(
            "studentParent2"
        )?.value.trim() || "";


    const phone2 =
        document.getElementById(
            "studentPhone2"
        )?.value.trim() || "";


    const parent3 =
        document.getElementById(
            "studentParent3"
        )?.value.trim() || "";


    const phone3 =
        document.getElementById(
            "studentPhone3"
        )?.value.trim() || "";


    if (parent1) {

        parents.push({

            label:
                "Parent / Guardian 1",

            name:
                parent1,

            phone:
                phone1

        });

    }


    if (parent2) {

        parents.push({

            label:
                "Parent / Guardian 2",

            name:
                parent2,

            phone:
                phone2

        });

    }


    if (parent3) {

        parents.push({

            label:
                "Parent / Guardian 3",

            name:
                parent3,

            phone:
                phone3

        });

    }


    return JSON.stringify(
        parents
    );
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
        document.getElementById(
            "studentSearch"
        )?.value
        ?.toLowerCase()
        ?.trim() || "";


    const level =
        document.getElementById(
            "levelFilter"
        )?.value || "";


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

                    (
                        !search ||
                        searchable.includes(
                            search
                        )
                    )

                    &&

                    (
                        !level ||
                        student.level ===
                        level
                    )

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
                    No students found.
                </td>

            </tr>

        `;

        return;
    }


    body.innerHTML =
        filtered
            .map(
                student => {

                    const authorized =
                        student.authorized !==
                        false;


                    const parents =
                        getParentOptions(
                            student.parent
                        );


                    const parentDisplay =
                        parents.length

                            ? parents
                                .map(
                                    parent =>
                                        `<strong>${escapeHtml(parent.label)}</strong>: ${escapeHtml(parent.name)}`
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
                                    type="button"
                                    class="small-button view-student"
                                    data-id="${escapeAttribute(student.id)}"
                                >
                                    View
                                </button>


                                <button
                                    type="button"
                                    class="small-button edit-student"
                                    data-id="${escapeAttribute(student.id)}"
                                >
                                    Edit
                                </button>


                                <button
                                    type="button"
                                    class="small-button remove-student"
                                    data-id="${escapeAttribute(student.id)}"
                                    style="color:#dc2626"
                                >
                                    Remove
                                </button>

                            </td>


                            <td>

                                <button
                                    type="button"
                                    class="small-button generate-qr"
                                    data-id="${escapeAttribute(student.id)}"
                                >
                                    Student QR
                                </button>

                                ${parents.length ? parents.map((parent, parentIndex) => `
                                    <button
                                        type="button"
                                        class="small-button generate-parent-qr"
                                        data-id="${escapeAttribute(student.id)}"
                                        data-parent-index="${parentIndex}"
                                    >
                                        Parent QR ${parentIndex + 1}
                                    </button>
                                `).join("") : ""}

                            </td>

                        </tr>

                    `;

                }
            )
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
                        console.log("Vision School: View student", student.id);
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
                        console.log("Vision School: Edit student", student.id);
                        editStudent(
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
                async () => {

                    const student =
                        findStudent(
                            button.dataset.id
                        );


                    if (!student) {
                        console.warn("Vision School: Remove student not found", button.dataset.id);
                        return;
                    }

                    console.log("Vision School: Remove student clicked", student.id);

                    const confirmed =
                        confirm(
                            `Remove ${student.name} from the student list?`
                        );


                    if (!confirmed) {
                        return;
                    }


                    await deleteStudent(
                        student
                    );

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
                        console.log("Vision School: Student QR", student.id);
                        showStudentQr(
                            student
                        );

                    }

                }
            );

        });


    body
        .querySelectorAll(
            ".generate-parent-qr"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {
                    const student = findStudent(button.dataset.id);
                    const parentIndex = Number(button.dataset.parentIndex || 0);
                    if (student) {
                        console.log("Vision School: Parent QR", student.id, parentIndex);
                        await showParentQr(student, parentIndex);
                    }
                }
            );

        });

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

                currentStudent =
                    null;

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


    const title =
        document.querySelector(
            "#studentModal .modal-header h2"
        );


    if (title) {
        title.textContent =
            "Add Student";
    }
}


/* =========================================================
   EDIT STUDENT
========================================================= */

function editStudent(student) {

    currentStudent =
        student;


    const modal =
        document.getElementById(
            "studentModal"
        );


    if (!modal) {
        return;
    }


    document.getElementById(
        "studentId"
    ).value =
        student.id || "";


    document.getElementById(
        "studentName"
    ).value =
        student.name || "";


    document.getElementById(
        "studentLevel"
    ).value =
        student.level || "";


    const parents =
        getParentOptions(
            student.parent
        );


    document.getElementById(
        "studentParent"
    ).value =
        parents[0]?.name || "";


    document.getElementById(
        "studentPhone"
    ).value =
        parents[0]?.phone ||
        student.phone ||
        "";


    document.getElementById(
        "studentParent2"
    ).value =
        parents[1]?.name || "";


    document.getElementById(
        "studentPhone2"
    ).value =
        parents[1]?.phone || "";


    document.getElementById(
        "studentParent3"
    ).value =
        parents[2]?.name || "";


    document.getElementById(
        "studentPhone3"
    ).value =
        parents[2]?.phone || "";


    document.getElementById(
        "studentAuthorized"
    ).checked =
        student.authorized !== false;


    const title =
        document.querySelector(
            "#studentModal .modal-header h2"
        );


    if (title) {
        title.textContent =
            "Edit Student";
    }


    modal.classList.add(
        "show"
    );
}


/* =========================================================
   SAVE STUDENT
========================================================= */

async function saveStudent(event) {

    event.preventDefault();


    const id =
        document.getElementById(
            "studentId"
        ).value.trim();


    const name =
        document.getElementById(
            "studentName"
        ).value.trim();


    const level =
        document.getElementById(
            "studentLevel"
        ).value.trim();


    const parent =
        buildParentData();


    const phone =
        document.getElementById(
            "studentPhone"
        ).value.trim();


    const authorized =
        document.getElementById(
            "studentAuthorized"
        ).checked;


    if (
        !id ||
        !name ||
        !level
    ) {

        showToast(
            "Please complete Student ID, Name and Level.",
            "error"
        );

        return;
    }


    try {

        if (currentStudent) {

            const {
                error
            } =
                await supabaseClient
                    .from("students")
                    .update({

                        id,

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


            if (error) {
                throw error;
            }


            showToast(
                "Student updated successfully.",
                "success"
            );


        } else {

            const {
                error
            } =
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

        }


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
   DELETE STUDENT
========================================================= */

async function deleteStudent(student) {

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
            "Student removed successfully.",
            "success"
        );


        await loadStudents();


    } catch (error) {

        console.error(
            "Delete student error:",
            error
        );


        showToast(
            error?.message ||
            "Unable to remove student.",
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


    currentStudent =
        null;

    resetStudentForm();
}


/* =========================================================
   STUDENT PROFILE
========================================================= */

function showStudentProfile(student) {

    const modal =
        document.getElementById(
            "studentResultModal"
        );

    const result =
        document.getElementById(
            "studentResult"
        );


    if (!modal || !result) {
        console.error("Vision School: Student result modal is missing.");
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
                    parent => `

                        <div
                            style="
                                padding:10px;
                                margin:6px 0;
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

                            ${
                                parent.phone
                                    ? `<br><small>📞 ${escapeHtml(parent.phone)}</small>`
                                    : ""
                            }

                            <br>
                            <button
                                type="button"
                                class="small-button profile-parent-qr"
                                data-parent-index="${parent.index - 1}"
                                style="margin-top:6px;"
                            >
                                Parent QR
                            </button>

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

                            <p>
                                This student is currently
                                marked as UNAUTHORIZED.
                                Staff must verify the
                                pickup person carefully.
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
                    type="button"
                    class="time-in-button"
                    id="profileEditButton"
                >
                    ✏️ Edit
                </button>


                <button
                    type="button"
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

                showStudentQr(
                    student
                );

            }
        );

    result.querySelectorAll(".profile-parent-qr").forEach(button => {
        button.addEventListener("click", async () => {
            const parentIndex = Number(button.dataset.parentIndex || 0);
            await showParentQr(student, parentIndex);
        });
    });
}


/* =========================================================
   PARENT QR
   A parent QR is independent from any one student. The same
   registered parent name + phone can therefore be linked to
   multiple students without changing the database schema.
========================================================= */

function normalizeParentValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

async function getParentQrToken(name, phone) {
    const normalizedName = normalizeParentValue(name);
    const normalizedPhone = normalizeParentValue(phone);
    const cacheKey = `${normalizedName}|${normalizedPhone}`;

    const cached = parentQrTokenCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const raw = cacheKey;

    if (window.crypto?.subtle) {
        const bytes = new TextEncoder().encode(raw);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const token = Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
        parentQrTokenCache.set(cacheKey, token);
        return token;
    }

    // Deterministic fallback for browsers without Web Crypto.
    let hash1 = 2166136261;
    let hash2 = 16777619;
    for (let i = 0; i < raw.length; i++) {
        const code = raw.charCodeAt(i);
        hash1 ^= code;
        hash1 = Math.imul(hash1, 16777619);
        hash2 ^= code + i;
        hash2 = Math.imul(hash2, 2166136261);
    }
    const token = `${(hash1 >>> 0).toString(16).padStart(8, "0")}${(hash2 >>> 0).toString(16).padStart(8, "0")}`;
    parentQrTokenCache.set(cacheKey, token);
    return token;
}

async function showParentQr(student, parentIndex = 0) {
    const parents = getParentOptions(student?.parent);
    const parent = parents[parentIndex];
    if (!parent?.name) {
        showToast("This student has no registered parent/guardian at that position.", "error");
        return;
    }

    const modal = document.getElementById("studentResultModal");
    const result = document.getElementById("studentResult");
    if (!modal || !result) {
        console.error("Vision School: Parent QR result modal is missing.");
        return;
    }

    const token = await getParentQrToken(parent.name, parent.phone);
    const payload = `VISION-PARENT:${token}`;

    result.innerHTML = `
        <div class="student-result">
            <div class="result-avatar">👨‍👩‍👧</div>
            <h2>${escapeHtml(parent.name)}</h2>
            <p>${escapeHtml(parent.label || "Parent / Guardian")}</p>
            ${parent.phone ? `<p>📞 ${escapeHtml(parent.phone)}</p>` : ""}

            <div id="generatedParentQr" style="display:flex;justify-content:center;margin:20px 0;"></div>

            <div class="security-box security-authorized">
                <strong>Separate Parent QR</strong>
                <p style="margin:6px 0 0;">
                    This QR identifies this parent/guardian and can be linked to every student registered with the same name and phone number.
                </p>
            </div>

            <button type="button" class="primary-button" id="downloadParentQr">
                Download Parent QR
            </button>
        </div>
    `;

    modal.classList.add("show");

    loadQrGenerator(() => {
        const container = document.getElementById("generatedParentQr");
        if (!container) return;
        container.innerHTML = "";
        new QRCode(container, {
            text: payload,
            width: 220,
            height: 220
        });

        document.getElementById("downloadParentQr")?.addEventListener("click", () => {
            const canvas = container.querySelector("canvas");
            const image = container.querySelector("img");
            const source = canvas?.toDataURL("image/png") || image?.src;
            if (!source) {
                showToast("Unable to prepare the Parent QR image.", "error");
                return;
            }
            const link = document.createElement("a");
            link.href = source;
            link.download = `Vision-School-Parent-QR-${parent.name.replace(/[^a-z0-9]+/gi, "-")}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
    });
}

async function handleParentQrScan(decodedText) {
    const prefix = "VISION-PARENT:";
    const token = String(decodedText || "").trim().slice(prefix.length);

    if (!token) {
        showToast("Invalid Parent QR code.", "error");
        return;
    }

    // Hash each unique parent identity once and in parallel. This matters
    // when the school has many students linked to the same parent.
    const parentEntries = [];
    const uniqueParents = new Map();

    for (const student of students) {
        const parents = getParentOptions(student.parent);
        for (const parent of parents) {
            if (!parent.name) continue;
            const key = `${normalizeParentValue(parent.name)}|${normalizeParentValue(parent.phone)}`;
            if (!uniqueParents.has(key)) {
                uniqueParents.set(key, parent);
            }
            parentEntries.push({ student, parent, key });
        }
    }

    const tokenPairs = await Promise.all(
        Array.from(uniqueParents.entries()).map(async ([key, parent]) => [
            key,
            await getParentQrToken(parent.name, parent.phone)
        ])
    );

    const tokenMap = new Map(tokenPairs);
    const matches = parentEntries
        .filter(entry => tokenMap.get(entry.key) === token)
        .map(entry => ({ student: entry.student, parent: entry.parent }));

    if (!matches.length) {
        showToast("This Parent QR is not linked to any registered student.", "error");
        return;
    }

    showParentPickupSelection(matches);
}

async function showParentPickupSelection(matches) {
    const modal = document.getElementById("studentResultModal");
    const result = document.getElementById("studentResult");
    if (!modal || !result) return;

    await loadTodayAttendance();

    const firstParent = matches[0].parent;
    const rows = matches.map((match, index) => {
        const record = attendanceRecords.find(
            item => String(item.student_id) === String(match.student.id)
        );
        const ready = Boolean(record?.time_in) && !record?.time_out;
        const reason = !record?.time_in
            ? "Not timed in today"
            : record?.time_out
                ? `Already picked up at ${formatTime(record.time_out)}`
                : "Ready for pickup";

        return `
            <label class="parent-pickup-row ${ready ? "" : "disabled"}">
                <input type="checkbox" class="parent-pickup-checkbox" data-index="${index}" ${ready ? "" : "disabled"}>
                <span>
                    <strong>${escapeHtml(match.student.name)}</strong>
                    <small>${escapeHtml(match.student.id)} • ${escapeHtml(match.student.level || "")}</small>
                    <em>${escapeHtml(reason)}</em>
                </span>
            </label>
        `;
    }).join("");

    result.innerHTML = `
        <div class="student-result">
            <div class="result-avatar">👨‍👩‍👧</div>
            <h2>Parent Pickup</h2>
            <p><strong>${escapeHtml(firstParent.name)}</strong>${firstParent.phone ? ` • ${escapeHtml(firstParent.phone)}` : ""}</p>

            <div class="security-box security-authorized" style="text-align:left;">
                <strong>Registered Parent / Guardian</strong>
                <p style="margin:6px 0 0;">Select the child or children this parent is picking up now.</p>
            </div>

            <div class="parent-pickup-list">${rows}</div>

            <div class="form-group" style="text-align:left;margin-top:16px;">
                <label for="parentPickupNotes">Notes (optional)</label>
                <textarea id="parentPickupNotes" rows="3" placeholder="Pickup notes..."></textarea>
            </div>

            <div class="result-actions">
                <button type="button" class="secondary-button" id="cancelParentPickup">Cancel</button>
                <button type="button" class="primary-button" id="saveParentPickup">Confirm Pickup</button>
            </div>
        </div>
    `;

    modal.classList.add("show");

    document.getElementById("cancelParentPickup")?.addEventListener("click", closeResultModal);
    document.getElementById("saveParentPickup")?.addEventListener("click", () => saveParentPickup(matches));
}

async function saveParentPickup(matches) {
    const selected = Array.from(document.querySelectorAll(".parent-pickup-checkbox:checked"))
        .map(input => Number(input.dataset.index))
        .filter(Number.isInteger)
        .map(index => matches[index])
        .filter(Boolean);

    if (!selected.length) {
        showToast("Please select at least one child for pickup.", "error");
        return;
    }

    const notes = document.getElementById("parentPickupNotes")?.value.trim() || "";
    const pickupTime = new Date().toISOString();
    let saved = 0;

    try {
        for (const match of selected) {
            const record = attendanceRecords.find(
                item => String(item.student_id) === String(match.student.id)
            );

            if (!record?.id || !record.time_in || record.time_out) continue;

            const payload = {
                pickup_person: match.parent.name,
                pickup_relationship: match.parent.label || "Parent / Guardian",
                pickup_phone: match.parent.phone || "",
                pickup_option: "Parent / Guardian",
                approver: "",
                notes,
                time_out: pickupTime
            };

            const { error } = await supabaseClient
                .from("attendance")
                .update(payload)
                .eq("id", record.id);

            if (error) throw error;
            saved++;
        }

        if (!saved) {
            throw new Error("No selected child was ready for pickup.");
        }

        showToast(`${saved} student${saved === 1 ? "" : "s"} picked up successfully.`, "success");
        closeResultModal();
        await loadTodayAttendance();
    } catch (error) {
        console.error("Parent pickup error:", error);
        showToast(error?.message || "Unable to save parent pickup.", "error");
    }
}

/* =========================================================
   QR GENERATOR
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


    if (!modal || !result) {
        console.error("Vision School: Student QR result modal is missing.");
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
            ></div>


            <p>
                Student ID:

                <strong>
                    ${escapeHtml(
                        student.id
                    )}
                </strong>
            </p>


            <button
                type="button"
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

            const qrContainer =
                document.getElementById(
                    "generatedQr"
                );


            if (!qrContainer) {
                return;
            }


            qrContainer.innerHTML = "";


            new QRCode(
                qrContainer,
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
   LOAD QR GENERATOR
========================================================= */

function loadQrGenerator(callback) {

    if (
        typeof window.QRCode !==
        "undefined"
    ) {

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

function downloadQr(student) {

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
   SCANNER
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


    document
        .getElementById(
            "manualStudentId"
        )
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    event.preventDefault();

                    manualStudentSearch();

                }

            }
        );
}


/* =========================================================
   START SCANNER
========================================================= */

async function startScanner() {

    if (
        typeof window.Html5Qrcode ===
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


        try {
            await html5QrCode.clear();
        } catch (_) {}


        scannerRunning =
            false;


    } catch (error) {

        console.error(
            "Scanner stop error:",
            error
        );

        scannerRunning =
            false;
    }
}


/* =========================================================
   HANDLE QR SCAN
========================================================= */

async function handleQrScan(
    decodedText
) {

    await stopScanner();


    const id =
        String(
            decodedText
        ).trim();

    if (id.startsWith("VISION-PARENT:")) {
        await handleParentQrScan(id);
        return;
    }

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
   MANUAL SEARCH
========================================================= */

function manualStudentSearch() {

    const input =
        document.getElementById(
            "manualStudentId"
        );


    const id =
        input?.value
            ?.trim() || "";


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
   DATE - VIENTIANE
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
        )
        .formatToParts(
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
   FORMAT TIME
========================================================= */

function formatTime(value) {

    if (!value) {
        return "-";
    }


    try {

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

    } catch (_) {

        return "-";

    }
}


/* =========================================================
   ATTENDANCE ACTION MODAL
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


    const hasTimeIn =
        Boolean(
            record?.time_in
        );


    const hasTimeOut =
        Boolean(
            record?.time_out
        );


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
                    student.level ||
                    ""
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


            <div
                style="
                    margin-top:15px;
                    padding:14px;
                    background:#f8fafc;
                    border-radius:10px;
                    text-align:left;
                "
            >

                <p>
                    <strong>
                        Time In:
                    </strong>

                    ${
                        hasTimeIn
                            ? formatTime(
                                record.time_in
                            )
                            : "Not recorded"
                    }
                </p>


                <p>
                    <strong>
                        Time Out:
                    </strong>

                    ${
                        hasTimeOut
                            ? formatTime(
                                record.time_out
                            )
                            : "Not recorded"
                    }
                </p>

            </div>


            ${
                !hasTimeIn

                    ? `

                        <div
                            class="result-actions"
                            style="margin-top:20px"
                        >

                            <button
                                type="button"
                                class="primary-button"
                                id="timeInButton"
                            >
                                ✓ Time In
                            </button>

                        </div>

                    `

                    : ""
            }


            ${
                hasTimeIn &&
                !hasTimeOut

                    ? `

                        <div
                            class="result-actions"
                            style="margin-top:20px"
                        >

                            <button
                                type="button"
                                class="secondary-button"
                                id="pickupButton"
                            >
                                👤 Verify Pickup
                            </button>


                            <button
                                type="button"
                                class="primary-button"
                                id="timeOutButton"
                            >
                                ↗ Time Out
                            </button>

                        </div>

                    `

                    : ""
            }


            ${
                hasTimeOut

                    ? `

                        <div
                            style="
                                margin-top:20px;
                                padding:14px;
                                background:#dcfce7;
                                color:#166534;
                                border-radius:10px;
                            "
                        >

                            ✓ Attendance completed
                            for today.

                        </div>

                    `

                    : ""
            }


            <div
                style="
                    margin-top:20px;
                    text-align:center;
                "
            >

                <button
                    type="button"
                    class="secondary-button"
                    id="profileButton"
                >
                    View Student Profile
                </button>

            </div>

        </div>

    `;


    modal.classList.add(
        "show"
    );


    document
        .getElementById(
            "timeInButton"
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
            "timeOutButton"
        )
        ?.addEventListener(
            "click",
            () =>
                openPickupThenTimeOut(
                    student
                )
        );


    document
        .getElementById(
            "pickupButton"
        )
        ?.addEventListener(
            "click",
            () =>
                openPickupForm(
                    student
                )
        );


    document
        .getElementById(
            "profileButton"
        )
        ?.addEventListener(
            "click",
            () =>
                showStudentProfile(
                    student
                )
        );
}


/* =========================================================
   TIME IN
========================================================= */

async function recordTimeIn(
    student
) {

    try {

        const today =
            getVientianeDate();


        const {
            data: existingRecords,
            error: searchError
        } =
            await supabaseClient
                .from("attendance")
                .select("*")
                .eq(
                    "student_id",
                    student.id
                )
                .eq(
                    "date",
                    today
                )
                .limit(1);


        if (searchError) {
            throw searchError;
        }


        const existing =
            existingRecords?.[0] ||
            null;


        if (
            existing?.time_in
        ) {

            showToast(
                "This student already has a Time In today.",
                "error"
            );

            return;
        }


        const now =
            new Date().toISOString();


        if (existing) {

            const {
                error
            } =
                await supabaseClient
                    .from("attendance")
                    .update({
                        time_in:
                            now
                    })
                    .eq(
                        "id",
                        existing.id
                    );


            if (error) {
                throw error;
            }

        } else {

            const {
                error
            } =
                await supabaseClient
                    .from("attendance")
                    .insert({

                        student_id:
                            student.id,

                        student_name:
                            student.name,

                        date:
                            today,

                        time_in:
                            now

                    });


            if (error) {
                throw error;
            }

        }


        showToast(
            `${student.name} — Time In recorded successfully.`,
            "success"
        );


        await loadTodayAttendance();


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
   TIME OUT FLOW
========================================================= */

function openPickupThenTimeOut(
    student
) {

    openPickupForm(
        student,
        true
    );
}


/* =========================================================
   PICKUP FORM
========================================================= */

function openPickupForm(
    student,
    closeAfterSave = false
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
        parents
            .map(
                parent => `

                    <option
                        value="${escapeAttribute(
                            parent.name
                        )}"
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
            .join("");


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

                            <p>
                                This student is not
                                currently authorized
                                for normal pickup.
                                Staff verification
                                is required.
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
                ></textarea>

            </div>


            <div
                class="result-actions"
            >

                <button
                    type="button"
                    class="secondary-button"
                    id="cancelPickup"
                >
                    Cancel
                </button>


                <button
                    type="button"
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

                const pickupOption =
                    document.getElementById(
                        "pickupOptionInput"
                    );

                /* The Pickup Option label is immediately
                   before the select in the current form. */
                const pickupOptionLabel =
                    pickupOption?.previousElementSibling;


                /* =========================================
                   OTHER / GUEST
                   ========================================= */

                if (value === "Other") {

                    if (otherContainer) {
                        otherContainer.style.display =
                            "block";
                    }

                    if (pickupOptionLabel) {
                        pickupOptionLabel.style.display =
                            "block";
                    }

                    if (pickupOption) {
                        pickupOption.style.display =
                            "block";
                    }

                }


                /* =========================================
                   PARENT / GUARDIAN
                   ========================================= */

                else if (value) {

                    if (otherContainer) {
                        otherContainer.style.display =
                            "none";
                    }

                    /* Hide Pickup Option from staff.
                       The value is set automatically. */

                    if (pickupOptionLabel) {
                        pickupOptionLabel.style.display =
                            "none";
                    }

                    if (pickupOption) {
                        pickupOption.style.display =
                            "none";
                        pickupOption.value =
                            "Parent";
                    }

                    /* Fill the selected registered parent. */

                    const selected =
                        parents.find(
                            parent =>
                                parent.name ===
                                value
                        );

                    if (selected) {

                        const relationship =
                            document.getElementById(
                                "pickupRelationshipInput"
                            );

                        const phone =
                            document.getElementById(
                                "pickupPhoneInput"
                            );

                        if (relationship) {
                            relationship.value =
                                selected.label;
                        }

                        if (phone) {
                            phone.value =
                                selected.phone ||
                                "";
                        }
                    }

                }


                /* =========================================
                   NOTHING SELECTED
                   ========================================= */

                else {

                    if (otherContainer) {
                        otherContainer.style.display =
                            "none";
                    }

                    if (pickupOptionLabel) {
                        pickupOptionLabel.style.display =
                            "block";
                    }

                    if (pickupOption) {
                        pickupOption.style.display =
                            "block";
                        pickupOption.value =
                            "";
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
                    record,
                    closeAfterSave
                )
        );

}


/* =========================================================
   SAVE PICKUP
========================================================= */

/* =========================================================
   SAVE PICKUP
   ========================================================= */

async function savePickup(student, record) {

  try {

    console.log("Saving pickup information...");
    console.log("Student:", student);
    console.log("Attendance record:", record);


    /* =====================================================
       GET PICKUP PERSON
       ===================================================== */

    const personSelect =
      document.getElementById("pickupPersonSelect");

    if (!personSelect) {
      throw new Error(
        "Pickup person selector was not found."
      );
    }

    const selectedPerson =
      personSelect.value;


    const otherName =
      document
        .getElementById("otherPickupName")
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


    /* =====================================================
       OTHER PERSON
       ===================================================== */

    if (selectedPerson === "Other") {

      if (!otherName) {

        showToast(
          "Please enter the pickup person's name.",
          "error"
        );

        return;
      }

      pickup_person =
        otherName;
    }


    /* =====================================================
       GET OTHER PICKUP INFORMATION
       ===================================================== */

    const relationship =
      document
        .getElementById("pickupRelationshipInput")
        ?.value
        ?.trim() || "";


    const phone =
      document
        .getElementById("pickupPhoneInput")
        ?.value
        ?.trim() || "";


    const pickup_option =
      document
        .getElementById("pickupOptionInput")
        ?.value || "";


    const approver =
      document
        .getElementById("approverInput")
        ?.value
        ?.trim() || "";


    const notes =
      document
        .getElementById("notesInput")
        ?.value
        ?.trim() || "";


    /* =====================================================
       VALIDATION
       ===================================================== */

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


    /* =====================================================
       VERIFY ATTENDANCE RECORD
       ===================================================== */

    if (
      !record ||
      record.id === undefined ||
      record.id === null
    ) {

      console.error(
        "Invalid attendance record:",
        record
      );

      throw new Error(
        "Attendance record ID is missing."
      );
    }


    console.log(
      "Updating attendance ID:",
      record.id
    );


    /* =====================================================
       SUPABASE PAYLOAD

       IMPORTANT:
       Use lowercase pickup_relationship.
       PostgreSQL/Supabase commonly stores the column
       using lowercase naming.
       ===================================================== */

    const payload = {

      pickup_person:
        pickup_person,

      pickup_relationship:
        relationship,

      pickup_phone:
        phone,

      pickup_option:
        pickup_option,

      approver:
        approver,

      notes:
        notes,

      // FIX: Save the exact pickup time
      time_out:
        new Date().toISOString()

    };


    console.log(
      "Pickup update payload:",
      payload
    );


    /* =====================================================
       UPDATE ATTENDANCE
       ===================================================== */

    const {
      data,
      error
    } =
      await supabaseClient
        .from("attendance")
        .update(payload)
        .eq(
          "id",
          record.id
        )
        .select()
        .single();


    /* =====================================================
       SUPABASE ERROR
       ===================================================== */

    if (error) {

      console.error(
        "Supabase pickup update error:",
        error
      );

      console.error(
        "Error message:",
        error.message
      );

      console.error(
        "Error details:",
        error.details
      );

      console.error(
        "Error hint:",
        error.hint
      );

      console.error(
        "Error code:",
        error.code
      );

      throw error;
    }


    /* =====================================================
       SUCCESS
       ===================================================== */

    console.log(
      "Pickup saved successfully:",
      data
    );


    showToast(
      `Pickup saved: ${pickup_person}`,
      "success"
    );


    /* Close modal */

    closeResultModal();


    /* Reload attendance */

    await loadTodayAttendance();


  } catch (error) {

    console.error(
      "Pickup save error:",
      error
    );


    let message =
      error?.message ||
      "Unable to save pickup information.";


    /*
       Give a clearer message for missing columns.
    */

    if (
      message
        .toLowerCase()
        .includes("pickup_relationship")
    ) {

      message =
        "Supabase could not find the pickup_relationship column. Please check the attendance table column name.";

    }


    showToast(
      message,
      "error"
    );

  }

}


/* =========================================================
   TIME OUT
========================================================= */

async function recordTimeOut(
    student
) {

    try {

        const today =
            getVientianeDate();


        const {
            data,
            error: searchError
        } =
            await supabaseClient
                .from("attendance")
                .select("*")
                .eq(
                    "student_id",
                    student.id
                )
                .eq(
                    "date",
                    today
                )
                .limit(1);


        if (searchError) {
            throw searchError;
        }


        const existing =
            data?.[0] ||
            null;


        if (!existing) {

            showToast(
                "This student has not been timed in today.",
                "error"
            );

            return;
        }


        if (!existing.time_in) {

            showToast(
                "Time In must be recorded first.",
                "error"
            );

            return;
        }


        if (existing.time_out) {

            showToast(
                "This student already has a Time Out today.",
                "error"
            );

            return;
        }


        const now =
            new Date().toISOString();


        const {
            error
        } =
            await supabaseClient
                .from("attendance")
                .update({

                    time_out:
                        now

                })
                .eq(
                    "id",
                    existing.id
                );


        if (error) {
            throw error;
        }


        showToast(
            `${student.name} — Time Out recorded successfully.`,
            "success"
        );


        await loadTodayAttendance();


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
   LOAD TODAY ATTENDANCE
========================================================= */

async function loadTodayAttendance() {

    try {

        const today =
            getVientianeDate();


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
                        ascending:
                            false
                    }
                );


        if (error) {
            throw error;
        }


        attendanceRecords =
            data || [];

        writeLocalCache(
            ATTENDANCE_CACHE_KEY,
            attendanceRecords
        );


        updateAttendanceStatistics();

        renderAttendance();

        renderDashboard();


    } catch (error) {
        console.error("Unable to load attendance:", error);

        if (!restoreAttendanceCache()) {
            showToast(error?.message || "Unable to load attendance.", "error");
        } else {
            showToast("Using saved attendance data while reconnecting.", "error");
        }
    }
}

/* =========================================================
   ATTENDANCE STATISTICS
========================================================= */

function updateAttendanceStatistics() {

    const timeInCount =
        attendanceRecords.filter(
            record =>
                Boolean(
                    record.time_in
                )
        ).length;


    const timeOutCount =
        attendanceRecords.filter(
            record =>
                Boolean(
                    record.time_out
                )
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


    const currentlyInElement =
        document.getElementById(
            "currentlyInCount"
        );


    if (timeInElement) {

        timeInElement.textContent =
            timeInCount;

    }


    if (timeOutElement) {

        timeOutElement.textContent =
            timeOutCount;

    }


    if (currentlyInElement) {

        currentlyInElement.textContent =
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

                const searchable = [

                    record.student_id,

                    record.student_name,

                    record.pickup_person,

                    record.Pickup_relationship,

                    record.pickup_phone,

                    record.pickup_option,

                    record.approver

                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();


                return (
                    !search ||
                    searchable.includes(
                        search
                    )
                );

            }
        );


    if (!filtered.length) {

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
        filtered
            .map(
                record => {

                    const complete =
                        Boolean(
                            record.time_in &&
                            record.time_out
                        );


                    const status =
                        complete
                            ? "Completed"
                            : record.time_in
                                ? "Currently In"
                                : "Pending";


                    return `

                        <tr>

                            <td>

                                <strong>
                                    ${escapeHtml(
                                        record.student_name ||
                                        record.student_id
                                    )}
                                </strong>

                                <small
                                    style="
                                        display:block;
                                        opacity:.65;
                                    "
                                >
                                    ${escapeHtml(
                                        record.student_id
                                    )}
                                </small>

                            </td>


                            <td>

                                ${escapeHtml(
                                    findStudent(
                                        record.student_id
                                    )?.level ||
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

                                ${
                                    record.pickup_person
                                        ? `

                                            <strong>
                                                ${escapeHtml(
                                                    record.pickup_person
                                                )}
                                            </strong>

                                            <small
                                                style="
                                                    display:block;
                                                    opacity:.65;
                                                "
                                            >
                                                ${escapeHtml(
                                                    record.Pickup_relationship ||
                                                    record.pickup_option ||
                                                    ""
                                                )}
                                            </small>

                                        `
                                        : "-"
                                }

                            </td>


                            <td>

                                <span
                                    class="status ${
                                        complete
                                            ? "authorized"
                                            : "pending"
                                    }"
                                >

                                    ${status}

                                </span>

                            </td>

                        </tr>

                    `;

                }
            )
            .join("");
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

    const body =
        document.getElementById(
            "dashboardAttendanceBody"
        );


    if (!body) {
        return;
    }


    const recent =
        attendanceRecords
            .slice(
                0,
                10
            );


    if (!recent.length) {

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
        recent
            .map(
                record => {

                    const complete =
                        Boolean(
                            record.time_in &&
                            record.time_out
                        );


                    const status =
                        complete
                            ? "Completed"
                            : record.time_in
                                ? "Currently In"
                                : "Pending";


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
                                        record.student_id
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

                                <span
                                    class="status ${
                                        complete
                                            ? "authorized"
                                            : "pending"
                                    }"
                                >

                                    ${status}

                                </span>

                            </td>

                        </tr>

                    `;

                }
            )
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
            async () => {

                await loadTodayAttendance();

                showToast(
                    "Attendance refreshed.",
                    "success"
                );

            }
        );
}


/* =========================================================
   REPORTS / CSV
========================================================= */

function initializeReports() {

    document
        .getElementById("exportCsv")
        ?.addEventListener("click", exportAttendanceReport);

    document
        .getElementById("reportPeriod")
        ?.addEventListener("change", updateReportDateControls);

    document
        .getElementById("reportReferenceDate")
        ?.addEventListener("change", updateReportDateControls);

    document
        .getElementById("reportStartDate")
        ?.addEventListener("change", updateReportDateControls);

    document
        .getElementById("reportEndDate")
        ?.addEventListener("change", updateReportDateControls);

    updateReportDateControls();
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function dateFromParts(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateOnly(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function formatDateInput(date) {
    return dateFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function getAcademicYearStartYear(referenceDate) {
    return referenceDate.getMonth() >= 7
        ? referenceDate.getFullYear()
        : referenceDate.getFullYear() - 1;
}

function getReportRange() {
    const period = document.getElementById("reportPeriod")?.value || "weekly";
    const referenceValue = document.getElementById("reportReferenceDate")?.value || getVientianeDate();
    const referenceDate = parseDateOnly(referenceValue) || new Date();

    if (period === "custom") {
        const start = document.getElementById("reportStartDate")?.value || "";
        const end = document.getElementById("reportEndDate")?.value || "";
        if (!start || !end) throw new Error("Please select both custom start and end dates.");
        if (start > end) throw new Error("Custom start date cannot be after the end date.");
        return { start, end, label: "Custom" };
    }

    if (period === "monthly") {
        const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        return { start: formatDateInput(start), end: formatDateInput(end), label: "Monthly" };
    }

    if (period === "first_semester") {
        const academicStart = getAcademicYearStartYear(referenceDate);
        return {
            start: dateFromParts(academicStart, 8, 1),
            end: dateFromParts(academicStart, 12, 31),
            label: "1st Semester"
        };
    }

    if (period === "second_semester") {
        const academicStart = getAcademicYearStartYear(referenceDate);
        return {
            start: dateFromParts(academicStart + 1, 1, 1),
            end: dateFromParts(academicStart + 1, 5, 31),
            label: "2nd Semester"
        };
    }

    // Weekly: Monday through Sunday.
    const start = new Date(referenceDate);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: formatDateInput(start), end: formatDateInput(end), label: "Weekly" };
}

function updateReportDateControls() {
    const period = document.getElementById("reportPeriod")?.value || "weekly";
    const custom = document.getElementById("customReportDates");
    if (custom) custom.style.display = period === "custom" ? "grid" : "none";

    try {
        const range = getReportRange();
        const summary = document.getElementById("reportRangeSummary");
        if (summary) summary.textContent = `${range.label}: ${range.start} → ${range.end}`;
    } catch (error) {
        const summary = document.getElementById("reportRangeSummary");
        if (summary) summary.textContent = error.message;
    }
}

async function loadReportAttendance(start, end) {
    const { data, error } = await supabaseClient
        .from("attendance")
        .select("*")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

function getPickupRelationship(record) {
    return record?.Pickup_relationship ?? record?.pickup_relationship ?? "";
}

function attendanceRows(records) {
    const studentMap = new Map(students.map(student => [String(student.id), student]));
    return records.map(record => {
        const student = studentMap.get(String(record.student_id));
        return [
            record.date || "",
            record.student_id || "",
            record.student_name || student?.name || "",
            student?.level || record.level || "",
            record.time_in ? formatTime(record.time_in) : "",
            record.time_out ? formatTime(record.time_out) : "",
            record.pickup_person || "",
            getPickupRelationship(record),
            record.pickup_phone || "",
            record.pickup_option || "",
            record.approver || "",
            record.notes || ""
        ];
    });
}

async function loadSheetJs() {
    if (window.XLSX) return window.XLSX;

    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-vision-xlsx="1"]');
        if (existing) {
            existing.addEventListener("load", () => resolve(window.XLSX));
            existing.addEventListener("error", () => reject(new Error("Excel library could not be loaded.")));
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.async = true;
        script.dataset.visionXlsx = "1";
        script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("Excel library is unavailable."));
        script.onerror = () => reject(new Error("Excel library could not be loaded. Check the internet connection."));
        document.head.appendChild(script);
    });
}

function downloadCsvRows(headers, rows, filename) {
    const csv = [headers, ...rows]
        .map(row => row.map(value => csvEscape(value)).join(","))
        .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function exportAttendanceReport() {
    const button = document.getElementById("exportCsv");
    const originalText = button?.textContent || "Export Excel";

    try {
        const range = getReportRange();
        if (button) {
            button.disabled = true;
            button.textContent = "Preparing...";
        }

        const records = await loadReportAttendance(range.start, range.end);
        if (!records.length) {
            showToast(`No attendance records found from ${range.start} to ${range.end}.`, "error");
            return;
        }

        const headers = [
            "Date", "Student ID", "Student Name", "Level", "Time In", "Time Out",
            "Pickup Person", "Pickup Relationship", "Pickup Phone", "Pickup Option",
            "Approver", "Notes"
        ];
        const rows = attendanceRows(records);

        try {
            const XLSX = await loadSheetJs();
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            worksheet["!cols"] = [
                { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 13 }, { wch: 13 },
                { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 40 }
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
            XLSX.writeFile(workbook, `Vision-School-Attendance-${range.label.replace(/\s+/g, "-")}-${range.start}-to-${range.end}.xlsx`);
            showToast(`Excel report exported: ${range.start} to ${range.end}.`, "success");
        } catch (excelError) {
            console.warn("Excel export fallback:", excelError);
            downloadCsvRows(headers, rows, `Vision-School-Attendance-${range.label.replace(/\s+/g, "-")}-${range.start}-to-${range.end}.csv`);
            showToast("Excel library could not load, so a CSV fallback was downloaded.", "success");
        }
    } catch (error) {
        console.error("Report export error:", error);
        showToast(error?.message || "Unable to export attendance report.", "error");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}


function csvEscape(value) {

    const text =
        String(
            value ?? ""
        );


    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n")
    ) {

        return `"${text.replace(
            /"/g,
            '""'
        )}"`;

    }


    return text;
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


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key !==
                "Escape"
            ) {
                return;
            }


            document
                .querySelectorAll(
                    ".modal.show"
                )
                .forEach(modal => {

                    modal.classList.remove(
                        "show"
                    );

                });

        }
    );
}


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
   REALTIME
========================================================= */

function scheduleRealtimeRefresh(type) {

    if (type === "students") {
        realtimeNeedsStudents = true;
    }

    if (type === "attendance") {
        realtimeNeedsAttendance = true;
    }

    if (realtimeRefreshTimer) {
        return;
    }

    // Supabase can emit several changes for one real-world action.
    // Coalesce them so the UI does not repeatedly download/render the same data.
    realtimeRefreshTimer = setTimeout(async () => {

        const refreshStudents = realtimeNeedsStudents;
        const refreshAttendance = realtimeNeedsAttendance;

        realtimeNeedsStudents = false;
        realtimeNeedsAttendance = false;
        realtimeRefreshTimer = null;

        try {
            const tasks = [];

            if (refreshStudents) {
                tasks.push(loadStudents());
            }

            if (refreshAttendance) {
                tasks.push(loadTodayAttendance());
            }

            await Promise.all(tasks);
        } catch (error) {
            console.error("Realtime refresh error:", error);
        }

    }, 350);
}


function initializeRealtime() {

    if (!supabaseClient) {
        return;
    }

    try {

        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
        }

        realtimeChannel =
            supabaseClient
                .channel("vision-school-live")
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "students"
                    },
                    () => scheduleRealtimeRefresh("students")
                )
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "attendance"
                    },
                    () => scheduleRealtimeRefresh("attendance")
                )
                .subscribe();

    } catch (error) {
        console.error(
            "Realtime initialization error:",
            error
        );
    }
}

/* =========================================================
   FIND STUDENT
========================================================= */

function findStudent(
    studentId
) {

    return students.find(
        student =>
            String(
                student.id
            ) ===
            String(
                studentId
            )
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

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


function escapeAttribute(value) {

    return escapeHtml(
        value
    );
}


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message,
    type = "success"
) {

    const toast =
        document.getElementById(
            "toast"
        );


    if (!toast) {
        return;
    }


    clearTimeout(
        toastTimer
    );


    toast.textContent =
        message;


    toast.className =
        "toast";


    toast.classList.add(
        "show"
    );


    toast.classList.add(
        type
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
   DEBUG HELPER
========================================================= */

window.VisionSchool = {

    reloadStudents:
        loadStudents,

    reloadAttendance:
        loadTodayAttendance,

    findStudent:
        findStudent,

    getStudents:
        () => students,

    getAttendance:
        () => attendanceRecords

};


console.log(
    "Vision School app.js loaded successfully."
);
