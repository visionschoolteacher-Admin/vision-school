/* =========================================================
   VISION SCHOOL
   STUDENT ATTENDANCE & PICKUP MANAGEMENT SYSTEM
   app.js
   ========================================================= */

/* =========================================================
   SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL =
    "https://ymonpeujmhaymkxfmmtq.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */

let students = [];
let attendance = [];
let scanner = null;
let scannerRunning = false;
let editingStudentId = null;


/* =========================================================
   DOM HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    console.log("Vision School Attendance System starting...");

    startClock();

    setupNavigation();

    setupMobileMenu();

    setupStudentModal();

    setupScannerControls();

    setupSearch();

    setupAttendanceRefresh();

    setupExport();

    updateConnectionStatus("connecting");

    await initializeApp();

});


/* =========================================================
   INITIALIZE APP
   ========================================================= */

async function initializeApp() {

    try {

        await testSupabaseConnection();

        await loadStudents();

        await loadAttendance();

        populateLevelFilter();

        updateDashboard();

        console.log(
            "Vision School Attendance System ready."
        );

    } catch (error) {

        console.error(
            "Initialization error:",
            error
        );

        updateConnectionStatus("offline");

        showToast(
            "Unable to connect to Supabase.",
            "error"
        );

    }

}


/* =========================================================
   CONNECTION TEST
   ========================================================= */

async function testSupabaseConnection() {

    const { error } =
        await supabaseClient
            .from("students")
            .select("student_id")
            .limit(1);

    if (error) {

        console.error(
            "Supabase connection error:",
            error
        );

        updateConnectionStatus("offline");

        throw error;

    }

    updateConnectionStatus("online");

}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function updateConnectionStatus(status) {

    const dot = $("connectionDot");
    const text = $("connectionText");

    if (!dot || !text) {
        return;
    }

    dot.classList.remove(
        "offline",
        "online"
    );

    if (status === "online") {

        dot.classList.add("online");

        text.textContent =
            "Connected";

    }

    else if (status === "offline") {

        dot.classList.add("offline");

        text.textContent =
            "Offline";

    }

    else {

        dot.classList.add("offline");

        text.textContent =
            "Connecting...";

    }

}


/* =========================================================
   LIVE CLOCK
   ========================================================= */

function startClock() {

    updateClock();

    setInterval(
        updateClock,
        1000
    );

}


