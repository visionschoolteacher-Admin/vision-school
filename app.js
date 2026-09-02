/* =========================================================
   VISION SCHOOL
   STUDENT QR ATTENDANCE + PICKUP SYSTEM
   PERFORMANCE OPTIMIZED VERSION

   PRESERVED FEATURES:
   - Dashboard
   - Students
   - QR Scanner
   - Attendance
   - Reports
   - Student QR
   - Parent / Guardian selection
   - Parent QR support
   - Pickup authorization
   - Supabase
   - Realtime
   - Time In
   - Time Out / Pickup

   PERFORMANCE:
   - Faster startup
   - Smaller Supabase queries
   - Map-based lookups
   - Cached attendance
   - Reduced DOM rendering
   - Realtime debounce
   - No unnecessary reload after QR scan
========================================================= */


/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL =
    "https://ymonpeujmhaymkxfmmtq.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";


let supabaseClient = null;


/* =========================================================
   APPLICATION STATE
========================================================= */

let students = [];
let attendanceRecords = [];

let studentsById = new Map();
let attendanceByStudentId = new Map();

let currentStudent = null;

let html5QrCode = null;
let scannerRunning = false;

let realtimeChannel = null;

let toastTimer = null;


/* =========================================================
   LOAD CONTROL
========================================================= */

let studentsLoadPromise = null;
let attendanceLoadPromise = null;

let studentsRefreshPending = false;
let attendanceRefreshPending = false;

let realtimeRefreshTimer = null;


/* =========================================================
   CURRENT ACTIVE SECTION
========================================================= */

let currentSection = "dashboard";


/* =========================================================
   START APPLICATION
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    console.log("Vision School starting...");

    /* -----------------------------------------------------
       Initialize Supabase
    ----------------------------------------------------- */

    if (typeof window.supabase === "undefined") {

        console.error("Supabase library not loaded.");

        showToast(
            "Supabase library is not loaded.",
            "error"
        );

        return;
    }

    supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );


    /* -----------------------------------------------------
       Initialize UI immediately
       Do NOT wait for database
    ----------------------------------------------------- */

    initializeNavigation();
    initializeMobileMenu();
    initializeClock();
    initializeStudentModal();
    initializeScanner();
    initializeSearch();
    initializeReports();
    initializeModalClosing();


    /* -----------------------------------------------------
       Render initial interface
    ----------------------------------------------------- */

    renderCurrentSection();


    /* -----------------------------------------------------
       Load database in background
    ----------------------------------------------------- */

    loadInitialData();


    /* -----------------------------------------------------
       Realtime
    ----------------------------------------------------- */

    initializeRealtime();


    console.log("Vision School interface ready.");

});


/* =========================================================
   INITIAL DATA
========================================================= */

async function loadInitialData() {

    try {

        updateConnectionStatus(
            "loading",
            "Connecting..."
        );


        const connectionPromise =
            testSupabaseConnection();


        /*
         * Load students and attendance at the same time.
         * Previously these were loaded one after another.
         */

        await Promise.all([
            connectionPromise,
            loadStudents({
                render: false
            }),
            loadTodayAttendance({
                render: false
            })
        ]);


        renderCurrentSection();


        updateConnectionStatus(
            "connected",
            "Connected"
        );


        console.log(
            "Initial data loaded:",
            students.length,
            "students /",
            attendanceRecords.length,
            "attendance records"
        );

    } catch (error) {

        console.error(
            "Initial data loading error:",
            error
        );

        updateConnectionStatus(
            "error",
            "Connection problem"
        );

        showToast(
            "The app opened, but some data could not be loaded.",
            "error"
        );

    }

}


/* =========================================================
   SUPABASE CONNECTION TEST
========================================================= */

async function testSupabaseConnection() {

    if (!supabaseClient) {
        throw new Error("Supabase client not initialized.");
    }


    const { error } =
        await supabaseClient
            .from("students")
            .select("id")
            .limit(1);


    if (error) {

        console.error(
            "Supabase connection failed:",
            error
        );

        throw error;
    }


    updateConnectionStatus(
        "connected",
        "Connected"
    );

}


/* =========================================================
   CONNECTION STATUS
========================================================= */

function updateConnectionStatus(
    status,
    text
) {

    const dot =
        document.querySelector(
            "#connectionStatus, .connection-status"
        );

    const label =
        document.querySelector(
            "#connectionText, .connection-text"
        );


    if (dot) {

        dot.classList.remove(
            "connected",
            "disconnected",
            "error",
            "loading"
        );

        dot.classList.add(status);

    }


    if (label) {
        label.textContent = text;
    }

}


/* =========================================================
   LOAD STUDENTS
========================================================= */

async function loadStudents(
    options = {}
) {

    const render =
        options.render !== false;


    /*
     * Prevent duplicate simultaneous requests.
     */

    if (studentsLoadPromise) {
        return studentsLoadPromise;
    }


    studentsLoadPromise =
        (async () => {

            try {

                const { data, error } =
                    await supabaseClient
                        .from("students")
                        .select(
                            "id,name,level,parent,phone,authorized,created_at"
                        )
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


                /*
                 * Build fast lookup map.
                 */

                studentsById =
                    new Map();


                for (const student of students) {

                    studentsById.set(
                        String(student.id),
                        student
                    );

                }


                populateLevelFilter();


                if (render) {
                    renderCurrentSection();
                }


                return students;

            } catch (error) {

                console.error(
                    "loadStudents error:",
                    error
                );

                throw error;

            } finally {

                studentsLoadPromise = null;

            }

        })();


    return studentsLoadPromise;

}


/* =========================================================
   FIND STUDENT
========================================================= */

function findStudent(studentId) {

    if (
        studentId === null ||
        studentId === undefined
    ) {
        return null;
    }


    return studentsById.get(
        String(studentId)
    ) || null;

}


/* =========================================================
   LOAD TODAY ATTENDANCE
========================================================= */

