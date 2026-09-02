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

// Fast lookup maps: avoids repeated O(n) scans during QR/manual operations.
let studentById = new Map();
let parentStudentMap = new Map();

// Vision School school-year export window.
// The school year starts August 17, 2026; the end date is kept at July 31,
// 2027 so the full 12-month historical window can be exported in one file.
const SCHOOL_YEAR_START = "2026-08-17";
const SCHOOL_YEAR_END = "2027-07-31";

let currentStudent = null;

let html5QrCode = null;
let scannerRunning = false;
let scanLocked = false;

let realtimeChannel = null;

let toastTimer = null;


/* =========================================================
   START APPLICATION
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    console.log("Vision School Attendance System starting...");

    try {

        if (
            typeof window.supabase === "undefined"
        ) {
            throw new Error(
                "Supabase library has not loaded."
            );
        }

        supabaseClient =
            window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY
            );


        initializeNavigation();

        initializeMobileMenu();

        initializeClock();

        initializeStudentModal();

        initializeScanner();

        initializeSearch();

        initializeReports();

        initializeModalClosing();


        await testSupabaseConnection();

        await loadStudents();

        await loadTodayAttendance();

        initializeRealtime();


        console.log(
            "Vision School app.js loaded successfully."
        );

    } catch (error) {

        console.error(
            "Initialization error:",
            error
        );

        showToast(
            error?.message ||
            "Application initialization failed.",
            "error"
        );
    }

});


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
   LOAD STUDENTS
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


        students = data || [];

        // Build lookup indexes once after loading students.
        studentById = new Map(
            students.map(student => [String(student.id), student])
        );

        parentStudentMap = buildParentStudentMap(students);

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

        renderDashboard();


    } catch (error) {

        console.error(
            "Unable to load students:",
            error
        );


        showToast(
            error?.message ||
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
                    .slice(0, 3)
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
        .slice(0, 3)
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
   FAST PARENT / STUDENT LOOKUPS
========================================================= */