function updateClock() {

    const now = new Date();

    const timeElement =
        $("liveTime");

    const dateElement =
        $("liveDate");

    const dashboardDate =
        $("dashboardDate");

    const time =
        now.toLocaleTimeString(
            "en-US",
            {
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
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        );

    if (timeElement) {

        timeElement.textContent =
            time;

    }

    if (dateElement) {

        dateElement.textContent =
            date;

    }

    if (dashboardDate) {

        dashboardDate.textContent =
            date;

    }

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    document
        .querySelectorAll(
            "[data-section]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const section =
                        button.dataset.section;

                    if (!section) {
                        return;
                    }

                    showSection(section);

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

    const target =
        $(sectionId);

    if (target) {

        target.classList.add(
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

    updatePageHeader(
        sectionId
    );

    const sidebar =
        $("sidebar");

    if (sidebar) {

        sidebar.classList.remove(
            "mobile-open"
        );

    }

    if (
        sectionId ===
        "attendance"
    ) {

        loadAttendance();

    }

    if (
        sectionId ===
        "students"
    ) {

        renderStudents();

    }

    if (
        sectionId ===
        "dashboard"
    ) {

        updateDashboard();

    }

}


/* =========================================================
   PAGE HEADER
   ========================================================= */

function updatePageHeader(
    sectionId
) {

    const titles = {

        dashboard: [
            "Dashboard",
            "Student attendance overview"
        ],

        students: [
            "Students",
            "Manage student records"
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
            "Export attendance records"
        ]

    };

    const info =
        titles[sectionId];

    if (!info) {
        return;
    }

    if ($("pageTitle")) {

        $("pageTitle")
            .textContent = info[0];

    }

    if ($("pageSubtitle")) {

        $("pageSubtitle")
            .textContent = info[1];

    }

}


/* =========================================================
   MOBILE MENU
   ========================================================= */

function setupMobileMenu() {

    const button =
        $("mobileMenu");

    const sidebar =
        $("sidebar");

    if (!button || !sidebar) {
        return;
    }

    button.addEventListener(
        "click",
        () => {

            sidebar.classList.toggle(
                "mobile-open"
            );

        }
    );

}


/* =========================================================
   LOAD STUDENTS
   ========================================================= */

async function loadStudents() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("students")
            .select("*")
            .order(
                "student_name",
                {
                    ascending: true
                }
            );

    if (error) {

        console.error(
            "Load students error:",
            error
        );

        throw error;

    }

    students =
        data || [];

    renderStudents();

    updateTotalStudents();

}


/* =========================================================
   TOTAL STUDENTS
   ========================================================= */

function updateTotalStudents() {

    const element =
        $("totalStudents");

    if (element) {

        element.textContent =
            students.length;

    }

}


/* =========================================================
   RENDER STUDENTS
   ========================================================= */

function renderStudents() {

    const body =
        $("studentsBody");

    if (!body) {
        return;
    }

    const search =
        (
            $("studentSearch")?.value ||
            ""
        )
            .trim()
            .toLowerCase();

    const level =
        $("levelFilter")?.value ||
        "";

    const filtered =
        students.filter(student => {

            const text = [

                student.student_id,
                student.student_name,
                student.level,
                student.parent_name,
                student.parent_name_2,
                student.parent_name_3,
                student.phone,
                student.phone_2,
                student.phone_3

            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch =
                !search ||
                text.includes(search);

            const matchesLevel =
                !level ||
                student.level === level;

            return (
                matchesSearch &&
                matchesLevel
            );

        });

    if (
        filtered.length === 0
    ) {

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
        filtered.map(
            student => {

                const authorized =
                    student.authorized !== false;

                return `

                    <tr>

                        <td>
                            <strong>
                                ${escapeHtml(
                                    student.student_id
                                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                                student.student_name
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                student.level || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                student.parent_name || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                student.phone || "-"
                            )}
                        </td>

                        <td>

                            <span class="status-badge ${
                                authorized
                                    ? "present"
                                    : "absent"
                            }">

                                ${
                                    authorized
                                        ? "Authorized"
                                        : "Needs Approval"
                                }

                            </span>

                        </td>

                        <td>

                            <div class="action-buttons">

                                <button
                                    type="button"
                                    class="secondary-button small-button"
                                    onclick="editStudent('${escapeJs(
                                        student.student_id
                                    )}')"
                                >
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="secondary-button small-button"
                                    onclick="deleteStudent('${escapeJs(
                                        student.student_id
                                    )}')"
                                >
                                    Delete
                                </button>

                            </div>

                        </td>

                        <td>

                            <button
                                type="button"
                                class="primary-button small-button"
                                onclick="showStudentQR('${escapeJs(
                                    student.student_id
                                )}')"
                            >
                                QR
                            </button>

                        </td>

                    </tr>

                `;

            }
        ).join("");

}


/* =========================================================
   LEVEL FILTER
   ========================================================= */

function populateLevelFilter() {

    const select =
        $("levelFilter");

    if (!select) {
        return;
    }

    const current =
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
            .sort();

    select.innerHTML =
        `
            <option value="">
                All Levels
            </option>
        `;

    levels.forEach(level => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            level;

        option.textContent =
            level;

        select.appendChild(
            option
        );

    });

    select.value =
        current;

}


/* =========================================================
   STUDENT MODAL
   ========================================================= */

function setupStudentModal() {

    const addButton =
        $("addStudentButton");

    const closeButton =
        $("closeStudentModal");

    const cancelButton =
        $("cancelStudent");

    const modal =
        $("studentModal");

    const form =
        $("studentForm");

    if (addButton) {

        addButton.addEventListener(
            "click",
            () => {

                editingStudentId =
                    null;

                resetStudentForm();

                modalTitle(
                    "Add Student"
                );

                openModal(
                    "studentModal"
                );

            }
        );

    }

    if (closeButton) {

        closeButton.addEventListener(
            "click",
            () => closeModal(
                "studentModal"
            )
        );

    }

    if (cancelButton) {

        cancelButton.addEventListener(
            "click",
            () => closeModal(
                "studentModal"
            )
        );

    }

    if (form) {

        form.addEventListener(
            "submit",
            saveStudent
        );

    }

    if (modal) {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    closeModal(
                        "studentModal"
                    );

                }

            }
        );

    }

}


/* =========================================================
   RESET STUDENT FORM
   ========================================================= */

function resetStudentForm() {

    const form =
        $("studentForm");

    if (form) {

        form.reset();

    }

    if ($("studentAuthorized")) {

        $("studentAuthorized")
            .checked = true;

    }

    editingStudentId =
        null;

}


/* =========================================================
   SAVE STUDENT
   ========================================================= */

async function saveStudent(
    event
) {

    event.preventDefault();

    const student = {

        student_id:
            $("studentId").value
                .trim(),

        student_name:
            $("studentName").value
                .trim(),

        level:
            $("studentLevel").value
                .trim(),

        parent_name:
            $("studentParent").value
                .trim(),

        phone:
            $("studentPhone").value
                .trim(),

        parent_name_2:
            $("studentParent2").value
                .trim(),

        phone_2:
            $("studentPhone2").value
                .trim(),

        parent_name_3:
            $("studentParent3").value
                .trim(),

        phone_3:
            $("studentPhone3").value
                .trim(),

        authorized:
            $("studentAuthorized")
                .checked

    };

    if (
        !student.student_id ||
        !student.student_name ||
        !student.level
    ) {

        showToast(
            "Please complete the required fields.",
            "error"
        );

        return;

    }

    try {

        let result;

        if (editingStudentId) {

            result =
                await supabaseClient
                    .from("students")
                    .update(student)
                    .eq(
                        "student_id",
                        editingStudentId
                    );

        } else {

            result =
                await supabaseClient
                    .from("students")
                    .insert(
                        student
                    );

        }

        if (result.error) {

            throw result.error;

        }

        closeModal(
            "studentModal"
        );

        showToast(
            editingStudentId
                ? "Student updated successfully."
                : "Student added successfully.",
            "success"
        );

        editingStudentId =
            null;

        await loadStudents();

        populateLevelFilter();

    } catch (error) {

        console.error(
            "Save student error:",
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
   EDIT STUDENT
   ========================================================= */

window.editStudent =
async function(studentId) {

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(studentId)
        );

    if (!student) {

        showToast(
            "Student not found.",
            "error"
        );

        return;

    }

    editingStudentId =
        student.student_id;

    $("studentId").value =
        student.student_id || "";

    $("studentName").value =
        student.student_name || "";

    $("studentLevel").value =
        student.level || "";

    $("studentParent").value =
        student.parent_name || "";

    $("studentPhone").value =
        student.phone || "";

    $("studentParent2").value =
        student.parent_name_2 || "";

    $("studentPhone2").value =
        student.phone_2 || "";

    $("studentParent3").value =
        student.parent_name_3 || "";

    $("studentPhone3").value =
        student.phone_3 || "";

    $("studentAuthorized").checked =
        student.authorized !== false;

    modalTitle(
        "Edit Student"
    );

    openModal(
        "studentModal"
    );

};


/* =========================================================
   DELETE STUDENT
   ========================================================= */

window.deleteStudent =
async function(studentId) {

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(studentId)
        );

    if (!student) {
        return;
    }

    const confirmed =
        confirm(
            `Delete ${student.student_name} (${student.student_id})?`
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
                    "student_id",
                    student.student_id
                );

        if (error) {
            throw error;
        }

        showToast(
            "Student deleted.",
            "success"
        );

        await loadStudents();

        populateLevelFilter();

    } catch (error) {

        console.error(
            "Delete student error:",
            error
        );

        showToast(
            error.message ||
            "Unable to delete student.",
            "error"
        );

    }

};


/* =========================================================
   MODAL HELPERS
   ========================================================= */

function openModal(id) {

    const modal =
        $(id);

    if (modal) {

        modal.classList.add(
            "active"
        );

    }

}


function closeModal(id) {

    const modal =
        $(id);

    if (modal) {

        modal.classList.remove(
            "active"
        );

    }

}


function modalTitle(title) {

    const modal =
        $("studentModal");

    if (!modal) {
        return;
    }

    const heading =
        modal.querySelector(
            ".modal-header h2"
        );

    if (heading) {

        heading.textContent =
            title;

    }

}


/* =========================================================
   SEARCH
   ========================================================= */

function setupSearch() {

    $("studentSearch")
        ?.addEventListener(
            "input",
            renderStudents
        );

    $("levelFilter")
        ?.addEventListener(
            "change",
            renderStudents
        );

    $("attendanceSearch")
        ?.addEventListener(
            "input",
            renderAttendance
        );

    $("manualSearchButton")
        ?.addEventListener(
            "click",
            manualStudentSearch
        );

    $("manualStudentId")
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
   LOAD ATTENDANCE
   ========================================================= */

async function loadAttendance() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("attendance")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

    if (error) {

        console.error(
            "Load attendance error:",
            error
        );

        throw error;

    }

    attendance =
        data || [];

    renderAttendance();

    updateDashboard();

}


/* =========================================================
   TODAY'S ATTENDANCE
   ========================================================= */

function getTodayAttendance() {

    const today =
        new Date();

    const year =
        today.getFullYear();

    const month =
        String(
            today.getMonth() + 1
        )
            .padStart(2, "0");

    const day =
        String(
            today.getDate()
        )
            .padStart(2, "0");

    const todayString =
        `${year}-${month}-${day}`;

    return attendance.filter(
        record => {

            const source =
                record.date ||
                record.created_at;

            if (!source) {
                return false;
            }

            return String(
                source
            ).substring(0, 10) ===
                todayString;

        }
    );

}


/* =========================================================
   RENDER ATTENDANCE
   ========================================================= */

function renderAttendance() {

    const body =
        $("attendanceBody");

    if (!body) {
        return;
    }

    const search =
        (
            $("attendanceSearch")
                ?.value ||
            ""
        )
            .trim()
            .toLowerCase();

    const today =
        getTodayAttendance();

    const filtered =
        today.filter(record => {

            const text = [

                record.student_id,
                record.student_name,
                record.level,
                record.pickup_person,
                record.pickup_name,
                record.pickup_relationship,
                record.status

            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (
                !search ||
                text.includes(search)
            );

        });

    if (
        filtered.length === 0
    ) {

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

    } else {

        body.innerHTML =
            filtered.map(
                record => {

                    return `

                        <tr>

                            <td>
                                <strong>
                                    ${escapeHtml(
                                        getAttendanceStudentName(
                                            record
                                        )
                                    )}
                                </strong>

                                <small>
                                    ${escapeHtml(
                                        record.student_id || ""
                                    )}
                                </small>
                            </td>

                            <td>
                                ${escapeHtml(
                                    record.level || "-"
                                )}
                            </td>

                            <td>
                                ${formatDateTime(
                                    record.time_in
                                )}
                            </td>

                            <td>
                                ${formatDateTime(
                                    record.time_out
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    record.pickup_person ||
                                    record.pickup_name ||
                                    "-"
                                )}
                            </td>

                            <td>
                                ${attendanceStatusBadge(
                                    record
                                )}
                            </td>

                        </tr>

                    `;

                }
            ).join("");

    }

    renderDashboardAttendance();

}


/* =========================================================
   DASHBOARD ATTENDANCE
   ========================================================= */

function renderDashboardAttendance() {

    const body =
        $("dashboardAttendanceBody");

    if (!body) {
        return;
    }

    const today =
        getTodayAttendance()
            .slice(0, 8);

    if (
        today.length === 0
    ) {

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
        today.map(
            record => {

                return `

                    <tr>

                        <td>
                            ${escapeHtml(
                                getAttendanceStudentName(
                                    record
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                record.level || "-"
                            )}
                        </td>

                        <td>
                            ${formatDateTime(
                                record.time_in
                            )}
                        </td>

                        <td>
                            ${formatDateTime(
                                record.time_out
                            )}
                        </td>

                        <td>
                            ${attendanceStatusBadge(
                                record
                            )}
                        </td>

                    </tr>

                `;

            }
        ).join("");

}


/* =========================================================
   ATTENDANCE STATUS
   ========================================================= */

function attendanceStatusBadge(
    record
) {

    if (
        record.time_out
    ) {

        return `
            <span class="status-badge present">
                Completed
            </span>
        `;

    }

    if (
        record.time_in
    ) {

        return `
            <span class="status-badge present">
                Currently In
            </span>
        `;

    }

    return `
        <span class="status-badge">
            Recorded
        </span>
    `;

}


/* =========================================================
   ATTENDANCE STUDENT NAME
   ========================================================= */

function getAttendanceStudentName(
    record
) {

    if (
        record.student_name
    ) {

        return record.student_name;

    }

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(
                    record.student_id
                )
        );

    return (
        student?.student_name ||
        record.student_id ||
        "Unknown Student"
    );

}


/* =========================================================
   DASHBOARD COUNTS
   ========================================================= */

function updateDashboard() {

    const today =
        getTodayAttendance();

    const timeIn =
        today.filter(
            record =>
                Boolean(
                    record.time_in
                )
        ).length;

    const timeOut =
        today.filter(
            record =>
                Boolean(
                    record.time_out
                )
        ).length;

    const currentlyIn =
        today.filter(
            record =>
                record.time_in &&
                !record.time_out
        ).length;

    if ($("timeInCount")) {

        $("timeInCount")
            .textContent =
            timeIn;

    }

    if ($("timeOutCount")) {

        $("timeOutCount")
            .textContent =
            timeOut;

    }

    if ($("currentlyInCount")) {

        $("currentlyInCount")
            .textContent =
            currentlyIn;

    }

    updateTotalStudents();

    renderDashboardAttendance();

}


/* =========================================================
   REFRESH ATTENDANCE
   ========================================================= */

function setupAttendanceRefresh() {

    $("refreshAttendance")
        ?.addEventListener(
            "click",
            async () => {

                try {

                    await loadAttendance();

                    showToast(
                        "Attendance refreshed.",
                        "success"
                    );

                } catch (error) {

                    showToast(
                        "Unable to refresh attendance.",
                        "error"
                    );

                }

            }
        );

}


/* =========================================================
   QR SCANNER CONTROLS
   ========================================================= */

function setupScannerControls() {

    $("startScanner")
        ?.addEventListener(
            "click",
            startScanner
        );

    $("stopScanner")
        ?.addEventListener(
            "click",
            stopScanner
        );

}


/* =========================================================
   START QR SCANNER
   ========================================================= */

async function startScanner() {

    if (scannerRunning) {

        showToast(
            "Scanner is already running.",
            "info"
        );

        return;

    }

    if (
        typeof Html5Qrcode ===
        "undefined"
    ) {

        showToast(
            "QR scanner library is still loading. Please try again.",
            "error"
        );

        return;

    }

    try {

        scanner =
            new Html5Qrcode(
                "reader"
            );

        await scanner.start(

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

            async decodedText => {

                await handleQRCode(
                    decodedText
                );

            },

            errorMessage => {

                // Scanner continuously reports
                // normal "QR not found" messages.
                // We intentionally do not show
                // these to the user.

            }

        );

        scannerRunning =
            true;

        showToast(
            "QR Scanner started.",
            "success"
        );

    } catch (error) {

        console.error(
            "Scanner error:",
            error
        );

        scannerRunning =
            false;

        showToast(
            "Unable to start camera. Please allow camera access.",
            "error"
        );

    }

}


/* =========================================================
   STOP QR SCANNER
   ========================================================= */

async function stopScanner() {

    if (
        !scanner ||
        !scannerRunning
    ) {

        return;

    }

    try {

        await scanner.stop();

        await scanner.clear();

    } catch (error) {

        console.warn(
            "Scanner stop warning:",
            error
        );

    }

    scanner =
        null;

    scannerRunning =
        false;

}


/* =========================================================
   HANDLE QR CODE
   ========================================================= */

async function handleQRCode(
    decodedText
) {

    await stopScanner();

    const studentId =
        String(
            decodedText
        )
            .trim();

    if (!studentId) {

        showToast(
            "Invalid QR code.",
            "error"
        );

        return;

    }

    await findStudent(
        studentId
    );

}


/* =========================================================
   MANUAL SEARCH
   ========================================================= */

async function manualStudentSearch() {

    const input =
        $("manualStudentId");

    const studentId =
        input?.value
            .trim();

    if (!studentId) {

        showToast(
            "Enter a Student ID.",
            "error"
        );

        return;

    }

    await findStudent(
        studentId
    );

}


/* =========================================================
   FIND STUDENT
   ========================================================= */

async function findStudent(
    studentId
) {

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("students")
                .select("*")
                .eq(
                    "student_id",
                    studentId
                )
                .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {

            showToast(
                `Student ${studentId} was not found.`,
                "error"
            );

            return;

        }

        showStudentResult(
            data
        );

    } catch (error) {

        console.error(
            "Find student error:",
            error
        );

        showToast(
            "Unable to find student.",
            "error"
        );

    }

}


/* =========================================================
   STUDENT RESULT MODAL
   ========================================================= */

function showStudentResult(
    student
) {

    const result =
        $("studentResult");

    if (!result) {
        return;
    }

    const authorized =
        student.authorized !== false;

    const parents = [

        {
            name:
                student.parent_name,
            phone:
                student.phone
        },

        {
            name:
                student.parent_name_2,
            phone:
                student.phone_2
        },

        {
            name:
                student.parent_name_3,
            phone:
                student.phone_3
        }

    ]
        .filter(
            person =>
                person.name
        );

    result.innerHTML = `

        <div class="student-profile">

            <div class="profile-header">

                <div class="profile-avatar">
                    ${escapeHtml(
                        getInitials(
                            student.student_name
                        )
                    )}
                </div>

                <div>

                    <h2>
                        ${escapeHtml(
                            student.student_name
                        )}
                    </h2>

                    <p>
                        ${escapeHtml(
                            student.student_id
                        )}
                        •
                        ${escapeHtml(
                            student.level || "-"
                        )}
                    </p>

                </div>

            </div>


            <div class="security-box">

                <strong>
                    ${
                        authorized
                            ? "✓ Authorized Student Pickup"
                            : "⚠ Pickup Requires Approval"
                    }
                </strong>

                <p>
                    ${
                        authorized
                            ? "Registered pickup persons may be selected below."
                            : "This student's pickup requires staff verification and approval."
                    }
                </p>

            </div>


            <div class="form-section">

                <h3>
                    Select Pickup Person
                </h3>

                ${
                    parents.length
                        ? parents.map(
                            (person, index) => `

                                <button
                                    type="button"
                                    class="pickup-select-button"
                                    onclick="recordTimeOut(
                                        '${escapeJs(student.student_id)}',
                                        ${index}
                                    )"
                                >

                                    <strong>
                                        ${escapeHtml(
                                            person.name
                                        )}
                                    </strong>

                                    <span>
                                        ${escapeHtml(
                                            person.phone || ""
                                        )}
                                    </span>

                                </button>

                            `
                        ).join("")
                        : `
                            <p>
                                No registered pickup person.
                            </p>
                        `
                }

                <button
                    type="button"
                    class="secondary-button"
                    onclick="recordTimeIn('${escapeJs(
                        student.student_id
                    )}')"
                >
                    ✓ Record Time In
                </button>

                <button
                    type="button"
                    class="secondary-button"
                    onclick="recordUnauthorizedPickup('${escapeJs(
                        student.student_id
                    )}')"
                >
                    ⚠ Unauthorized / Staff Approval
                </button>

            </div>

        </div>

    `;

    openModal(
        "studentResultModal"
    );

}