async function loadTodayAttendance(
    options = {}
) {

    const render =
        options.render !== false;


    /*
     * Prevent duplicate simultaneous requests.
     */

    if (attendanceLoadPromise) {
        return attendanceLoadPromise;
    }


    attendanceLoadPromise =
        (async () => {

            try {

                const today =
                    getVientianeDate();


                const { data, error } =
                    await supabaseClient
                        .from("attendance")
                        .select(
                            "id,student_id,student_name,date,time_in,time_out,pickup_person,pickup_relationship,pickup_phone,pickup_option,approver,notes,created_at"
                        )
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


                /*
                 * Build fast attendance lookup.
                 */

                attendanceByStudentId =
                    new Map();


                for (const record of attendanceRecords) {

                    attendanceByStudentId.set(
                        String(record.student_id),
                        record
                    );

                }


                if (render) {
                    renderCurrentSection();
                }


                return attendanceRecords;

            } catch (error) {

                console.error(
                    "loadTodayAttendance error:",
                    error
                );

                throw error;

            } finally {

                attendanceLoadPromise = null;

            }

        })();


    return attendanceLoadPromise;

}


/* =========================================================
   CURRENT DATE - VIENTIANE
========================================================= */

function getVientianeDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Asia/Vientiane"
        }
    ).format(
        new Date()
    );

}


/* =========================================================
   CURRENT TIME
========================================================= */

function getCurrentTime() {

    return new Date().toISOString();

}


/* =========================================================
   NAVIGATION
========================================================= */

function initializeNavigation() {

    const navLinks =
        document.querySelectorAll(
            "[data-section]"
        );


    navLinks.forEach(link => {

        link.addEventListener(
            "click",
            event => {

                event.preventDefault();

                const section =
                    link.dataset.section;

                if (section) {
                    showSection(section);
                }

            }
        );

    });

}


/* =========================================================
   SHOW SECTION
========================================================= */

function showSection(sectionName) {

    currentSection =
        sectionName;


    const sections =
        document.querySelectorAll(
            ".page-section"
        );


    sections.forEach(section => {

        const matches =
            section.id === sectionName ||
            section.dataset.section === sectionName;


        section.style.display =
            matches ? "" : "none";

        section.classList.toggle(
            "active",
            matches
        );

    });


    const navLinks =
        document.querySelectorAll(
            "[data-section]"
        );


    navLinks.forEach(link => {

        link.classList.toggle(
            "active",
            link.dataset.section === sectionName
        );

    });


    renderCurrentSection();

}


/* =========================================================
   RENDER ONLY CURRENT SECTION
========================================================= */

function renderCurrentSection() {

    switch (currentSection) {

        case "dashboard":
            renderDashboard();
            break;

        case "students":
            renderStudents();
            break;

        case "attendance":
            renderAttendance();
            break;

        case "reports":
            /*
             * Reports normally render when requested.
             */
            break;

        case "scanner":
            /*
             * Scanner UI is handled separately.
             */
            break;

        default:
            break;

    }

}


/* =========================================================
   MOBILE MENU
========================================================= */

function initializeMobileMenu() {

    const menuButton =
        document.querySelector(
            "#menuButton, .menu-button, .mobile-menu-button"
        );


    const sidebar =
        document.querySelector(
            "#sidebar, .sidebar, .mobile-sidebar"
        );


    if (!menuButton || !sidebar) {
        return;
    }


    menuButton.addEventListener(
        "click",
        () => {

            sidebar.classList.toggle(
                "open"
            );

        }
    );

}


/* =========================================================
   CLOCK
========================================================= */

function initializeClock() {

    const updateClock = () => {

        const now =
            new Date();


        const time =
            new Intl.DateTimeFormat(
                "en-US",
                {
                    timeZone: "Asia/Vientiane",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            ).format(now);


        const elements =
            document.querySelectorAll(
                ".live-clock, #liveClock, #currentTime"
            );


        elements.forEach(
            element => {
                element.textContent =
                    time;
            }
        );

    };


    updateClock();


    setInterval(
        updateClock,
        1000
    );

}


/* =========================================================
   STUDENT SEARCH
========================================================= */

let studentSearchTimer = null;

let attendanceSearchTimer = null;


function initializeSearch() {

    const studentSearch =
        document.querySelector(
            "#studentSearch, .student-search"
        );


    if (studentSearch) {

        studentSearch.addEventListener(
            "input",
            () => {

                clearTimeout(
                    studentSearchTimer
                );


                studentSearchTimer =
                    setTimeout(
                        () => {

                            renderStudents();

                        },
                        120
                    );

            }
        );

    }


    const attendanceSearch =
        document.querySelector(
            "#attendanceSearch, .attendance-search"
        );


    if (attendanceSearch) {

        attendanceSearch.addEventListener(
            "input",
            () => {

                clearTimeout(
                    attendanceSearchTimer
                );


                attendanceSearchTimer =
                    setTimeout(
                        () => {

                            renderAttendance();

                        },
                        120
                    );

            }
        );

    }

}


/* =========================================================
   STUDENT LEVEL FILTER
========================================================= */

function populateLevelFilter() {

    const select =
        document.querySelector(
            "#levelFilter, .level-filter"
        );


    if (!select) {
        return;
    }


    const currentValue =
        select.value;


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
        .sort(
            (a, b) =>
                String(a).localeCompare(
                    String(b)
                )
        );


    select.innerHTML =
        `<option value="">All Levels</option>` +
        levels
            .map(
                level =>
                    `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`
            )
            .join("");


    select.value =
        currentValue;

}


/* =========================================================
   RENDER STUDENTS
========================================================= */

function renderStudents() {

    const container =
        document.querySelector(
            "#studentsTableBody, #studentTableBody, .students-table-body"
        );


    if (!container) {
        return;
    }


    const searchInput =
        document.querySelector(
            "#studentSearch, .student-search"
        );


    const levelFilter =
        document.querySelector(
            "#levelFilter, .level-filter"
        );


    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";


    const level =
        levelFilter
            ? levelFilter.value
            : "";


    const filtered =
        students.filter(
            student => {

                if (
                    level &&
                    String(student.level) !==
                    String(level)
                ) {
                    return false;
                }


                if (!search) {
                    return true;
                }


                const parentText =
                    getParentOptions(student)
                        .map(
                            p =>
                                `${p.name} ${p.phone}`
                        )
                        .join(" ");


                const searchable =
                    [
                        student.id,
                        student.name,
                        student.level,
                        student.phone,
                        parentText
                    ]
                    .join(" ")
                    .toLowerCase();


                return searchable.includes(
                    search
                );

            }
        );


    if (!filtered.length) {

        container.innerHTML =
            `<tr>
                <td colspan="10" class="empty-state">
                    No students found.
                </td>
            </tr>`;

        return;
    }


    const html =
        filtered
            .map(
                student =>
                    buildStudentRow(student)
            )
            .join("");


    container.innerHTML =
        html;


    initializeStudentRowButtons();

}


/* =========================================================
   BUILD STUDENT ROW
========================================================= */

function buildStudentRow(student) {

    const parents =
        getParentOptions(student);


    const parentNames =
        parents
            .map(
                parent =>
                    parent.name
            )
            .filter(Boolean)
            .join(", ");


    const phone =
        student.phone ||
        parents[0]?.phone ||
        "";


    return `
        <tr>
            <td>${escapeHtml(student.id)}</td>

            <td>
                ${escapeHtml(student.name)}
            </td>

            <td>
                ${escapeHtml(student.level || "")}
            </td>

            <td>
                ${escapeHtml(parentNames)}
            </td>

            <td>
                ${escapeHtml(phone)}
            </td>

            <td>
                ${student.authorized
                    ? "Authorized"
                    : "Not Authorized"}
            </td>

            <td>

                <button
                    type="button"
                    class="view-student-btn"
                    data-id="${escapeHtml(student.id)}">
                    View
                </button>

                <button
                    type="button"
                    class="edit-student-btn"
                    data-id="${escapeHtml(student.id)}">
                    Edit
                </button>

                <button
                    type="button"
                    class="remove-student-btn"
                    data-id="${escapeHtml(student.id)}">
                    Remove
                </button>

                <button
                    type="button"
                    class="student-qr-btn"
                    data-id="${escapeHtml(student.id)}">
                    QR
                </button>

            </td>

        </tr>
    `;

}


/* =========================================================
   STUDENT ROW BUTTONS
========================================================= */

function initializeStudentRowButtons() {

    document
        .querySelectorAll(
            ".view-student-btn"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const student =
                            findStudent(
                                button.dataset.id
                            );


                        if (student) {
                            showStudentDetails(
                                student
                            );
                        }

                    }
                );

            }
        );


    document
        .querySelectorAll(
            ".edit-student-btn"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const student =
                            findStudent(
                                button.dataset.id
                            );


                        if (student) {
                            openStudentModal(
                                student
                            );
                        }

                    }
                );

            }
        );


    document
        .querySelectorAll(
            ".remove-student-btn"
        )
        .forEach(
            button => {

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

            }
        );


    document
        .querySelectorAll(
            ".student-qr-btn"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const student =
                            findStudent(
                                button.dataset.id
                            );


                        if (student) {
                            generateStudentQR(
                                student
                            );
                        }

                    }
                );

            }
        );

}


