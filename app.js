// ============================================
// PERSONAL GRADING SYSTEM
// APP.JS
// Supabase Login + IndexedDB Grading System
// ============================================

let currentWorkspace = null;
let editingStudentId = null;
let selectedSemester = null;
let selectedSubject = null;
let selectedComponentIndex = null;
let editingGradeId = null;

const GRADING_COMPONENTS = {
  English: [
    { name: "Reading (Fluency & Comprehension)", weight: 20 },
    { name: "Writing", weight: 20 },
    { name: "Speaking & Listening", weight: 20 },
    { name: "Homework, Classwork & Participation", weight: 10 },
    { name: "Semestrial Examination", weight: 25 },
    { name: "Attendance", weight: 5 }
  ],
  Mathematics: [
    { name: "Written Test & Quizzes", weight: 15 },
    { name: "Performance Tasks / Problem Solving", weight: 20 },
    { name: "Classwork / Seatwork", weight: 10 },
    { name: "Homework", weight: 10 },
    { name: "Participation", weight: 15 },
    { name: "Semestrial Examination", weight: 25 },
    { name: "Attendance", weight: 5 }
  ],
  Science: [
    { name: "Written Test & Quizzes", weight: 15 },
    { name: "Performance Tasks / Experiments", weight: 20 },
    { name: "Projects", weight: 15 },
    { name: "Classwork", weight: 10 },
    { name: "Participation", weight: 10 },
    { name: "Semestrial Examination", weight: 25 },
    { name: "Attendance", weight: 5 }
  ]
};

// ============================================
// AUTHENTICATION
// ============================================

async function checkLoginSession() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) showApp();
    else showLoginPage();
  } catch (error) {
    console.error("Session check failed:", error);
    showLoginPage();
  }
}

function showLoginPage() {
  document.getElementById("loginPage")?.classList.remove("hidden");
  document.getElementById("dashboardPage")?.classList.add("hidden");
  document.getElementById("workspacePage")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("loginPage")?.classList.add("hidden");
  document.getElementById("workspacePage")?.classList.add("hidden");
  document.getElementById("dashboardPage")?.classList.remove("hidden");
}

async function loginUser(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function logoutUser() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error("Logout failed:", error);
    alert("Unable to sign out.");
    return;
  }
  currentWorkspace = null;
  showLoginPage();
}

function setupLogin() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;
    const message = document.getElementById("loginMessage");

    if (!email || !password) {
      if (message) message.textContent = "Please enter your email and password.";
      return;
    }

    if (message) message.textContent = "Signing in...";

    try {
      await loginUser(email, password);
      if (message) message.textContent = "";
      showApp();
    } catch (error) {
      console.error("Login failed:", error);
      if (message) message.textContent = error.message || "Invalid email or password.";
    }
  });
}

// ============================================
// WORKSPACE
// ============================================

function openWorkspace(type) {
  currentWorkspace = type;
  document.body.classList.remove("wife-theme", "personal-theme");
  document.body.classList.add(type === "wife" ? "wife-theme" : "personal-theme");

  const dashboard = document.getElementById("dashboardPage");
  const workspace = document.getElementById("workspacePage");
  dashboard?.classList.add("hidden");
  workspace?.classList.remove("hidden");

  const title = document.getElementById("workspaceTitle");
  const subtitle = document.getElementById("workspaceSubtitle");
  if (title) title.textContent = type === "wife" ? "👩‍🏫 Wife's Workspace" : "👨‍🏫 My Personal Workspace";
  if (subtitle) subtitle.textContent = "Student Records & Academic Management";

  resetRecordsInterface();
  showSection("students");
}

function goHome() {
  document.body.classList.remove("wife-theme", "personal-theme");
  document.getElementById("workspacePage")?.classList.add("hidden");
  document.getElementById("dashboardPage")?.classList.remove("hidden");
  currentWorkspace = null;
}