/* =========================================================
   CLOSE RESULT MODAL
   ========================================================= */

$("closeResultModal")
    ?.addEventListener(
        "click",
        () => closeModal(
            "studentResultModal"
        )
    );


/* =========================================================
   RECORD TIME IN
   ========================================================= */

window.recordTimeIn =
async function(studentId) {

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(studentId)
        );

    if (!student) {

        showToast(
            "Student not found.",
            "error"
        );

        return;

    }

    try {

        const today =
            getLocalDateString();

        const existing =
            await getTodayStudentAttendance(
                studentId
            );

        if (existing) {

            if (existing.time_in) {

                showToast(
                    "This student has already timed in today.",
                    "info"
                );

                return;

            }

        }

        const now =
            new Date()
                .toISOString();

        let result;

        if (existing) {

            result =
                await supabaseClient
                    .from("attendance")
                    .update({
                        time_in: now
                    })
                    .eq(
                        "id",
                        existing.id
                    );

        } else {

            result =
                await supabaseClient
                    .from("attendance")
                    .insert({

                        student_id:
                            student.student_id,

                        student_name:
                            student.student_name,

                        level:
                            student.level,

                        date:
                            today,

                        time_in:
                            now,

                        status:
                            "present"

                    });

        }

        if (result.error) {
            throw result.error;
        }

        closeModal(
            "studentResultModal"
        );

        showToast(
            `${student.student_name} timed in successfully.`,
            "success"
        );

        await loadAttendance();

    } catch (error) {

        console.error(
            "Time in error:",
            error
        );

        showToast(
            error.message ||
            "Unable to record Time In.",
            "error"
        );

    }

};