/* =========================================================
   PARENT OPTIONS
========================================================= */

function getParentOptions(student) {

    if (!student) {
        return [];
    }


    let parents = [];


    /*
     * New JSON format
     */

    if (
        typeof student.parent === "string" &&
        student.parent.trim()
    ) {

        try {

            const parsed =
                JSON.parse(
                    student.parent
                );


            if (Array.isArray(parsed)) {

                parents =
                    parsed
                        .map(
                            parent => ({
                                label:
                                    parent.label ||
                                    "Parent / Guardian",

                                name:
                                    parent.name ||
                                    "",

                                phone:
                                    parent.phone ||
                                    ""
                            })
                        )
                        .filter(
                            parent =>
                                parent.name ||
                                parent.phone
                        );

            }

        } catch (error) {

            /*
             * Legacy format handled below.
             */

        }

    }


    /*
     * Legacy parent text format.
     */

    if (!parents.length && student.parent) {

        const parentText =
            String(student.parent);


        if (
            parentText.includes("|")
        ) {

            parents =
                parentText
                    .split("|")
                    .map(
                        item =>
                            item.trim()
                    )
                    .filter(Boolean)
                    .map(
                        item => {

                            const parts =
                                item.split(":");


                            if (parts.length >= 2) {

                                return {
                                    label:
                                        parts[0].trim(),

                                    name:
                                        parts
                                            .slice(1)
                                            .join(":")
                                            .trim(),

                                    phone:
                                        ""
                                };

                            }


                            return {
                                label:
                                    "Parent / Guardian",

                                name:
                                    item,

                                phone:
                                    ""
                            };

                        }
                    );

        } else {

            parents = [
                {
                    label:
                        "Parent / Guardian 1",

                    name:
                        parentText,

                    phone:
                        student.phone || ""
                }
            ];

        }

    }


    /*
     * Fallback
     */

    if (!parents.length) {

        parents = [
            {
                label:
                    "Parent / Guardian 1",

                name:
                    student.parent || "",

                phone:
                    student.phone || ""
            }
        ];

    }


    return parents.slice(
        0,
        3
    );

}


/* =========================================================
   BUILD PARENT DATA
========================================================= */

function buildParentData() {

    const parent1 =
        getElementValue(
            "studentParent"
        );


    const phone1 =
        getElementValue(
            "studentPhone"
        );


    const parent2 =
        getElementValue(
            "studentParent2"
        );


    const phone2 =
        getElementValue(
            "studentPhone2"
        );


    const parent3 =
        getElementValue(
            "studentParent3"
        );


    const phone3 =
        getElementValue(
            "studentPhone3"
        );


    const parents = [];


    if (parent1 || phone1) {

        parents.push({
            label:
                "Parent / Guardian 1",

            name:
                parent1,

            phone:
                phone1
        });

    }


    if (parent2 || phone2) {

        parents.push({
            label:
                "Parent / Guardian 2",

            name:
                parent2,

            phone:
                phone2
        });

    }


    if (parent3 || phone3) {

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
   STUDENT MODAL
========================================================= */

function initializeStudentModal() {

    const addButton =
        document.querySelector(
            "#addStudentBtn, .add-student-btn"
        );


    if (addButton) {

        addButton.addEventListener(
            "click",
            () => {

                openStudentModal();

            }
        );

    }


    const form =
        document.querySelector(
            "#studentForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                await saveStudent();

            }
        );

    }

}