function normalizeLookupValue(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function buildParentStudentMap(list) {
    const map = new Map();

    (list || []).forEach(student => {
        const parents = getParentOptions(student.parent);

        parents.forEach(parent => {
            const keys = [parent.name, parent.phone]
                .map(normalizeLookupValue)
                .filter(Boolean);

            keys.forEach(key => {
                if (!map.has(key)) map.set(key, []);
                const bucket = map.get(key);
                if (!bucket.some(item => String(item.id) === String(student.id))) {
                    bucket.push(student);
                }
            });
        });
    });

    return map;
}

function findStudentsByParentKey(value) {
    const key = normalizeLookupValue(value);
    if (!key) return [];

    const direct = parentStudentMap.get(key);
    if (direct?.length) return direct;

    // Fallback for parent QR formats that contain extra text.
    const matches = [];
    parentStudentMap.forEach((list, mapKey) => {
        if (mapKey.includes(key) || key.includes(mapKey)) {
            list.forEach(student => {
                if (!matches.some(item => String(item.id) === String(student.id))) {
                    matches.push(student);
                }
            });
        }
    });
    return matches;
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
                                    QR
                                </button>

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
                        return;
                    }


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

                        showStudentQr(
                            student
                        );

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


    if (scannerRunning || scanLocked) {
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
                // 5 FPS is enough for attendance QR scanning and reduces CPU/battery use.
                fps:
                    5,

                qrbox:
                    {
                        width:
                            220,

                        height:
                            220
                    },

                // Prefer native formats where supported; html5-qrcode handles fallback.
                rememberLastUsedCamera:
                    true
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
        scanLocked = false;


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

async function handleQrScan(decodedText) {

    if (scanLocked) return;
    scanLocked = true;

    try {
        const raw = String(decodedText ?? "").trim();
        if (!raw) {
            showToast("QR code is empty.", "error");
            return;
        }

        // Parent QR support:
        // 1) JSON: { type: "parent", name, phone, students: ["S001", "S002"] }
        // 2) Text: PARENT|Parent Name|Phone|S001,S002
        // 3) Plain parent name/phone matching the registered parent data.
        const parentResult = parseParentQr(raw);

        if (parentResult) {
            const children = resolveParentChildren(parentResult);

            if (!children.length) {
                showToast("No students were found for this parent QR code.", "error");
                return;
            }

            showParentChildren(children, parentResult.name || parentResult.phone || "Parent");
            return;
        }

        const student = findStudent(raw);

        if (!student) {
            showToast(`Student ID "${raw}" was not found.`, "error");
            return;
        }

        // Do not reload today's attendance on every scan. The live channel keeps
        // the current-day cache updated, and manual searches already use it too.
        showAttendanceAction(student);
    } finally {
        scanLocked = false;
    }
}

function parseParentQr(raw) {
    const value = String(raw || "").trim();
    if (!value) return null;

    if (value.startsWith("{") && value.endsWith("}")) {
        try {
            const parsed = JSON.parse(value);
            const type = normalizeLookupValue(parsed.type || parsed.kind || parsed.role);
            const ids = parsed.students || parsed.studentIds || parsed.children || [];
            if (type === "parent" || type === "guardian" || Array.isArray(ids)) {
                return {
                    name: parsed.name || parsed.parent || parsed.guardian || "",
                    phone: parsed.phone || parsed.contact || "",
                    studentIds: Array.isArray(ids) ? ids.map(String) : []
                };
            }
        } catch (_) {
            // Not JSON; continue with text formats.
        }
    }

    const parts = value.split("|").map(item => item.trim());
    if (normalizeLookupValue(parts[0]) === "parent" || normalizeLookupValue(parts[0]) === "guardian") {
        return {
            name: parts[1] || "",
            phone: parts[2] || "",
            studentIds: (parts[3] || "").split(",").map(item => item.trim()).filter(Boolean)
        };
    }

    const parentMatches = findStudentsByParentKey(value);
    if (parentMatches.length) {
        return { name: value, phone: "", studentIds: [] };
    }

    return null;
}

function resolveParentChildren(parentResult) {
    const byId = (parentResult.studentIds || [])
        .map(id => findStudent(id))
        .filter(Boolean);

    if (byId.length) return byId;

    const keys = [parentResult.name, parentResult.phone]
        .map(normalizeLookupValue)
        .filter(Boolean);

    const children = [];
    keys.forEach(key => {
        (parentStudentMap.get(key) || []).forEach(student => {
            if (!children.some(item => String(item.id) === String(student.id))) {
                children.push(student);
            }
        });
    });

    return children;
}

function showParentChildren(children, parentName) {
    const modal = document.getElementById("studentResultModal");
    const result = document.getElementById("studentResult");
    if (!modal || !result) return;

    result.innerHTML = `
        <div class="student-result">
            <div class="result-avatar">👨‍👩‍👧‍👦</div>
            <h2>Parent / Guardian QR</h2>
            <p>${escapeHtml(parentName)}</p>
            <p>Select a student:</p>
            <div style="display:grid;gap:10px;margin-top:15px;">
                ${children.map(student => `
                    <button type="button" class="primary-button parent-child-select" data-student-id="${escapeAttribute(student.id)}">
                        ${escapeHtml(student.name)} — ${escapeHtml(student.level || "")}
                    </button>
                `).join("")}
            </div>
            <div class="result-actions" style="margin-top:20px;">
                <button type="button" class="secondary-button" id="closeParentChildren">Cancel</button>
            </div>
        </div>
    `;

    modal.classList.add("show");

    result.querySelectorAll(".parent-child-select").forEach(button => {
        button.addEventListener("click", () => {
            const student = findStudent(button.dataset.studentId);
            if (student) showAttendanceAction(student);
        });
    });

    document.getElementById("closeParentChildren")?.addEventListener("click", closeResultModal);
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


        updateAttendanceStatistics();

        renderAttendance();

        renderDashboard();


    } catch (error) {

        console.error(
            "Unable to load attendance:",
            error
        );


        showToast(
            error?.message ||
            "Unable to load today's attendance.",
            "error"
        );
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
        ?.addEventListener("click", exportCsv);
}

async function exportCsv() {
    const choice = prompt(
        "Attendance Export\n\n1 = Today\n2 = Month (YYYY-MM)\n3 = Custom date range (YYYY-MM-DD,YYYY-MM-DD)\n4 = Full school year (Aug 17, 2026 - Jul 31, 2027)\n\nEnter 1, 2, 3, or 4:",
        "1"
    );

    if (choice === null) return;

    let startDate = "";
    let endDate = "";
    let fileLabel = "";

    try {
        switch (String(choice).trim()) {
            case "1":
                startDate = getVientianeDate();
                endDate = startDate;
                fileLabel = startDate;
                break;

            case "2": {
                const month = prompt("Enter month as YYYY-MM:", getVientianeDate().slice(0, 7));
                if (!month || !/^\d{4}-\d{2}$/.test(month.trim())) {
                    showToast("Invalid month. Use YYYY-MM.", "error");
                    return;
                }
                const normalized = month.trim();
                const [year, monthNumber] = normalized.split("-").map(Number);
                if (monthNumber < 1 || monthNumber > 12) {
                    showToast("Invalid month. Use YYYY-MM.", "error");
                    return;
                }
                startDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
                endDate = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
                fileLabel = normalized;
                break;
            }

            case "3": {
                const range = prompt("Enter date range as YYYY-MM-DD,YYYY-MM-DD:", `${getVientianeDate()},${getVientianeDate()}`);
                if (!range) return;
                const parts = range.split(",").map(item => item.trim());
                if (parts.length !== 2 || !isValidDateString(parts[0]) || !isValidDateString(parts[1])) {
                    showToast("Invalid date range.", "error");
                    return;
                }
                [startDate, endDate] = parts;
                if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
                fileLabel = `${startDate}-to-${endDate}`;
                break;
            }

            case "4":
                startDate = SCHOOL_YEAR_START;
                endDate = SCHOOL_YEAR_END;
                fileLabel = `${startDate}-to-${endDate}`;
                break;

            default:
                showToast("Please select 1, 2, 3, or 4.", "error");
                return;
        }

        const records = await fetchAttendanceRange(startDate, endDate);

        if (!records.length) {
            showToast(`No attendance records found from ${startDate} to ${endDate}.`, "error");
            return;
        }

        downloadAttendanceCsv(records, fileLabel);
        showToast(`Attendance CSV exported: ${records.length} record(s).`, "success");
    } catch (error) {
        console.error("Attendance export error:", error);
        showToast(error?.message || "Unable to export attendance records.", "error");
    }
}

function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function fetchAttendanceRange(startDate, endDate) {
    // Use the already-loaded today cache for a single-day export.
    if (startDate === endDate && startDate === getVientianeDate()) {
        return [...attendanceRecords];
    }

    const pageSize = 1000;
    let from = 0;
    const allRecords = [];

    while (true) {
        const { data, error } = await supabaseClient
            .from("attendance")
            .select("*")
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: true })
            .order("created_at", { ascending: true })
            .range(from, from + pageSize - 1);

        if (error) throw error;

        const page = data || [];
        allRecords.push(...page);

        if (page.length < pageSize) break;
        from += pageSize;
    }

    return allRecords;
}

function downloadAttendanceCsv(records, fileLabel) {
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

    const rows = records.map(record => {
        const student = findStudent(record.student_id);
        return [
            record.date || "",
            record.student_id || "",
            record.student_name || student?.name || "",
            student?.level || "",
            record.time_in ? formatTime(record.time_in) : "",
            record.time_out ? formatTime(record.time_out) : "",
            record.pickup_person || "",
            record.pickup_relationship || record.Pickup_relationship || "",
            record.pickup_phone || "",
            record.pickup_option || "",
            record.approver || "",
            record.notes || ""
        ];
    });

    const csv = [headers, ...rows]
        .map(row => row.map(csvEscape).join(","))
        .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `Vision-School-Attendance-${fileLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoke after the click has been queued by the browser.
    setTimeout(() => URL.revokeObjectURL(url), 0);
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

function initializeRealtime() {

    if (
        !supabaseClient
    ) {
        return;
    }


    try {

        if (
            realtimeChannel
        ) {

            supabaseClient
                .removeChannel(
                    realtimeChannel
                );

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

                    async () => {

                        await loadStudents();

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

                        await loadTodayAttendance();

                    }

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