/* =========================================================
   RECORD TIME OUT
   ========================================================= */

window.recordTimeOut =
async function(
    studentId,
    pickupIndex
) {

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(studentId)
        );

    if (!student) {
        return;
    }

    const parents = [

        {
            name:
                student.parent_name,
            phone:
                student.phone
        },

        {
            name:
                student.parent_name_2,
            phone:
                student.phone_2
        },

        {
            name:
                student.parent_name_3,
            phone:
                student.phone_3
        }

    ]
        .filter(
            person =>
                person.name
        );

    const pickup =
        parents[pickupIndex];

    if (!pickup) {

        showToast(
            "Pickup person not found.",
            "error"
        );

        return;

    }

    const confirmed =
        confirm(
            `Confirm pickup:\n\nStudent: ${student.student_name}\nPickup: ${pickup.name}\nPhone: ${pickup.phone || "N/A"}`
        );

    if (!confirmed) {
        return;
    }

    try {

        const existing =
            await getTodayStudentAttendance(
                studentId
            );

        const now =
            new Date()
                .toISOString();

        const data = {

            time_out:
                now,

            pickup_person:
                pickup.name,

            pickup_phone:
                pickup.phone || "",

            pickup_option:
                "Authorized",

            status:
                "completed"

        };

        let result;

        if (existing) {

            result =
                await supabaseClient
                    .from("attendance")
                    .update(data)
                    .eq(
                        "id",
                        existing.id
                    );

        } else {

            result =
                await supabaseClient
                    .from("attendance")
                    .insert({

                        student_id:
                            student.student_id,

                        student_name:
                            student.student_name,

                        level:
                            student.level,

                        date:
                            getLocalDateString(),

                        time_out:
                            now,

                        pickup_person:
                            pickup.name,

                        pickup_phone:
                            pickup.phone || "",

                        pickup_option:
                            "Authorized",

                        status:
                            "completed"

                    });

        }

        if (result.error) {
            throw result.error;
        }

        closeModal(
            "studentResultModal"
        );

        showToast(
            `${student.student_name} released to ${pickup.name}.`,
            "success"
        );

        await loadAttendance();

    } catch (error) {

        console.error(
            "Time out error:",
            error
        );

        showToast(
            error.message ||
            "Unable to record pickup.",
            "error"
        );

    }

};