/* =========================================================
   OPEN STUDENT MODAL
========================================================= */

function openStudentModal(
    student = null
) {

    currentStudent =
        student;


    const modal =
        document.querySelector(
            "#studentModal"
        );


    if (!modal) {
        return;
    }


    const title =
        modal.querySelector(
            ".modal-title, #studentModalTitle"
        );


    if (title) {

        title.textContent =
            student
                ? "Edit Student"
                : "Add Student";

    }


    setElementValue(
        "studentId",
        student?.id || ""
    );


    setElementValue(
        "studentName",
        student?.name || ""
    );


    setElementValue(
        "studentLevel",
        student?.level || ""
    );


    const parents =
        student
            ? getParentOptions(student)
            : [];


    setElementValue(
        "studentParent",
        parents[0]?.name || ""
    );


    setElementValue(
        "studentPhone",
        parents[0]?.phone ||
        student?.phone ||
        ""
    );


    setElementValue(
        "studentParent2",
        parents[1]?.name || ""
    );


    setElementValue(
        "studentPhone2",
        parents[1]?.phone || ""
    );


    setElementValue(
        "studentParent3",
        parents[2]?.name || ""
    );


    setElementValue(
        "studentPhone3",
        parents[2]?.phone || ""
    );


    setElementValue(
        "studentAuthorized",
        student?.authorized
            ? "true"
            : "false"
    );


    modal.classList.add(
        "open"
    );

    modal.style.display =
        "flex";

}


/* =========================================================
   SAVE STUDENT
========================================================= */

async function saveStudent() {

    if (!supabaseClient) {
        showToast(
            "Supabase is not connected.",
            "error"
        );
        return;
    }


    const id =
        getElementValue(
            "studentId"
        ).trim();


    const name =
        getElementValue(
            "studentName"
        ).trim();


    const level =
        getElementValue(
            "studentLevel"
        ).trim();


    const phone =
        getElementValue(
            "studentPhone"
        ).trim();


    const authorizedValue =
        getElementValue(
            "studentAuthorized"
        );


    if (!id || !name) {

        showToast(
            "Student ID and name are required.",
            "error"
        );

        return;
    }


    const payload = {

        id: id,

        name: name,

        level: level,

        parent:
            buildParentData(),

        phone:
            phone,

        authorized:
            authorizedValue === "true"

    };


    try {

        let result;


        if (currentStudent) {

            result =
                await supabaseClient
                    .from("students")
                    .update(payload)
                    .eq(
                        "id",
                        currentStudent.id
                    );

        } else {

            result =
                await supabaseClient
                    .from("students")
                    .insert(payload);

        }


        if (result.error) {
            throw result.error;
        }


        showToast(
            "Student saved successfully.",
            "success"
        );


        closeAllModals();


        /*
         * Refresh students.
         */

        await loadStudents({
            render: false
        });


        renderCurrentSection();


    } catch (error) {

        console.error(
            "saveStudent error:",
            error
        );


        showToast(
            error.message ||
            "Unable to save student.",
            "error"
        );

    }

}


/* =========================================================
   REMOVE STUDENT
========================================================= */

async function removeStudent(
    student
) {

    if (!student) {
        return;
    }


    const confirmed =
        confirm(
            `Remove ${student.name}?`
        );


    if (!confirmed) {
        return;
    }


    try {

        const { error } =
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
            "Student removed.",
            "success"
        );


        await loadStudents({
            render: false
        });


        renderCurrentSection();


    } catch (error) {

        console.error(
            "removeStudent error:",
            error
        );


        showToast(
            error.message ||
            "Unable to remove student.",
            "error"
        );

    }

}


/* =========================================================
   QR SCANNER
========================================================= */

function initializeScanner() {

    const startButton =
        document.querySelector(
            "#startScannerBtn, .start-scanner-btn"
        );


    const stopButton =
        document.querySelector(
            "#stopScannerBtn, .stop-scanner-btn"
        );


    if (startButton) {

        startButton.addEventListener(
            "click",
            startScanner
        );

    }


    if (stopButton) {

        stopButton.addEventListener(
            "click",
            stopScanner
        );

    }

}


/* =========================================================
   START SCANNER
========================================================= */