async function showSection(section) {
  ["students", "records", "attendance", "notes", "reports", "excel"].forEach(s => {
    document.getElementById(s + "Section")?.classList.add("hidden");
  });
  document.getElementById(section + "Section")?.classList.remove("hidden");

  document.querySelectorAll(".nav-button").forEach(b => b.classList.remove("active"));
  const i = ["students", "records", "attendance", "notes", "reports", "excel"].indexOf(section);
  document.querySelectorAll(".nav-button")[i]?.classList.add("active");

  if (section === "students") await loadStudents();
  if (section === "records") await loadGradeStudents();
  if (section === "attendance") await initializeAttendance();
  if (section === "notes") await initializeNotes();
  if (section === "reports") await loadReportStudents();
}

// ============================================
// STUDENTS
// ============================================

function showStudentForm() {
  editingStudentId = null;
  document.querySelector("#studentForm h3")?.replaceChildren(document.createTextNode("Add Student"));
  document.getElementById("studentId").value = "";
  document.getElementById("studentName").value = "";
  document.getElementById("studentSection").value = "";
  document.getElementById("studentForm")?.classList.remove("hidden");
}

function hideStudentForm() {
  editingStudentId = null;
  document.getElementById("studentForm")?.classList.add("hidden");
}

async function saveStudent() {
  const sid = document.getElementById("studentId")?.value.trim();
  const name = document.getElementById("studentName")?.value.trim();
  const section = document.getElementById("studentSection")?.value.trim();
  const year = document.getElementById("academicYearSelect")?.value;
  const level = document.getElementById("levelSelect")?.value;

  if (!sid || !name || !year || !level) return alert("Please complete Student ID, Name, Academic Year and Level.");

  const all = await getAllRecords(STORES.students);

  if (editingStudentId !== null) {
    const s = await getRecord(STORES.students, editingStudentId);
    if (!s) return;
    Object.assign(s, { studentId: sid, name, section, academicYear: year, level, workspace: currentWorkspace, updatedAt: new Date().toISOString() });
    await updateRecord(STORES.students, s);
    alert("Student updated successfully.");
  } else {
    if (all.some(s => s.studentId === sid && s.workspace === currentWorkspace && s.academicYear === year)) {
      return alert("A student with this ID already exists.");
    }
    await addRecord(STORES.students, { studentId: sid, name, section, academicYear: year, level, workspace: currentWorkspace, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    alert("Student added successfully.");
  }

  hideStudentForm();
  await loadStudents();
}

async function loadStudents() {
  if (!currentWorkspace) return;
  const all = await getAllRecords(STORES.students);
  const year = document.getElementById("academicYearSelect")?.value;
  const list = all.filter(s => s.workspace === currentWorkspace && (!year || s.academicYear === year));
  renderStudents(list);
  await loadGradeStudents();
  await loadNoteStudents();
  await loadReportStudents();
}

function renderStudents(list) {
  const c = document.getElementById("studentList");
  if (!c) return;
  if (!list.length) {
    c.className = "empty-state";
    c.innerHTML = '<div class="empty-icon">👨‍🎓</div><h3>No students found</h3><p>Add students or select another academic year.</p>';
    return;
  }
  c.className = "student-list";
  list.sort((a, b) => a.name.localeCompare(b.name));
  c.innerHTML = list.map(s => `
    <div class="student-card">
      <div class="student-info">
        <div class="student-avatar">👨‍🎓</div>
        <div>
          <h3>${escapeHTML(s.name)}</h3>
          <p>ID: ${escapeHTML(s.studentId)}</p>
          <div class="student-tags">
            <span>${escapeHTML(s.level)}</span>
            <span>${escapeHTML(s.academicYear)}</span>
            ${s.section ? `<span>${escapeHTML(s.section)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="student-actions">
        <button class="edit-button" onclick="editStudent(${s.id})">✏️ Edit</button>
        <button class="delete-button" onclick="removeStudent(${s.id})">🗑️ Remove</button>
      </div>
    </div>`).join("");
}

async function editStudent(id) {
  const s = await getRecord(STORES.students, id);
  if (!s) return;
  editingStudentId = id;
  const h = document.querySelector("#studentForm h3");
  if (h) h.textContent = "Update Student";
  document.getElementById("studentId").value = s.studentId || "";
  document.getElementById("studentName").value = s.name || "";
  document.getElementById("studentSection").value = s.section || "";
  document.getElementById("academicYearSelect").value = s.academicYear || "";
  document.getElementById("levelSelect").value = s.level || "";
  document.getElementById("studentForm")?.classList.remove("hidden");
}

async function removeStudent(id) {
  const s = await getRecord(STORES.students, id);
  if (s && confirm(`Remove ${s.name}?`)) {
    await deleteRecord(STORES.students, id);
    await loadStudents();
  }
}

// ============================================
// GRADE RECORDS
// ============================================

async function loadGradeStudents() {
  const sel = document.getElementById("gradeStudentSelect");
  if (!sel) return;
  const all = await getAllRecords(STORES.students);
  const list = all.filter(s => s.workspace === currentWorkspace);
  sel.innerHTML = '<option value="">Select Student</option>' + list.sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}" data-academic-year="${escapeHTML(s.academicYear)}">${escapeHTML(s.name)} — ${escapeHTML(s.level)} (${escapeHTML(s.academicYear)})</option>`).join("");
}

function resetGradeView() {
  selectedSemester = null;
  selectedSubject = null;
  selectedComponentIndex = null;
  document.getElementById("subjectArea")?.classList.add("hidden");
  document.getElementById("componentArea")?.classList.add("hidden");
  document.getElementById("subjectResult")?.classList.add("hidden");
}

function selectSemester(s) {
  if (!document.getElementById("gradeStudentSelect")?.value) return alert("Please select a student first.");
  selectedSemester = s;
  selectedSubject = null;
  selectedComponentIndex = null;
  document.getElementById("subjectArea")?.classList.remove("hidden");
  document.getElementById("componentArea")?.classList.add("hidden");
}

async function selectSubject(s) {
  if (!selectedSemester) return alert("Please select a semester first.");
  selectedSubject = s;
  selectedComponentIndex = null;
  document.getElementById("componentArea")?.classList.remove("hidden");
  document.getElementById("subjectArea")?.classList.remove("hidden");
  const title = document.getElementById("selectedSubjectTitle");
  const semTitle = document.getElementById("selectedSemesterTitle");
  if (title) title.textContent = s;
  if (semTitle) semTitle.textContent = selectedSemester === "first" ? "First Semester — August to December" : "Second Semester — January to May";
  document.getElementById("subjectResult")?.classList.add("hidden");
  await renderGradingComponents();
}

async function renderGradingComponents() {
  const box = document.getElementById("gradingComponents");
  if (!box) return;
  const comps = GRADING_COMPONENTS[selectedSubject] || [];
  box.innerHTML = comps.map((c, i) => `<div class="component-card"><div class="component-card-header"><h3>${escapeHTML(c.name)}</h3><span class="weight-badge">${c.weight}%</span></div><div id="componentRecords-${i}" class="component-records"></div>${c.name === "Attendance" ? '<div class="attendance-grade-info">Attendance is calculated automatically from attendance records.</div>' : `<button class="add-record-button" onclick="openGradeRecordForm(${i})">+ Add Record</button>`}</div>`).join("");
  for (let i = 0; i < comps.length; i++) await renderComponentRecords(i);
}

function openGradeRecordForm(index) {
  const sel = document.getElementById("gradeStudentSelect");
  if (!sel?.value) return alert("Please select a student first.");
  selectedComponentIndex = index;
  editingGradeId = null;
  closeGradeRecordForm();
  const c = GRADING_COMPONENTS[selectedSubject][index];
  const form = document.createElement("div");
  form.id = "gradeRecordForm";
  form.className = "form-card";
  form.innerHTML = `<h3>Add Grade Record</h3><p>${escapeHTML(c.name)} — ${c.weight}%</p><div class="form-grid"><input id="gradeRecordName" placeholder="Record / Activity Name"><input type="date" id="gradeRecordDate" value="${getTodayDate()}"><input type="number" id="gradeScore" placeholder="Score Obtained" min="0" step=".01"><input type="number" id="gradeTotal" placeholder="Total Score" min=".01" step=".01"></div><textarea id="gradeNotes" class="daily-note" placeholder="Optional notes"></textarea><div class="form-actions"><button class="primary-button" onclick="saveGradeRecord()">Save Record</button><button class="secondary-button" onclick="closeGradeRecordForm()">Cancel</button></div>`;
  document.getElementById("componentArea")?.appendChild(form);
}

function closeGradeRecordForm() { document.getElementById("gradeRecordForm")?.remove(); }

async function saveGradeRecord() {
  const studentId = Number(document.getElementById("gradeStudentSelect")?.value);
  const name = document.getElementById("gradeRecordName")?.value.trim();
  const date = document.getElementById("gradeRecordDate")?.value;
  const score = Number(document.getElementById("gradeScore")?.value);
  const total = Number(document.getElementById("gradeTotal")?.value);
  const notes = document.getElementById("gradeNotes")?.value.trim();

  if (!studentId || !name || !date || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return alert("Please complete the record.");
  if (score > total) return alert("Score cannot be greater than total.");

  const c = GRADING_COMPONENTS[selectedSubject][selectedComponentIndex];
  const student = await getRecord(STORES.students, studentId);
  const now = new Date().toISOString();
  const r = { studentId, workspace: currentWorkspace, academicYear: student?.academicYear || "", semester: selectedSemester, subject: selectedSubject, component: c.name, componentWeight: c.weight, recordName: name, date, score, total, percentage: score / total * 100, notes, updatedAt: now };

  if (editingGradeId) {
    r.id = editingGradeId;
    const old = await getRecord(STORES.grades, editingGradeId);
    r.createdAt = old?.createdAt || now;
    await updateRecord(STORES.grades, r);
  } else {
    r.createdAt = now;
    await addRecord(STORES.grades, r);
  }
  closeGradeRecordForm();
  await renderGradingComponents();
  alert("Grade record saved successfully.");
}

async function renderComponentRecords(index) {
  const container = document.getElementById(`componentRecords-${index}`);
  const sid = Number(document.getElementById("gradeStudentSelect")?.value);
  if (!container || !sid) return;
  const c = GRADING_COMPONENTS[selectedSubject][index];
  const year = await getStudentAcademicYear(sid);

  if (c.name === "Attendance") {
    const a = await getAttendancePercentageForStudent(sid, year, selectedSemester);
    container.innerHTML = `<div class="component-average"><strong>Attendance:</strong> ${a.percentage.toFixed(2)}% &nbsp; <strong>Weighted:</strong> ${a.weighted.toFixed(2)}%<br><small>${a.present} Present / ${a.absent} Absent / ${a.total} Marked</small></div>`;
    return;
  }

  const grades = await getAllRecords(STORES.grades);
  const records = grades.filter(r => r.studentId === sid && r.workspace === currentWorkspace && r.academicYear === year && r.semester === selectedSemester && r.subject === selectedSubject && r.component === c.name);
  if (!records.length) {
    container.innerHTML = '<div class="component-empty">No records yet.</div>';
    return;
  }
  const avg = records.reduce((x,r) => x + Number(r.percentage), 0) / records.length;
  container.innerHTML = `<div class="component-average"><strong>Average:</strong> ${avg.toFixed(2)}% &nbsp; <strong>Weighted:</strong> ${(avg*c.weight/100).toFixed(2)}%</div>` + records.map(r => `<div class="grade-record"><div><strong>${escapeHTML(r.recordName)}</strong><small>${r.date}</small></div><strong>${formatNumber(r.score)}/${formatNumber(r.total)} (${Number(r.percentage).toFixed(2)}%)</strong><div class="record-actions"><button class="edit-button" onclick="editGradeRecord(${r.id})">✏️ Edit</button><button class="delete-button" onclick="removeGradeRecord(${r.id})">🗑️ Remove</button></div></div>`).join("");
}

async function editGradeRecord(id) {
  const r = await getRecord(STORES.grades, id);
  if (!r) return;
  document.getElementById("gradeStudentSelect").value = r.studentId;
  selectedSemester = r.semester;
  selectedSubject = r.subject;
  selectedComponentIndex = (GRADING_COMPONENTS[r.subject] || []).findIndex(c => c.name === r.component);
  editingGradeId = id;
  await selectSubject(r.subject);
  openGradeRecordForm(selectedComponentIndex);
  document.querySelector("#gradeRecordForm h3").textContent = "Edit Grade Record";
  document.getElementById("gradeRecordName").value = r.recordName || "";
  document.getElementById("gradeRecordDate").value = r.date || "";
  document.getElementById("gradeScore").value = r.score ?? "";
  document.getElementById("gradeTotal").value = r.total ?? "";
  document.getElementById("gradeNotes").value = r.notes || "";
}

async function removeGradeRecord(id) {
  if (confirm("Remove this grade record?")) {
    await deleteRecord(STORES.grades, id);
    await renderGradingComponents();
  }
}

// ============================================
// ATTENDANCE
// ============================================

function getSemesterFromDate(date) {
  if (!date || typeof date !== "string") return null;
  const month = parseInt(date.substring(5, 7), 10);
  if (month >= 8 && month <= 12) return "first";
  if (month >= 1 && month <= 5) return "second";
  return null;
}

async function getAttendancePercentageForStudent(studentId, year, semester) {
  const all = await getAllRecords(STORES.attendance);
  const records = all.filter(a => a.studentId === studentId && a.workspace === currentWorkspace && a.academicYear === year && (!semester || a.semester === semester));
  const present = records.filter(a => a.status === "present").length;
  const absent = records.filter(a => a.status === "absent").length;
  const total = present + absent;
  const percentage = total ? present / total * 100 : 0;
  return { present, absent, total, percentage, weighted: percentage * 0.05 };
}

async function initializeAttendance() {
  const dateEl = document.getElementById("attendanceDate");
  const yearEl = document.getElementById("attendanceAcademicYear");
  if (dateEl && !dateEl.value) dateEl.value = getTodayDate();
  if (yearEl && !yearEl.value) yearEl.value = document.getElementById("academicYearSelect")?.value || getAcademicYearFromToday();
  if (yearEl) yearEl.onchange = loadAttendance;
  if (dateEl) dateEl.onchange = loadAttendance;
  await loadAttendance();
}

async function loadAttendance() {
  const year = document.getElementById("attendanceAcademicYear")?.value;
  const date = document.getElementById("attendanceDate")?.value;
  const c = document.getElementById("attendanceStudentList");
  if (!c) return;
  if (!year || !date) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>Select academic year and date</h3></div>'; return; }

  const students = (await getAllRecords(STORES.students)).filter(s => s.workspace === currentWorkspace && s.academicYear === year);
  const att = await getAllRecords(STORES.attendance);
  if (!students.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍🎓</div><h3>No students found</h3></div>'; return; }

  c.innerHTML = students.sort((a,b) => a.name.localeCompare(b.name)).map(s => {
    const r = att.find(a => a.studentId === s.id && a.workspace === currentWorkspace && a.academicYear === year && a.date === date);
    return `<div class="attendance-student-card"><div class="attendance-student-info"><div class="student-avatar">👨‍🎓</div><div><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.level)}${s.section ? " • " + escapeHTML(s.section) : ""}</p></div></div><div class="attendance-actions"><button class="attendance-button present-button ${r?.status === "present" ? "selected" : ""}" onclick="setAttendance(${s.id},'present')">🟢 Present</button><button class="attendance-button absent-button ${r?.status === "absent" ? "selected" : ""}" onclick="setAttendance(${s.id},'absent')">🔴 Absent</button></div></div>`;
  }).join("");
  await updateAttendanceSummary(year, date);
}

async function setAttendance(studentId, status) {
  const year = document.getElementById("attendanceAcademicYear")?.value;
  const date = document.getElementById("attendanceDate")?.value;
  if (!year || !date) return alert("Please select academic year and date.");

  // IMPORTANT: calculate semester using the current fixed function.
  const semester = getSemesterFromDate(date);
  if (!semester) return alert("Unable to determine semester from this date.");

  const all = await getAllRecords(STORES.attendance);
  const existing = all.find(a => a.studentId === studentId && a.workspace === currentWorkspace && a.academicYear === year && a.date === date);
  const s = await getRecord(STORES.students, studentId);
  const now = new Date().toISOString();

  if (existing) {
    existing.status = status;
    existing.semester = semester;
    existing.month = date.slice(0, 7);
    existing.updatedAt = now;
    await updateRecord(STORES.attendance, existing);
  } else {
    await addRecord(STORES.attendance, { studentId, studentName: s?.name || "", workspace: currentWorkspace, academicYear: year, semester, date, month: date.slice(0, 7), status, createdAt: now, updatedAt: now });
  }
  await loadAttendance();
}

async function updateAttendanceSummary(year, date) {
  const month = date.slice(0, 7);
  const rs = (await getAllRecords(STORES.attendance)).filter(a => a.workspace === currentWorkspace && a.academicYear === year && a.month === month);
  const p = rs.filter(a => a.status === "present").length;
  const ab = rs.filter(a => a.status === "absent").length;
  const total = p + ab;
  document.getElementById("attendanceSummary")?.classList.remove("hidden");
  const pt = document.getElementById("presentTotal");
  const at = document.getElementById("absentTotal");
  const sd = document.getElementById("schoolDaysTotal");
  const ap = document.getElementById("attendancePercentage");
  if (pt) pt.textContent = p;
  if (at) at.textContent = ab;
  if (sd) sd.textContent = countSchoolDays(year, month);
  if (ap) ap.textContent = (total ? p / total * 100 : 0).toFixed(1) + "%";
}

function countSchoolDays(year, month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const day = new Date(y, m - 1, d).getDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

// ============================================
// GRADE CALCULATION
// ============================================

async function computeGrades() {
  const sid = Number(document.getElementById("gradeStudentSelect")?.value);
  if (!sid || !selectedSubject || !selectedSemester) return alert("Please select a student, semester and subject.");
  const final = await calculateSubjectGrade(sid, await getStudentAcademicYear(sid), selectedSemester, selectedSubject);
  document.getElementById("subjectResult")?.classList.remove("hidden");
  const value = document.getElementById("subjectGradeValue");
  if (value) value.textContent = final.toFixed(2) + "%";
}

async function calculateSubjectGrade(sid, year, sem, subject) {
  const grades = await getAllRecords(STORES.grades);
  const comps = GRADING_COMPONENTS[subject] || [];
  let total = 0;
  for (const c of comps) {
    if (c.name === "Attendance") {
      const a = await getAttendancePercentageForStudent(sid, year, sem);
      total += a.weighted;
    } else {
      const rs = grades.filter(r => r.studentId === sid && r.workspace === currentWorkspace && r.academicYear === year && r.semester === sem && r.subject === subject && r.component === c.name);
      if (rs.length) {
        const avg = rs.reduce((x,r) => x + Number(r.percentage), 0) / rs.length;
        total += avg * c.weight / 100;
      }
    }
  }
  return total;
}

// ============================================
// DAILY NOTES
// ============================================

async function loadNoteStudents() {
  const sel = document.getElementById("noteStudentSelect");
  if (!sel) return;
  const list = (await getAllRecords(STORES.students)).filter(x => x.workspace === currentWorkspace);
  sel.innerHTML = '<option value="">Select Student</option>' + list.sort((a,b) => a.name.localeCompare(b.name)).map(x => `<option value="${x.id}">${escapeHTML(x.name)} — ${escapeHTML(x.level)}</option>`).join("");
}

async function initializeNotes() {
  const date = document.getElementById("noteDate");
  if (date && !date.value) date.value = getTodayDate();
  await loadNoteStudents();
  await loadNotes();
}

async function saveNote() {
  const sid = Number(document.getElementById("noteStudentSelect")?.value);
  const date = document.getElementById("noteDate")?.value;
  const text = document.getElementById("dailyNote")?.value.trim();
  if (!sid || !date || !text) return alert("Select a student, date and enter a note.");
  const student = await getRecord(STORES.students, sid);
  await addRecord(STORES.notes, { studentId: sid, workspace: currentWorkspace, academicYear: student?.academicYear || "", date, note: text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  document.getElementById("dailyNote").value = "";
  await loadNotes();
}

async function loadNotes() {
  const listEl = document.getElementById("notesList");
  if (!listEl) return;
  const rs = await getAllRecords(STORES.notes);
  const students = await getAllRecords(STORES.students);
  const list = rs.filter(r => r.workspace === currentWorkspace).sort((a,b) => b.date.localeCompare(a.date));
  listEl.innerHTML = list.length ? list.map(r => { const s = students.find(x => x.id === r.studentId); return `<div class="note-card"><strong>${escapeHTML(s?.name || "Unknown Student")}</strong><small>${r.date} — ${escapeHTML(r.academicYear || "")}</small><p>${escapeHTML(r.note)}</p><button class="delete-button" onclick="removeNote(${r.id})">🗑️ Remove</button></div>`; }).join("") : '<div class="empty-state"><div class="empty-icon">📝</div><h3>No notes yet</h3></div>';
}

async function removeNote(id) {
  if (confirm("Remove this note?")) { await deleteRecord(STORES.notes, id); await loadNotes(); }
}

// ============================================
// REPORT CARDS
// ============================================

async function loadReportStudents() {
  const sel = document.getElementById("reportStudentSelect");
  if (!sel) return;
  const list = (await getAllRecords(STORES.students)).filter(s => s.workspace === currentWorkspace);
  sel.innerHTML = '<option value="">Select Student</option>' + list.sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${escapeHTML(s.name)} — ${escapeHTML(s.level)}</option>`).join("");
}

async function generateReportCard() {
  const sid = Number(document.getElementById("reportStudentSelect")?.value);
  const sem = document.getElementById("reportSemester")?.value;
  if (!sid) return alert("Please select a student.");
  const s = await getRecord(STORES.students, sid);
  if (!s) { await loadReportStudents(); document.getElementById("reportPreview").innerHTML = ""; return alert("This student no longer exists. Please select another student."); }

  const year = s.academicYear;
  let rows = "";
  let overall = 0;
  let count = 0;
  for (const subject of Object.keys(GRADING_COMPONENTS)) {
    const grade = await calculateSubjectGrade(sid, year, sem, subject);
    overall += grade;
    count++;
    rows += `<tr><td>${subject}</td><td>${grade.toFixed(2)}%</td><td>${grade >= 75 ? "PASS" : "Needs Improvement"}</td></tr>`;
  }
  const att = await getAttendancePercentageForStudent(sid, year, sem);
  const preview = document.getElementById("reportPreview");
  if (!preview) return;
  preview.innerHTML = `<div class="report-card"><h1>🎓 Personal Grading System</h1><h2>Student Report Card</h2><p><strong>Student:</strong> ${escapeHTML(s.name)} &nbsp; <strong>ID:</strong> ${escapeHTML(s.studentId)}</p><p><strong>Level:</strong> ${escapeHTML(s.level)} &nbsp; <strong>Academic Year:</strong> ${escapeHTML(year)}</p><p><strong>Semester:</strong> ${sem === "first" ? "First Semester" : "Second Semester"}</p><table><thead><tr><th>Subject</th><th>Grade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><div class="report-attendance"><strong>Attendance:</strong> ${att.percentage.toFixed(2)}% (${att.present} Present / ${att.absent} Absent)</div><h2>Overall Average: ${(count ? overall / count : 0).toFixed(2)}%</h2><button class="primary-button" onclick="window.print()">🖨️ Print Report Card</button></div>`;
}

// ============================================
// EXPORTS
// ============================================

function csvCell(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

async function exportDetailedGrades() {
  const rs = (await getAllRecords(STORES.grades)).filter(r => r.workspace === currentWorkspace);
  downloadCSV("Grade_Detailed_Records.csv", [["Student ID","Record","Academic Year","Semester","Subject","Component","Date","Score","Total","Percentage","Notes"], ...rs.map(r => [r.studentId,r.recordName,r.academicYear,r.semester,r.subject,r.component,r.date,r.score,r.total,Number(r.percentage).toFixed(2)+"%",r.notes])]);
}

async function exportGradeSummary() {
  const students = (await getAllRecords(STORES.students)).filter(s => s.workspace === currentWorkspace);
  const rows = [["Student","Student ID","Academic Year","Level","Semester","English","Mathematics","Science"]];
  for (const s of students) for (const sem of ["first","second"]) {
    const grades = await Promise.all(Object.keys(GRADING_COMPONENTS).map(x => calculateSubjectGrade(s.id, s.academicYear, sem, x)));
    rows.push([s.name,s.studentId,s.academicYear,s.level,sem === "first" ? "First Semester" : "Second Semester",...grades.map(x => x.toFixed(2)+"%")]);
  }
  downloadCSV("Grade_Summary.csv", rows);
}

async function exportAttendanceMonthly() {
  const students = (await getAllRecords(STORES.students)).filter(s => s.workspace === currentWorkspace);
  const att = await getAllRecords(STORES.attendance);
  const rows = [["Student Name","Student ID","Academic Year","Month","Present","Absent","Total Marked","Attendance %"]];
  for (const s of students) {
    const months = [...new Set(att.filter(a => a.studentId === s.id && a.workspace === currentWorkspace).map(a => a.month))].sort();
    for (const m of months) {
      const rs = att.filter(a => a.studentId === s.id && a.workspace === currentWorkspace && a.month === m);
      const p = rs.filter(a => a.status === "present").length;
      const ab = rs.filter(a => a.status === "absent").length;
      const t = p + ab;
      rows.push([s.name,s.studentId,s.academicYear,m,p,ab,t,(t ? p/t*100 : 0).toFixed(2)+"%"]);
    }
  }
  downloadCSV("Attendance_Monthly_Summary.csv", rows);
}

async function exportAttendanceAll() {
  const rs = (await getAllRecords(STORES.attendance)).filter(r => r.workspace === currentWorkspace);
  downloadCSV("Attendance_Detailed.csv", [["Student Name","Student ID","Academic Year","Date","Month","Semester","Status"], ...rs.map(r => [r.studentName,r.studentId,r.academicYear,r.date,r.month,r.semester,r.status])]);
}

// ============================================
// HELPERS
// ============================================

async function getStudentAcademicYear(id) {
  const s = await getRecord(STORES.students, Number(id));
  return s?.academicYear || null;
}

function getSelectedAcademicYear() { return document.getElementById("academicYearSelect")?.value || ""; }

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getAcademicYearFromToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${m >= 8 ? y : y-1}–${m >= 8 ? y+1 : y}`;
}

function formatNumber(v) {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function escapeHTML(v) {
  const d = document.createElement("div");
  d.textContent = v == null ? "" : v;
  return d.innerHTML;
}

function resetRecordsInterface() {
  selectedSemester = null;
  selectedSubject = null;
  selectedComponentIndex = null;
  editingGradeId = null;
  document.getElementById("subjectArea")?.classList.add("hidden");
  document.getElementById("componentArea")?.classList.add("hidden");
  document.getElementById("subjectResult")?.classList.add("hidden");
}

// ============================================
// START
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Personal Grading System loaded.");
  const ay = document.getElementById("academicYearSelect");
  if (ay) ay.value = "2026–2027";
  const ad = document.getElementById("attendanceDate");
  if (ad) ad.value = getTodayDate();
  const nd = document.getElementById("noteDate");
  if (nd) nd.value = getTodayDate();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => console.log("✅ Service Worker registered.")).catch(error => console.warn("Service Worker registration failed:", error));
  }
  setupLogin();
  await checkLoginSession();
});

if (typeof supabaseClient !== "undefined") {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    if (event === "SIGNED_OUT") showLoginPage();
    if (event === "SIGNED_IN" && session) showApp();
  });
}

console.log("Personal Grading System loaded.");