/* =========================================================
   UNAUTHORIZED PICKUP
   ========================================================= */

window.recordUnauthorizedPickup =
async function(studentId) {

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(studentId)
        );

    if (!student) {
        return;
    }

    const pickupName =
        prompt(
            "Enter the name of the person requesting pickup:"
        );

    if (!pickupName) {
        return;
    }

    const approver =
        prompt(
            "Enter the staff member approving the pickup:"
        );

    if (!approver) {
        return;
    }

    const confirmed =
        confirm(
            `Confirm staff-approved pickup?\n\nStudent: ${student.student_name}\nPerson: ${pickupName}\nApproved by: ${approver}`
        );

    if (!confirmed) {
        return;
    }

    try {

        const existing =
            await getTodayStudentAttendance(
                studentId
            );

        const now =
            new Date()
                .toISOString();

        const data = {

            time_out:
                now,

            pickup_person:
                pickupName,

            pickup_option:
                "Staff Approved",

            approver:
                approver,

            notes:
                "Pickup person not listed as normal authorized pickup.",

            status:
                "completed"

        };

        let result;

        if (existing) {

            result =
                await supabaseClient
                    .from("attendance")
                    .update(data)
                    .eq(
                        "id",
                        existing.id
                    );

        } else {

            result =
                await supabaseClient
                    .from("attendance")
                    .insert({

                        student_id:
                            student.student_id,

                        student_name:
                            student.student_name,

                        level:
                            student.level,

                        date:
                            getLocalDateString(),

                        time_out:
                            now,

                        pickup_person:
                            pickupName,

                        pickup_option:
                            "Staff Approved",

                        approver:
                            approver,

                        notes:
                            "Pickup person not listed as normal authorized pickup.",

                        status:
                            "completed"

                    });

        }

        if (result.error) {
            throw result.error;
        }

        closeModal(
            "studentResultModal"
        );

        showToast(
            "Staff-approved pickup recorded.",
            "success"
        );

        await loadAttendance();

    } catch (error) {

        console.error(
            "Unauthorized pickup error:",
            error
        );

        showToast(
            error.message ||
            "Unable to record pickup.",
            "error"
        );

    }

};