async function startScanner() {

    if (
        scannerRunning
    ) {
        return;
    }


    const reader =
        document.querySelector(
            "#reader"
        );


    if (!reader) {

        showToast(
            "Scanner area not found.",
            "error"
        );

        return;
    }


    if (
        typeof Html5Qrcode ===
        "undefined"
    ) {

        showToast(
            "QR scanner library is not loaded.",
            "error"
        );

        return;
    }


    try {

        html5QrCode =
            new Html5Qrcode(
                "reader"
            );


        scannerRunning =
            true;


        await html5QrCode.start(

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

            handleQrScan,

            () => {}

        );


    } catch (error) {

        console.error(
            "Scanner start error:",
            error
        );


        scannerRunning =
            false;


        showToast(
            "Unable to start scanner.",
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


    } catch (error) {

        console.warn(
            "Scanner stop warning:",
            error
        );

    }


    scannerRunning =
        false;


    try {

        html5QrCode.clear();

    } catch (error) {
        /* Ignore */
    }


    html5QrCode =
        null;

}


/* =========================================================
   QR SCAN
========================================================= */

async function handleQrScan(
    decodedText
) {

    /*
     * Stop scanner immediately.
     */

    await stopScanner();


    const id =
        String(decodedText)
            .trim();


    const student =
        findStudent(id);


    if (!student) {

        showToast(
            `Student ID ${id} not found.`,
            "error"
        );

        return;
    }


    /*
     * IMPORTANT:
     * We no longer call loadTodayAttendance()
     * here.
     *
     * The attendance cache is already available.
     * This removes an unnecessary network request
     * every time someone scans a student.
     */

    showAttendanceAction(
        student
    );

}


/* =========================================================
   SHOW ATTENDANCE ACTION
========================================================= */

function showAttendanceAction(
    student
) {

    currentStudent =
        student;


    const record =
        attendanceByStudentId.get(
            String(student.id)
        ) || null;


    const modal =
        document.querySelector(
            "#attendanceActionModal"
        );


    if (!modal) {
        return;
    }


    const nameElement =
        modal.querySelector(
            "#attendanceStudentName, .attendance-student-name"
        );


    const idElement =
        modal.querySelector(
            "#attendanceStudentId, .attendance-student-id"
        );


    const timeInElement =
        modal.querySelector(
            "#attendanceTimeIn, .attendance-time-in"
        );


    const timeOutElement =
        modal.querySelector(
            "#attendanceTimeOut, .attendance-time-out"
        );


    if (nameElement) {
        nameElement.textContent =
            student.name;
    }


    if (idElement) {
        idElement.textContent =
            student.id;
    }


    if (timeInElement) {

        timeInElement.textContent =
            record?.time_in
                ? formatTime(
                    record.time_in
                )
                : "Not recorded";

    }


    if (timeOutElement) {

        timeOutElement.textContent =
            record?.time_out
                ? formatTime(
                    record.time_out
                )
                : "Not recorded";

    }


    /*
     * Buttons
     */

    const timeInButton =
        modal.querySelector(
            "#timeInBtn, .time-in-btn"
        );


    const pickupButton =
        modal.querySelector(
            "#pickupBtn, .pickup-btn, .verify-pickup-btn"
        );


    const timeOutButton =
        modal.querySelector(
            "#timeOutBtn, .time-out-btn"
        );


    if (timeInButton) {

        timeInButton.style.display =
            record?.time_in
                ? "none"
                : "";

        timeInButton.onclick =
            () =>
                recordTimeIn(
                    student
                );

    }


    if (pickupButton) {

        pickupButton.style.display =
            record?.time_in &&
            !record?.time_out
                ? ""
                : "none";


        pickupButton.onclick =
            () =>
                openPickupForm(
                    student,
                    true
                );

    }


    if (timeOutButton) {

        timeOutButton.style.display =
            record?.time_in &&
            !record?.time_out
                ? ""
                : "none";


        timeOutButton.onclick =
            () =>
                recordTimeOut(
                    student
                );

    }


    modal.classList.add(
        "open"
    );

    modal.style.display =
        "flex";

}


/* =========================================================
   RECORD TIME IN
========================================================= */

async function recordTimeIn(
    student
) {

    if (!student) {
        return;
    }


    const today =
        getVientianeDate();


    try {

        /*
         * Small query only.
         */

        const { data, error } =
            await supabaseClient
                .from("attendance")
                .select(
                    "id,time_in,time_out"
                )
                .eq(
                    "student_id",
                    student.id
                )
                .eq(
                    "date",
                    today
                )
                .limit(1);


        if (error) {
            throw error;
        }


        const currentRecord =
            data?.[0] || null;


        const timeIn =
            getCurrentTime();


        let savedRecord;


        if (!currentRecord) {

            const { data: inserted, error: insertError } =
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
                            timeIn

                    })
                    .select()
                    .single();


            if (insertError) {
                throw insertError;
            }


            savedRecord =
                inserted;

        } else {

            if (
                currentRecord.time_in
            ) {

                showToast(
                    "Time In is already recorded.",
                    "info"
                );

                return;
            }


            const { data: updated, error: updateError } =
                await supabaseClient
                    .from("attendance")
                    .update({
                        time_in:
                            timeIn
                    })
                    .eq(
                        "id",
                        currentRecord.id
                    )
                    .select()
                    .single();


            if (updateError) {
                throw updateError;
            }


            savedRecord =
                updated;

        }


        /*
         * Update local cache immediately.
         * User does not need to wait for another full
         * attendance download.
         */

        updateAttendanceCache(
            savedRecord
        );


        updateAttendanceUI();


        showToast(
            "Time In recorded successfully.",
            "success"
        );


        closeAllModals();


    } catch (error) {

        console.error(
            "recordTimeIn error:",
            error
        );


        showToast(
            error.message ||
            "Unable to record Time In.",
            "error"
        );

    }

}


/* =========================================================
   RECORD TIME OUT
========================================================= */

async function recordTimeOut(
    student
) {

    if (!student) {
        return;
    }


    const today =
        getVientianeDate();


    try {

        const { data, error } =
            await supabaseClient
                .from("attendance")
                .select(
                    "id,time_in,time_out"
                )
                .eq(
                    "student_id",
                    student.id
                )
                .eq(
                    "date",
                    today
                )
                .limit(1);


        if (error) {
            throw error;
        }


        const record =
            data?.[0] || null;


        if (!record) {

            showToast(
                "No attendance record found.",
                "error"
            );

            return;
        }


        if (!record.time_in) {

            showToast(
                "Student has no Time In.",
                "error"
            );

            return;
        }


        if (record.time_out) {

            showToast(
                "Time Out is already recorded.",
                "info"
            );

            return;
        }


        const timeOut =
            getCurrentTime();


        const { data: updated, error: updateError } =
            await supabaseClient
                .from("attendance")
                .update({
                    time_out:
                        timeOut
                })
                .eq(
                    "id",
                    record.id
                )
                .select()
                .single();


        if (updateError) {
            throw updateError;
        }


        updateAttendanceCache(
            updated
        );


        updateAttendanceUI();


        showToast(
            "Time Out recorded successfully.",
            "success"
        );


        closeAllModals();


    } catch (error) {

        console.error(
            "recordTimeOut error:",
            error
        );


        showToast(
            error.message ||
            "Unable to record Time Out.",
            "error"
        );

    }

}


/* =========================================================
   ATTENDANCE CACHE UPDATE
========================================================= */

function updateAttendanceCache(
    record
) {

    if (!record) {
        return;
    }


    const studentId =
        String(
            record.student_id
        );


    attendanceByStudentId.set(
        studentId,
        record
    );


    const existingIndex =
        attendanceRecords.findIndex(
            item =>
                String(item.id) ===
                String(record.id)
        );


    if (existingIndex >= 0) {

        attendanceRecords[
            existingIndex
        ] =
            record;

    } else {

        attendanceRecords.unshift(
            record
        );

    }


    /*
     * Keep attendance sorted newest first.
     */

    attendanceRecords.sort(
        (a, b) =>
            new Date(
                b.created_at ||
                0
            ) -
            new Date(
                a.created_at ||
                0
            )
    );

}