/* =========================================================
   GET TODAY STUDENT ATTENDANCE
   ========================================================= */

async function getTodayStudentAttendance(
    studentId
) {

    const today =
        getLocalDateString();

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
                today
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(1);

    if (error) {
        throw error;
    }

    return data?.[0] || null;

}


/* =========================================================
   QR CODE DISPLAY
   ========================================================= */

window.showStudentQR =
function(studentId) {

    const student =
        students.find(
            item =>
                String(
                    item.student_id
                ) ===
                String(studentId)
        );

    if (!student) {
        return;
    }

    const qrWindow =
        window.open(
            "",
            "_blank",
            "width=450,height=600"
        );

    if (!qrWindow) {

        showToast(
            "Please allow pop-ups to display the QR code.",
            "error"
        );

        return;

    }

    qrWindow.document.write(`

        <!DOCTYPE html>

        <html>

        <head>

            <title>
                Vision School QR - ${escapeHtml(
                    student.student_name
                )}
            </title>

            <script
                src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"
            ></script>

            <style>

                body {

                    font-family:
                        Arial,
                        sans-serif;

                    text-align:
                        center;

                    padding:
                        30px;

                }

                .card {

                    max-width:
                        350px;

                    margin:
                        auto;

                    padding:
                        30px;

                    border:
                        1px solid #ddd;

                    border-radius:
                        20px;

                }

                h1 {

                    margin-bottom:
                        5px;

                }

                .id {

                    font-weight:
                        bold;

                    font-size:
                        18px;

                    margin:
                        10px;

                }

                #qrcode {

                    margin:
                        25px auto;

                    width:
                        256px;

                    height:
                        256px;

                }

            </style>

        </head>

        <body>

            <div class="card">

                <h1>
                    Vision School
                </h1>

                <h2>
                    ${escapeHtml(
                        student.student_name
                    )}
                </h2>

                <div class="id">
                    ${escapeHtml(
                        student.student_id
                    )}
                </div>

                <div>
                    ${escapeHtml(
                        student.level || ""
                    )}
                </div>

                <div id="qrcode"></div>

                <p>
                    Scan this QR code for attendance.
                </p>

            </div>

            <script>

                new QRCode(
                    document.getElementById(
                        "qrcode"
                    ),
                    {
                        text:
                            ${JSON.stringify(
                                student.student_id
                            )},
                        width: 256,
                        height: 256
                    }
                );

            </script>

        </body>

        </html>

    `);

    qrWindow.document.close();

};