/* =========================================================
   UPDATE ATTENDANCE UI
========================================================= */

function updateAttendanceUI() {

    updateAttendanceStatistics();


    if (
        currentSection ===
        "attendance"
    ) {
        renderAttendance();
    }


    if (
        currentSection ===
        "dashboard"
    ) {
        renderDashboard();
    }

}


/* =========================================================
   PICKUP FORM
========================================================= */

function openPickupForm(
    student,
    closeAfterSave = false
) {

    if (!student) {
        return;
    }


    const record =
        attendanceByStudentId.get(
            String(student.id)
        ) || null;


    if (!record) {

        showToast(
            "No attendance record found.",
            "error"
        );

        return;
    }


    const modal =
        document.querySelector(
            "#pickupModal"
        );


    if (!modal) {
        return;
    }


    const parents =
        getParentOptions(
            student
        );


    const parentSelect =
        modal.querySelector(
            "#pickupPerson"
        );


    if (parentSelect) {

        parentSelect.innerHTML =
            `<option value="">Select Parent / Guardian</option>` +
            parents
                .map(
                    (parent, index) =>
                        `<option value="parent-${index}">
                            ${escapeHtml(parent.name)}
                        </option>`
                )
                .join("") +
            `<option value="other">Other / Guest</option>`;

    }


    setElementValue(
        "pickupOtherName",
        ""
    );


    setElementValue(
        "pickupRelationship",
        ""
    );


    setElementValue(
        "pickupPhone",
        ""
    );


    setElementValue(
        "pickupOption",
        ""
    );


    setElementValue(
        "pickupApprover",
        ""
    );


    setElementValue(
        "pickupNotes",
        ""
    );


    /*
     * Parent selection auto fills phone.
     */

    if (parentSelect) {

        parentSelect.onchange =
            () => {

                const value =
                    parentSelect.value;


                if (
                    value.startsWith(
                        "parent-"
                    )
                ) {

                    const index =
                        Number(
                            value.replace(
                                "parent-",
                                ""
                            )
                        );


                    const parent =
                        parents[index];


                    if (parent) {

                        setElementValue(
                            "pickupPhone",
                            parent.phone || ""
                        );


                        setElementValue(
                            "pickupOtherName",
                            parent.name || ""
                        );


                        setElementValue(
                            "pickupRelationship",
                            parent.label || "Parent / Guardian"
                        );

                    }

                } else {

                    setElementValue(
                        "pickupPhone",
                        ""
                    );

                    setElementValue(
                        "pickupOtherName",
                        ""
                    );

                    setElementValue(
                        "pickupRelationship",
                        ""
                    );

                }

            };

    }


    const saveButton =
        modal.querySelector(
            "#savePickupBtn, .save-pickup-btn"
        );


    if (saveButton) {

        saveButton.onclick =
            async () => {

                await savePickup(
                    student,
                    record,
                    closeAfterSave
                );

            };

    }


    modal.classList.add(
        "open"
    );

    modal.style.display =
        "flex";

}


/* =========================================================
   SAVE PICKUP
========================================================= */

async function savePickup(
    student,
    record,
    closeAfterSave = false
) {

    try {

        console.log(
            "Saving pickup information..."
        );


        if (!student) {

            showToast(
                "Student information is missing.",
                "error"
            );

            return;
        }


        if (!record) {

            showToast(
                "Attendance record is missing.",
                "error"
            );

            return;
        }


        const pickupPerson =
            getElementValue(
                "pickupPerson"
            );


        const otherName =
            getElementValue(
                "pickupOtherName"
            ).trim();


        const relationship =
            getElementValue(
                "pickupRelationship"
            ).trim();


        const phone =
            getElementValue(
                "pickupPhone"
            ).trim();


        const pickupOption =
            getElementValue(
                "pickupOption"
            ).trim();


        const approver =
            getElementValue(
                "pickupApprover"
            ).trim();


        const notes =
            getElementValue(
                "pickupNotes"
            ).trim();


        if (!pickupPerson) {

            showToast(
                "Please select the pickup person.",
                "error"
            );

            return;
        }


        if (
            pickupPerson === "other" &&
            !otherName
        ) {

            showToast(
                "Please enter the pickup person's name.",
                "error"
            );

            return;
        }


        if (!pickupOption) {

            showToast(
                "Please select a pickup option.",
                "error"
            );

            return;
        }


        if (!approver) {

            showToast(
                "Please enter the approver.",
                "error"
            );

            return;
        }


        /*
         * IMPORTANT:
         * This is the Pickup Time / Time Out fix.
         */

        const pickupTime =
            new Date().toISOString();


        const finalPickupPerson =
            pickupPerson === "other"
                ? otherName
                : otherName ||
                  pickupPerson;


        const payload = {

            pickup_person:
                finalPickupPerson,

            /*
             * Keep current database field behavior.
             */
            pickup_relationship:
                relationship,

            pickup_phone:
                phone,

            pickup_option:
                pickupOption,

            approver:
                approver,

            notes:
                notes,

            /*
             * CRITICAL:
             * Pickup also records Time Out.
             */
            time_out:
                pickupTime

        };


        console.log(
            "Pickup payload:",
            payload
        );


        const { data: updated, error } =
            await supabaseClient
                .from("attendance")
                .update(payload)
                .eq(
                    "id",
                    record.id
                )
                .select()
                .single();


        if (error) {
            throw error;
        }


        /*
         * Update local cache immediately.
         */

        updateAttendanceCache(
            updated
        );


        updateAttendanceUI();


        showToast(
            "Pickup saved successfully.",
            "success"
        );


        closeAllModals();


    } catch (error) {

        console.error(
            "savePickup error:",
            error
        );


        showToast(
            error.message ||
            "Unable to save pickup information.",
            "error"
        );

    }

}


/* =========================================================
   ATTENDANCE STATISTICS
========================================================= */

function updateAttendanceStatistics() {

    let timeInCount = 0;
    let timeOutCount = 0;


    for (
        const record of attendanceRecords
    ) {

        if (record.time_in) {
            timeInCount++;
        }


        if (record.time_out) {
            timeOutCount++;
        }

    }


    const currentlyIn =
        timeInCount -
        timeOutCount;


    updateStatisticElement(
        [
            "#totalTimeIn",
            "#timeInCount",
            ".time-in-count"
        ],
        timeInCount
    );


    updateStatisticElement(
        [
            "#totalTimeOut",
            "#timeOutCount",
            ".time-out-count"
        ],
        timeOutCount
    );


    updateStatisticElement(
        [
            "#currentlyIn",
            "#currentCount",
            ".currently-in-count"
        ],
        Math.max(
            currentlyIn,
            0
        )
    );

}


/* =========================================================
   RENDER ATTENDANCE
========================================================= */

function renderAttendance() {

    const container =
        document.querySelector(
            "#attendanceTableBody, .attendance-table-body"
        );


    if (!container) {
        return;
    }


    const searchInput =
        document.querySelector(
            "#attendanceSearch, .attendance-search"
        );


    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";


    let records =
        attendanceRecords;


    if (search) {

        records =
            attendanceRecords.filter(
                record => {

                    const student =
                        findStudent(
                            record.student_id
                        );


                    const relationship =
                        record.Pickup_relationship ||
                        record.pickup_relationship ||
                        "";


                    const searchable =
                        [
                            record.student_id,
                            record.student_name,
                            student?.level,
                            record.pickup_person,
                            relationship,
                            record.pickup_phone,
                            record.pickup_option,
                            record.approver,
                            record.notes
                        ]
                        .join(" ")
                        .toLowerCase();


                    return searchable.includes(
                        search
                    );

                }
            );

    }


    if (!records.length) {

        container.innerHTML =
            `<tr>
                <td colspan="10" class="empty-state">
                    No attendance records found.
                </td>
            </tr>`;

        return;
    }


    container.innerHTML =
        records
            .map(
                record =>
                    buildAttendanceRow(
                        record
                    )
            )
            .join("");

}


/* =========================================================
   BUILD ATTENDANCE ROW
========================================================= */

function buildAttendanceRow(
    record
) {

    const student =
        findStudent(
            record.student_id
        );


    const relationship =
        record.Pickup_relationship ||
        record.pickup_relationship ||
        "";


    return `
        <tr>

            <td>
                ${escapeHtml(
                    record.student_id
                )}
            </td>

            <td>
                ${escapeHtml(
                    record.student_name || ""
                )}
            </td>

            <td>
                ${escapeHtml(
                    student?.level || ""
                )}
            </td>

            <td>
                ${record.time_in
                    ? formatTime(
                        record.time_in
                    )
                    : "-"}
            </td>

            <td>
                ${record.time_out
                    ? formatTime(
                        record.time_out
                    )
                    : "-"}
            </td>

            <td>
                ${escapeHtml(
                    record.pickup_person || ""
                )}
            </td>

            <td>
                ${escapeHtml(
                    relationship
                )}
            </td>

            <td>
                ${escapeHtml(
                    record.pickup_phone || ""
                )}
            </td>

            <td>
                ${escapeHtml(
                    record.pickup_option || ""
                )}
            </td>

            <td>
                ${escapeHtml(
                    record.approver || ""
                )}
            </td>

        </tr>
    `;

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

    const container =
        document.querySelector(
            "#dashboardRecentAttendance, .dashboard-recent-attendance"
        );


    updateAttendanceStatistics();


    if (!container) {
        return;
    }


    const recent =
        attendanceRecords.slice(
            0,
            10
        );


    if (!recent.length) {

        container.innerHTML =
            `<div class="empty-state">
                No attendance records today.
            </div>`;

        return;
    }


    container.innerHTML =
        recent
            .map(
                record => {

                    const student =
                        findStudent(
                            record.student_id
                        );


                    return `
                        <div class="dashboard-attendance-item">

                            <strong>
                                ${escapeHtml(
                                    record.student_name || ""
                                )}
                            </strong>

                            <span>
                                ${escapeHtml(
                                    student?.level || ""
                                )}
                            </span>

                            <span>
                                Time In:
                                ${
                                    record.time_in
                                        ? formatTime(
                                            record.time_in
                                        )
                                        : "-"
                                }
                            </span>

                            <span>
                                Time Out:
                                ${
                                    record.time_out
                                        ? formatTime(
                                            record.time_out
                                        )
                                        : "-"
                                }
                            </span>

                        </div>
                    `;

                }
            )
            .join("");

}


/* =========================================================
   REPORTS
========================================================= */

function initializeReports() {

    const exportButton =
        document.querySelector(
            "#exportAttendanceBtn, .export-attendance-btn"
        );


    if (exportButton) {

        exportButton.addEventListener(
            "click",
            exportAttendanceCSV
        );

    }

}


/* =========================================================
   EXPORT CSV
========================================================= */