/* =========================================================
   EXPORT CSV
   ========================================================= */

function setupExport() {

    $("exportCsv")
        ?.addEventListener(
            "click",
            exportCSV
        );

}


function exportCSV() {

    const today =
        getTodayAttendance();

    if (
        today.length === 0
    ) {

        showToast(
            "There are no attendance records to export.",
            "info"
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
        "Pickup Relationship",
        "Pickup Phone",
        "Pickup Option",
        "Approver",
        "Notes"

    ];

    const rows =
        today.map(record => [

            record.date || "",

            record.student_id || "",

            getAttendanceStudentName(
                record
            ),

            record.level || "",

            formatDateTime(
                record.time_in
            ),

            formatDateTime(
                record.time_out
            ),

            record.pickup_person ||
            record.pickup_name ||
            "",

            record.pickup_relationship ||
            "",

            record.pickup_phone ||
            "",

            record.pickup_option ||
            "",

            record.approver ||
            "",

            record.notes ||
            ""

        ]);

    const csv = [

        headers,

        ...rows

    ]
        .map(
            row =>
                row
                    .map(csvEscape)
                    .join(",")
        )
        .join("\n");

    const blob =
        new Blob(
            [
                "\ufeff" +
                csv
            ],
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
        `Vision-School-Attendance-${getLocalDateString()}.csv`;

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
   TOAST
   ========================================================= */

function showToast(
    message,
    type = "info"
) {

    const toast =
        $("toast");

    if (!toast) {
        return;
    }

    toast.textContent =
        message;

    toast.className =
        `toast ${type} show`;

    clearTimeout(
        showToast.timeout
    );

    showToast.timeout =
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
   DATE / TIME HELPERS
   ========================================================= */

function getLocalDateString() {

    const now =
        new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        )
            .padStart(2, "0");

    const day =
        String(
            now.getDate()
        )
            .padStart(2, "0");

    return `${year}-${month}-${day}`;

}


function formatDateTime(
    value
) {

    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(value);

    }

    return date.toLocaleString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }
    );

}