function exportAttendanceCSV() {

    const headers = [
        "Student ID",
        "Student Name",
        "Level",
        "Date",
        "Time In",
        "Time Out",
        "Pickup Person",
        "Relationship",
        "Phone",
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


                const relationship =
                    record.Pickup_relationship ||
                    record.pickup_relationship ||
                    "";


                return [
                    record.student_id,
                    record.student_name,
                    student?.level || "",
                    record.date,
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
                    record.pickup_person || "",
                    relationship,
                    record.pickup_phone || "",
                    record.pickup_option || "",
                    record.approver || "",
                    record.notes || ""
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
                            csvEscape(value)
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
        "Attendance CSV exported.",
        "success"
    );

}


/* =========================================================
   CSV ESCAPE
========================================================= */

function csvEscape(
    value
) {

    const text =
        value === null ||
        value === undefined
            ? ""
            : String(value);


    return `"${text.replace(
        /"/g,
        '""'
    )}"`;

}


/* =========================================================
   STUDENT QR
========================================================= */

async function generateStudentQR(
    student
) {

    if (!student) {
        return;
    }


    await loadQrGenerator();


    const modal =
        document.querySelector(
            "#studentQRModal"
        );


    const container =
        document.querySelector(
            "#studentQRCode, .student-qr-code"
        );


    if (!modal || !container) {
        return;
    }


    container.innerHTML =
        "";


    new QRCode(
        container,
        {
            text:
                String(student.id),

            width:
                250,

            height:
                250
        }
    );


    const name =
        modal.querySelector(
            "#qrStudentName, .qr-student-name"
        );


    if (name) {

        name.textContent =
            student.name;

    }


    modal.classList.add(
        "open"
    );

    modal.style.display =
        "flex";

}


/* =========================================================
   LOAD QR GENERATOR
========================================================= */

let qrGeneratorPromise =
    null;


function loadQrGenerator() {

    if (
        typeof QRCode !==
        "undefined"
    ) {

        return Promise.resolve();

    }


    if (qrGeneratorPromise) {
        return qrGeneratorPromise;
    }


    qrGeneratorPromise =
        new Promise(
            (
                resolve,
                reject
            ) => {

                const existing =
                    document.querySelector(
                        'script[data-qrcodejs]'
                    );


                if (existing) {

                    existing.addEventListener(
                        "load",
                        () => resolve()
                    );


                    existing.addEventListener(
                        "error",
                        reject
                    );


                    return;

                }


                const script =
                    document.createElement(
                        "script"
                    );


                script.src =
                    "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";


                script.dataset.qrcodejs =
                    "true";


                script.onload =
                    () => resolve();


                script.onerror =
                    () =>
                        reject(
                            new Error(
                                "QR generator failed to load."
                            )
                        );


                document.head.appendChild(
                    script
                );

            }
        );


    return qrGeneratorPromise;

}


/* =========================================================
   REALTIME
========================================================= */

function initializeRealtime() {

    if (
        !supabaseClient ||
        realtimeChannel
    ) {
        return;
    }


    realtimeChannel =
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
                () => {

                    scheduleRealtimeRefresh(
                        "students"
                    );

                }
            )

            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "attendance"
                },
                () => {

                    scheduleRealtimeRefresh(
                        "attendance"
                    );

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

}


/* =========================================================
   REALTIME REFRESH
========================================================= */

function scheduleRealtimeRefresh(
    type
) {

    if (type === "students") {

        studentsRefreshPending =
            true;

    }


    if (type === "attendance") {

        attendanceRefreshPending =
            true;

    }


    /*
     * One timer for grouping events.
     * Both pending flags are preserved,
     * so one event cannot cancel the other.
     */

    if (realtimeRefreshTimer) {
        return;
    }


    realtimeRefreshTimer =
        setTimeout(
            async () => {

                realtimeRefreshTimer =
                    null;


                const refreshStudents =
                    studentsRefreshPending;


                const refreshAttendance =
                    attendanceRefreshPending;


                studentsRefreshPending =
                    false;


                attendanceRefreshPending =
                    false;


                try {

                    const promises = [];


                    if (refreshStudents) {

                        promises.push(
                            loadStudents({
                                render: false
                            })
                        );

                    }


                    if (refreshAttendance) {

                        promises.push(
                            loadTodayAttendance({
                                render: false
                            })
                        );

                    }


                    if (promises.length) {

                        await Promise.all(
                            promises
                        );

                        renderCurrentSection();

                    }

                } catch (error) {

                    console.error(
                        "Realtime refresh error:",
                        error
                    );

                }

            },
            500
        );

}


/* =========================================================
   MODAL CLOSING
========================================================= */

function initializeModalClosing() {

    document.addEventListener(
        "click",
        event => {

            const closeButton =
                event.target.closest(
                    "[data-close-modal], .modal-close, .close-modal"
                );


            if (closeButton) {

                closeAllModals();

            }

        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                event.target.classList.contains(
                    "modal"
                )
            ) {

                closeAllModals();

            }

        }
    );

}


/* =========================================================
   CLOSE MODALS
========================================================= */

function closeAllModals() {

    document
        .querySelectorAll(
            ".modal"
        )
        .forEach(
            modal => {

                modal.classList.remove(
                    "open"
                );


                modal.style.display =
                    "none";

            }
        );

}


/* =========================================================
   SHOW STUDENT DETAILS
========================================================= */

function showStudentDetails(
    student
) {

    const modal =
        document.querySelector(
            "#studentDetailsModal"
        );


    if (!modal) {
        return;
    }


    const parents =
        getParentOptions(
            student
        );


    setElementText(
        [
            "#detailsStudentId",
            ".details-student-id"
        ],
        student.id
    );


    setElementText(
        [
            "#detailsStudentName",
            ".details-student-name"
        ],
        student.name
    );


    setElementText(
        [
            "#detailsStudentLevel",
            ".details-student-level"
        ],
        student.level || ""
    );


    setElementText(
        [
            "#detailsStudentParent",
            ".details-student-parent"
        ],
        parents
            .map(
                parent =>
                    parent.name
            )
            .filter(Boolean)
            .join(", ")
    );


    setElementText(
        [
            "#detailsStudentPhone",
            ".details-student-phone"
        ],
        student.phone || parents[0]?.phone || ""
    );


    modal.classList.add(
        "open"
    );

    modal.style.display =
        "flex";

}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTime(
    value
) {

    if (!value) {
        return "-";
    }


    try {

        return new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    "Asia/Vientiane",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit"
            }
        ).format(
            new Date(value)
        );

    } catch (error) {

        return value;

    }

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message,
    type = "info"
) {

    let toast =
        document.querySelector(
            "#toast"
        );


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );


        toast.id =
            "toast";


        toast.className =
            "toast";


        document.body.appendChild(
            toast
        );

    }


    toast.textContent =
        message;


    toast.className =
        `toast ${type}`;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}


/* =========================================================
   HELPERS
========================================================= */

function getElementValue(
    id
) {

    const element =
        document.getElementById(
            id
        );


    if (!element) {
        return "";
    }


    return element.value ||
        "";

}


function setElementValue(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (!element) {
        return;
    }


    element.value =
        value ?? "";

}


function setElementText(
    selectors,
    value
) {

    for (
        const selector of selectors
    ) {

        const element =
            document.querySelector(
                selector
            );


        if (element) {

            element.textContent =
                value ?? "";

            return;

        }

    }

}


function updateStatisticElement(
    selectors,
    value
) {

    for (
        const selector of selectors
    ) {

        const element =
            document.querySelector(
                selector
            );


        if (element) {

            element.textContent =
                value;

            return;

        }

    }

}


function escapeHtml(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }


    return String(value)
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