/* =========================================================
   SECURITY / HTML HELPERS
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


function escapeJs(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /'/g,
            "\\'"
        )
        .replace(
            /"/g,
            '\\"'
        );

}


function csvEscape(
    value
) {

    const string =
        String(
            value ?? ""
        );

    return `"${string.replace(
        /"/g,
        '""'
    )}"`;

}


function getInitials(
    name
) {

    return String(
        name || "VS"
    )
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(
            word =>
                word[0]
        )
        .join("")
        .toUpperCase();

}


/* =========================================================
   CLOSE MODALS WITH ESCAPE
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Escape"
        ) {

            return;

        }

        closeModal(
            "studentModal"
        );

        closeModal(
            "studentResultModal"
        );

    }
);


/* =========================================================
   ONLINE / OFFLINE DETECTION
   ========================================================= */

window.addEventListener(
    "online",
    () => {

        updateConnectionStatus(
            "online"
        );

    }
);


window.addEventListener(
    "offline",
    () => {

        updateConnectionStatus(
            "offline"
        );

    }
);


/* =========================================================
   EXPOSE IMPORTANT FUNCTIONS
   ========================================================= */

window.startScanner =
    startScanner;

window.stopScanner =
    stopScanner;

window.showSection =
    showSection;

window.findStudent =
    findStudent;

console.log(
    "Vision School app.js loaded successfully."
);
