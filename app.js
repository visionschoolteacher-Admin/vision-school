/* ============================================================
   VISION SCHOOL - FINAL APP.JS
   Supabase multi-device + QR attendance + secure pickup + guests
   IMPORTANT: uses `db`, not `supabase`, to avoid variable collisions.
   Attendance writes automatically remove unknown columns reported by
   Supabase schema cache, so old attendance schemas do not break Time In.
   ============================================================ */
"use strict";

const SUPABASE_URL = "https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Supabase library did not load. Check index.html script order/internet connection.");
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const STUDENTS_TABLE = "students";
const ATTENDANCE_TABLE = "attendance";
const GUESTS_TABLE = "guests";
const GUEST_LOGS_TABLE = "guest_logs";

let studentsCache = [];
let attendanceCache = [];
let guestsCache = [];
let guestLogsCache = [];
let currentStudent = null;
let selectedPickup = null;
let qrScanner = null;
let scannerRunning = false;
let realtimeChannel = null;
let guestTableAvailable = true;
let guestLogsAvailable = true;

/* ---------------- HELPERS ---------------- */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[ch]));
}
function attr(value) { return esc(value).replace(/`/g, "&#96;"); }
function jsArg(value) {
  return JSON.stringify(String(value ?? ""));
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function nowTime() {
  return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
}
function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(window.__visionToast);
  window.__visionToast = setTimeout(() => { el.style.display = "none"; }, 3200);
}
function setMessage(id, message, type="success") {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="${type === "warning" ? "warning" : "success"}">${esc(message)}</div>`;
}
function updateClock() {
  const d = new Date();
  const clock = document.getElementById("clock");
  const date = document.getElementById("dateText");
  if (clock) clock.textContent = d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  if (date) date.textContent = d.toLocaleDateString([], {weekday:"short", year:"numeric", month:"short", day:"numeric"});
}
function updateOnlineStatus() {
  const online = navigator.onLine;
  const badge = document.getElementById("onlineBadge");
  const text = document.getElementById("connectionText");
  const dot = document.getElementById("statusDot");
  if (badge) { badge.textContent = online ? "ONLINE" : "OFFLINE"; badge.className = "badge " + (online ? "online" : "offline"); }
  if (text) text.textContent = online ? "Connected" : "No internet connection";
  if (dot) dot.classList.toggle("online", online);
}
function explainError(error, fallback) {
  console.error(fallback, error);
  const msg = error?.message || error?.details || fallback;
  toast(msg);
}

/* ---------------- SCREENS ---------------- */
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === id));
  document.getElementById(id)?.classList.add("active");
  const titles = {home:"Dashboard", scanner:"Scan QR Code", students:"Students", addStudent:"Add Student", student:"Student Details", pickup:"Pickup / Time Out", guests:"Guests", reports:"Reports", about:"About System"};
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = titles[id] || "Vision School";
  if (id !== "scanner") stopScanner();
  if (id === "home") refreshDashboard();
  if (id === "students") renderStudents();
  if (id === "guests") renderGuests();
  if (id === "reports") renderReports();
  window.scrollTo({top:0, behavior:"smooth"});
}

/* ---------------- NORMALIZATION ---------------- */
function normalizeStudent(s) {
  return {...s,
    id:String(s.id ?? "").trim(), name:String(s.name ?? "").trim(), level:String(s.level ?? "").trim(),
    parent:String(s.parent ?? "").trim(), phone:String(s.phone ?? "").trim(), authorized:Array.isArray(s.authorized) ? s.authorized : []
  };
}
function normalizeAttendance(a) {
  return {...a,
    student_id:a.student_id ?? a.studentId ?? "",
    date:a.date ?? "",
    time_in:a.time_in ?? a.timeIn ?? null,
    time_out:a.time_out ?? a.timeOut ?? null,
    pickup_person:a.pickup_person ?? a.pickupPerson ?? null,
    pickup_relationship:a.pickup_relationship ?? a.pickupRelationship ?? null,
    pickup_phone:a.pickup_phone ?? a.pickupPhone ?? null,
    pickup_option:a.pickup_option ?? a.pickupOption ?? null,
    approver:a.approver ?? null,
    notes:a.notes ?? null
  };
}
function normalizeGuest(g) {
  return {...g, id:g.id, guest_name:String(g.guest_name ?? "").trim(), contact_number:String(g.contact_number ?? "").trim(), purpose:String(g.purpose ?? "").trim()};
}

/* ---------------- DATABASE LOAD ---------------- */
async function loadStudents() {
  const {data,error} = await db.from(STUDENTS_TABLE).select("*").order("name", {ascending:true});
  if (error) throw error;
  studentsCache = (data || []).map(normalizeStudent);
}
async function loadAttendance() {
  const {data,error} = await db.from(ATTENDANCE_TABLE).select("*").order("created_at", {ascending:false});
  if (error) throw error;
  attendanceCache = (data || []).map(normalizeAttendance);
}
async function loadGuests() {
  const {data,error} = await db.from(GUESTS_TABLE).select("*").order("created_at", {ascending:false});
  if (error) { guestTableAvailable = false; guestsCache = []; console.warn("Guest table unavailable:", error); return; }
  guestTableAvailable = true; guestsCache = (data || []).map(normalizeGuest);
}
async function loadGuestLogs() {
  const {data,error} = await db.from(GUEST_LOGS_TABLE).select("*").order("created_at", {ascending:false});
  if (error) { guestLogsAvailable = false; guestLogsCache = []; console.warn("Guest logs unavailable:", error); return; }
  guestLogsAvailable = true; guestLogsCache = data || [];
}
async function refreshAll() {
  try {
    await Promise.all([loadStudents(), loadAttendance(), loadGuests(), loadGuestLogs()]);
    refreshDashboard(); renderStudents(); renderGuests(); renderReports();
  } catch (error) {
    console.error("DATABASE LOAD ERROR:", error);
    toast("Could not load database. Check Supabase permissions/RLS and internet connection.");
  }
}

/* ---------------- SCHEMA-SAFE ATTENDANCE WRITES ----------------
   If an old Supabase attendance table is missing a column, Supabase
   returns PGRST204: Could not find the 'column' column. We remove that
   exact column and retry. This makes Time In work with older schemas.
*/
function missingColumnFromError(error) {
  const message = String(error?.message || "");
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match ? match[1] : null;
}
async function schemaSafeInsert(table, originalPayload) {
  const payload = {...originalPayload};
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await db.from(table).insert(payload);
    if (!result.error) return result;
    const missing = missingColumnFromError(result.error);
    if (!missing || !(missing in payload)) return result;
    console.warn(`Supabase schema does not have '${missing}'. Retrying without it.`);
    delete payload[missing];
  }
  return {error:{message:"The table schema is incompatible with this app after several retries."}};
}
async function schemaSafeUpdate(table, payload, filterColumn, filterValue) {
  const working = {...payload};
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await db.from(table).update(working).eq(filterColumn, filterValue);
    if (!result.error) return result;
    const missing = missingColumnFromError(result.error);
    if (!missing || !(missing in working)) return result;
    console.warn(`Supabase schema does not have '${missing}'. Retrying without it.`);
    delete working[missing];
  }
  return {error:{message:"The table schema is incompatible with this app after several retries."}};
}

/* ---------------- DASHBOARD ---------------- */
function attendanceFor(id) {
  return attendanceCache.find(a => a.date === today() && String(a.student_id) === String(id));
}
function refreshDashboard() {
  const date = today();
  const todays = attendanceCache.filter(a => a.date === date);
  const timeIn = todays.filter(a => a.time_in);
  const picked = todays.filter(a => a.time_out);
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set("totalStudents", studentsCache.length);
  set("timeInCount", timeIn.length);
  set("inSchoolCount", todays.filter(a => a.time_in && !a.time_out).length);
  set("pickedCount", picked.length);
  set("notInCount", Math.max(0, studentsCache.length - timeIn.length));
  set("guestCount", guestsCache.length);
  const activity = document.getElementById("activity");
  if (!activity) return;
  const studentRows = todays.slice().sort((a,b) => String(b.created_at||"").localeCompare(String(a.created_at||""))).slice(0,6).map(a =>
    `<div class="activity-row"><b>${esc(a.student_name || a.student_id)}</b> — ${a.time_out ? "PICKED UP" : "IN SCHOOL"}<br><span class="muted">${esc(a.time_in || "")}${a.time_out ? ` → ${esc(a.time_out)}` : ""}${a.pickup_person ? ` • ${esc(a.pickup_person)}` : ""}</span></div>`
  );
  const guestRows = guestsCache.slice(0,3).map(g =>
    `<div class="activity-row"><b>GUEST: ${esc(g.guest_name)}</b> — ACTIVE<br><span class="muted">${esc(g.purpose)}</span></div>`
  );
  activity.innerHTML = studentRows.concat(guestRows).join("") || '<p class="muted">No activity yet.</p>';
}

/* ---------------- STUDENTS ---------------- */
function clearStudentForm() {
  ["studentIdInput","studentNameInput","studentLevelInput","studentParentInput","studentPhoneInput"].forEach(id => { const e=document.getElementById(id); if(e)e.value=""; });
  const c=document.getElementById("pickupPeopleContainer"); if(c)c.innerHTML="";
  const m=document.getElementById("studentMessage"); if(m)m.innerHTML="";
  addPickupPersonField();
}
function addPickupPersonField() {
  const c=document.getElementById("pickupPeopleContainer"); if(!c)return;
  const d=document.createElement("div"); d.className="authorized-person student-card";
  d.innerHTML=`<div class="row"><b>Authorized Person</b><button type="button" class="danger-btn">Remove</button></div><div class="pickup-fields"><input class="pickup-name" placeholder="Full name"><input class="pickup-relationship" placeholder="Relationship"><input class="pickup-phone" placeholder="Contact number"></div>`;
  d.querySelector(".danger-btn").addEventListener("click",()=>d.remove()); c.appendChild(d);
}
function collectAuthorized() {
  return [...document.querySelectorAll("#pickupPeopleContainer .authorized-person")].map(d => ({
    name:d.querySelector(".pickup-name")?.value.trim() || "",
    relationship:d.querySelector(".pickup-relationship")?.value.trim() || "",
    phone:d.querySelector(".pickup-phone")?.value.trim() || ""
  })).filter(x=>x.name);
}
async function addStudent(event) {
  if(event)event.preventDefault();
  const id=document.getElementById("studentIdInput")?.value.trim().toUpperCase();
  const name=document.getElementById("studentNameInput")?.value.trim();
  const level=document.getElementById("studentLevelInput")?.value.trim();
  const parent=document.getElementById("studentParentInput")?.value.trim();
  const phone=document.getElementById("studentPhoneInput")?.value.trim();
  if(!id||!name||!level||!parent){setMessage("studentMessage","Please complete Student ID, Name, Level/Grade, and Parent/Guardian.","warning");return;}
  if(studentsCache.some(s=>s.id.toUpperCase()===id)){setMessage("studentMessage","This Student ID already exists.","warning");return;}
  const {error}=await db.from(STUDENTS_TABLE).insert({id,name,level,parent,phone:phone||"",authorized:collectAuthorized()});
  if(error){console.error("STUDENT SAVE ERROR:",error);setMessage("studentMessage",error.message,"warning");return;}
  setMessage("studentMessage",`${name} was added successfully.`); toast("Student added to shared database."); clearStudentForm(); await loadStudents(); refreshDashboard(); renderStudents();
}
function renderStudents() {
  const c=document.getElementById("studentList"); if(!c)return;
  const q=(document.getElementById("studentSearch")?.value||"").toLowerCase().trim();
  const rows=studentsCache.filter(s=>!q||s.id.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)||s.level.toLowerCase().includes(q));
  if(!rows.length){c.innerHTML='<p class="muted">No students found.</p>';return;}
  c.innerHTML=rows.map(s=>`<div class="student-card"><div class="student-title"><div><h3>${esc(s.name)}</h3><div><b>${esc(s.id)}</b> • ${esc(s.level)}</div><div class="muted">Parent: ${esc(s.parent)}</div></div><span class="pill">${(s.authorized||[]).length} authorized</span></div><div class="row" style="margin-top:12px"><button class="primary-btn" onclick="generateStudentQR(${jsArg(s.id)})">▣ Generate QR</button><button class="secondary-btn" onclick="viewStudent(${jsArg(s.id)})">View</button><button class="danger-btn" onclick="deleteStudent(${jsArg(s.id)})">Remove</button></div></div>`).join("");
}
async function viewStudent(id){currentStudent=studentsCache.find(s=>s.id===id)||null;if(!currentStudent){toast("Student not found.");return;}renderStudent(currentStudent);show("student");}
async function deleteStudent(id){const s=studentsCache.find(x=>x.id===id);if(!s||!confirm(`Remove ${s.name} (${s.id})?`))return;const {error}=await db.from(STUDENTS_TABLE).delete().eq("id",id);if(error){explainError(error,"Student removal failed.");return;}toast("Student removed.");await loadStudents();refreshDashboard();renderStudents();}

function renderStudent(s){
  const card=document.getElementById("studentCard");if(!card)return;
  const r=attendanceFor(s.id), auth=s.authorized||[];
  const status=r?.time_out?"PICKED UP":r?.time_in?"IN SCHOOL":"NOT CHECKED IN";
  card.innerHTML=`<div class="panel-head"><div><h2>${esc(s.name)}</h2><p>${esc(s.id)} • ${esc(s.level)}</p></div><span class="status-badge ${r?.time_out?"status-out":r?.time_in?"status-in":"status-none"}">${status}</span></div><div class="profile-grid"><div class="detail-item"><span>Student ID</span><b>${esc(s.id)}</b></div><div class="detail-item"><span>Level / Grade</span><b>${esc(s.level)}</b></div><div class="detail-item"><span>Parent / Guardian</span><b>${esc(s.parent)}</b></div><div class="detail-item"><span>Parent Phone</span><b>${esc(s.phone||"-")}</b></div><div class="detail-item"><span>Time In</span><b>${esc(r?.time_in||"-")}</b></div><div class="detail-item"><span>Time Out</span><b>${esc(r?.time_out||"-")}</b></div></div><h3>Authorized Pickup People</h3>${auth.length?`<div class="authorized-list">${auth.map((p,i)=>`<div class="authorized-item"><b>${i+1}. ${esc(p.name)}</b><div class="muted">${esc(p.relationship||"")}${p.phone?` • ${esc(p.phone)}`:""}</div></div>`).join("")}</div>`:'<p class="muted">No authorized pickup people registered.</p>'}<div class="row" style="margin-top:18px">${!r?.time_in?'<button class="primary-btn" onclick="timeIn()">⏱️ TIME IN</button>':!r?.time_out?'<button class="primary-btn" onclick="openPickup()">🚗 PICKUP / TIME OUT</button>':""}<button class="secondary-btn" onclick="show('scanner')">← Scan Another</button></div>`;
}

/* ---------------- TIME IN ---------------- */
async function timeIn(){
  if(!currentStudent){toast("No student selected.");return;}
  const existing=attendanceFor(currentStudent.id);
  if(existing?.time_in){toast(`Already checked in at ${existing.time_in}.`);renderStudent(currentStudent);return;}
  const payload={
    date:today(),
    student_id:currentStudent.id,
    student_name:currentStudent.name,
    time_in:nowTime(),
    time_out:null,
    level:currentStudent.level || "", // automatically removed if old table has no level
    staff:"Staff" // automatically removed if old table has no staff
  };
  console.log("Saving Time In:",payload);
  const result=await schemaSafeInsert(ATTENDANCE_TABLE,payload);
  if(result.error){console.error("TIME IN ERROR:",result.error);toast("Time In failed: "+(result.error.message||"Database error"));return;}
  toast("TIME IN recorded successfully."); await loadAttendance(); renderStudent(currentStudent); refreshDashboard();
}

/* ---------------- PICKUP ---------------- */
function openPickup(){
  if(!currentStudent){toast("No student selected.");return;}
  const r=attendanceFor(currentStudent.id); if(!r?.time_in){toast("Student has no TIME IN today.");return;} if(r.time_out){toast("Student already picked up.");return;}
  selectedPickup=null;
  const auth=currentStudent.authorized||[], c=document.getElementById("pickupCard"); if(!c)return;
  c.innerHTML=`<h2>🚗 Secure Pickup / Time Out</h2><h3>${esc(currentStudent.name)}</h3><p>${esc(currentStudent.id)} • ${esc(currentStudent.level)}</p><hr><h3>Authorized Pickup Person</h3><div class="option-grid">${auth.length?auth.map((p,i)=>`<div id="authOption${i}" class="option" onclick="selectAuth(${i})"><b>${esc(p.name)}</b><br>${esc(p.relationship||"")}${p.phone?` • ${esc(p.phone)}`:""}</div>`).join(""):'<div class="warning">No authorized pickup persons are registered.</div>'}</div><label>Pickup Option</label><select id="pickupOption" onchange="optionChanged()"><option value="">Select an option...</option><option value="AUTHORIZED">Authorized pickup person</option><option value="UNAUTHORIZED_APPROVAL">Unauthorized person — Admin Approval</option><option value="EMERGENCY_APPROVAL">Emergency / Parent Phone Confirmation</option><option value="OTHER_APPROVAL">Other — Admin Approval</option></select><div id="unauthorizedFields"></div><div class="row"><button class="secondary-btn" onclick="show('student')">Cancel</button><button class="primary-btn" onclick="confirmPickup()">CONFIRM PICKUP</button></div>`;
  c.dataset.authorized=JSON.stringify(auth);show("pickup");
}
function selectAuth(i){const auth=JSON.parse(document.getElementById("pickupCard")?.dataset.authorized||"[]"),p=auth[i];if(!p)return;selectedPickup={...p,option:"AUTHORIZED"};document.getElementById("pickupOption").value="AUTHORIZED";document.getElementById("unauthorizedFields").innerHTML="";document.querySelectorAll(".option").forEach(x=>x.classList.remove("selected"));document.getElementById(`authOption${i}`)?.classList.add("selected");}
function optionChanged(){const v=document.getElementById("pickupOption")?.value,f=document.getElementById("unauthorizedFields");selectedPickup=null;if(!f)return;if(v==="AUTHORIZED"||!v){f.innerHTML="";return;}f.innerHTML=`<label>Pickup Person Full Name *</label><input id="upName" placeholder="Full name"><label>Relationship</label><input id="upRel" placeholder="Aunt, Grandparent..."><label>Contact Number</label><input id="upPhone" placeholder="Phone number"><label>Reason / Notes</label><textarea id="upReason" rows="3" placeholder="Reason for pickup"></textarea><label>Approving Staff *</label><input id="approver" placeholder="Admin / authorized staff name"><div class="warning"><b>⚠ APPROVAL REQUIRED</b><br>Do not release the student until authorized staff approves.</div>`;}
async function confirmPickup(){
  if(!currentStudent)return;
  const option=document.getElementById("pickupOption")?.value;if(!option){toast("Please select a pickup option.");return;}
  let pickup=selectedPickup;
  if(option==="AUTHORIZED"){if(!pickup){toast("Please select an authorized pickup person.");return;}}
  else {const name=document.getElementById("upName")?.value.trim(),relationship=document.getElementById("upRel")?.value.trim(),phone=document.getElementById("upPhone")?.value.trim(),reason=document.getElementById("upReason")?.value.trim(),approver=document.getElementById("approver")?.value.trim();if(!name||!approver){toast("Pickup person name and approving staff are required.");return;}pickup={name,relationship,phone,reason,approver,option};if(!confirm("Confirm approval and release this student?"))return;}
  const r=attendanceFor(currentStudent.id);if(!r?.id){toast("Attendance record is not ready for pickup.");return;}
  const payload={time_out:nowTime(),pickup_person:pickup.name||null,pickup_relationship:pickup.relationship||null,pickup_phone:pickup.phone||null,pickup_option:option,approver:pickup.approver||null,notes:pickup.reason||null};
  const result=await schemaSafeUpdate(ATTENDANCE_TABLE,payload,"id",r.id);
  if(result.error){console.error("PICKUP ERROR:",result.error);toast("Pickup failed: "+result.error.message);return;}
  toast("PICKUP SUCCESSFUL");await loadAttendance();currentStudent=null;show("home");refreshDashboard();
}

/* ---------------- QR ---------------- */
function generateStudentQR(id){
  document.getElementById("qrModal")?.remove();
  const m=document.createElement("div");m.id="qrModal";m.className="modal";
  m.innerHTML=`<div class="modal-box"><button class="modal-close" onclick="document.getElementById('qrModal')?.remove()">×</button><h2>Student QR Code</h2><p class="muted">Student ID</p><h2>${esc(id)}</h2><div id="qrCodeBox" style="display:flex;justify-content:center;margin:18px"></div><p class="muted">This QR contains only the Student ID.</p><div class="row"><button class="primary-btn" onclick="downloadStudentQR(${jsArg(id)})">💾 Download</button><button class="secondary-btn" onclick="document.getElementById('qrModal')?.remove()">Close</button></div></div>`;
  document.body.appendChild(m);
  try { if(typeof QRCode==="undefined")throw new Error("QRCode library unavailable"); new QRCode(document.getElementById("qrCodeBox"),{text:id,width:250,height:250,correctLevel:QRCode.CorrectLevel.H}); }
  catch(e){console.error(e);document.getElementById("qrCodeBox").innerHTML='<div class="warning">QR generator failed to load. Refresh and check internet connection.</div>';}
}
function downloadStudentQR(id){const box=document.getElementById("qrCodeBox"),canvas=box?.querySelector("canvas"),img=box?.querySelector("img");if(canvas){const a=document.createElement("a");a.download=`${id}_QR.png`;a.href=canvas.toDataURL("image/png");a.click();}else if(img){const a=document.createElement("a");a.download=`${id}_QR.png`;a.href=img.src;a.click();}else toast("QR code is not ready.");}
async function startScanner(){
  if(typeof Html5Qrcode==="undefined"){toast("QR scanner library did not load.");return;} if(scannerRunning)return;
  const reader=document.getElementById("reader");if(!reader)return;reader.innerHTML="";qrScanner=new Html5Qrcode("reader");
  try{await qrScanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>handleScan(text),()=>{});scannerRunning=true;const m=document.getElementById("scanMessage");if(m)m.innerHTML='<div class="success">Camera is ready. Point it at the QR code.</div>';}
  catch(e){console.error(e);scannerRunning=false;toast("Camera could not start. Allow camera permission and try again.");}
}
async function stopScanner(){if(!qrScanner){scannerRunning=false;return;}try{if(scannerRunning)await qrScanner.stop();}catch(_){}try{await qrScanner.clear();}catch(_){}qrScanner=null;scannerRunning=false;}
async function handleScan(raw){const id=String(raw||"").trim().toUpperCase();if(!id){toast("No Student ID detected.");return;}await stopScanner();const s=studentsCache.find(x=>x.id.toUpperCase()===id);if(!s){const m=document.getElementById("scanMessage");if(m)m.innerHTML=`<div class="warning">Student ID not found: <b>${esc(id)}</b><br><br>Please add this student first.</div>`;return;}currentStudent=s;renderStudent(s);show("student");}

/* ---------------- GUESTS ---------------- */
function openGuestForm(){
  const c=document.getElementById("guestFormCard");if(!c)return;
  c.innerHTML=`<h2>Register Guest</h2><p class="muted">Enter visitor information for school monitoring.</p><div class="form-grid"><div class="form-group"><label>Guest Name *</label><input id="guestName" placeholder="Full name" autocomplete="off"></div><div class="form-group"><label>Contact Number *</label><input id="guestContact" placeholder="Phone number" autocomplete="off"></div><div class="form-group" style="grid-column:1/-1"><label>Purpose *</label><textarea id="guestPurpose" rows="3" placeholder="Reason for visiting Vision School"></textarea></div></div><div class="form-actions"><button type="button" class="secondary-btn" onclick="clearGuestForm()">Clear</button><button type="button" class="primary-btn" onclick="saveGuest()">✓ Save Guest</button></div>`;
  show("guests");document.getElementById("guestName")?.focus();
}
function clearGuestForm(){["guestName","guestContact","guestPurpose"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});}
async function saveGuest(){
  const name=document.getElementById("guestName")?.value.trim(),contact=document.getElementById("guestContact")?.value.trim(),purpose=document.getElementById("guestPurpose")?.value.trim();
  if(!name||!contact||!purpose){toast("Guest Name, Contact Number, and Purpose are required.");return;}
  if(!guestTableAvailable){toast("Guest table is not available. Run guest_setup.sql in Supabase.");return;}
  const {data,error}=await db.from(GUESTS_TABLE).insert({guest_name:name,contact_number:contact,purpose}).select().single();
  if(error){explainError(error,"Guest save failed.");return;}
  if(guestLogsAvailable){const log=await db.from(GUEST_LOGS_TABLE).insert({guest_id:data?.id||null,guest_name:name,contact_number:contact,purpose,action:"ADDED"});if(log.error)console.warn("Guest ADD log failed:",log.error);}
  clearGuestForm();toast("Guest registered successfully.");await loadGuests();await loadGuestLogs();renderGuests();refreshDashboard();
}
async function deleteGuest(id){
  const g=guestsCache.find(x=>String(x.id)===String(id));if(!g)return;
  if(!confirm(`Remove guest ${g.guest_name} from the active guest list?\n\nThe monitoring record will be kept in Guest Audit Records.`))return;
  if(guestLogsAvailable){const log=await db.from(GUEST_LOGS_TABLE).insert({guest_id:g.id,guest_name:g.guest_name,contact_number:g.contact_number,purpose:g.purpose,action:"REMOVED"});if(log.error){explainError(log.error,"Could not record guest removal.");return;}}
  const {error}=await db.from(GUESTS_TABLE).delete().eq("id",id);if(error){explainError(error,"Guest removal failed.");return;}
  toast("Guest removed from active list. Audit record kept.");await loadGuests();await loadGuestLogs();renderGuests();refreshDashboard();
}
function renderGuests(){
  const list=document.getElementById("guestList"),count=document.getElementById("guestCountLabel");if(!list)return;if(count)count.textContent=`${guestsCache.length} active guest${guestsCache.length===1?"":"s"}`;
  if(!guestTableAvailable){list.innerHTML='<div class="warning"><b>Guest database is not ready.</b><br>Run guest_setup.sql in Supabase SQL Editor, then refresh.</div>';return;}
  if(!guestsCache.length){list.innerHTML='<p class="muted">No active guests right now.</p>';return;}
  list.innerHTML=guestsCache.map(g=>`<div class="guest-card"><div><h3>${esc(g.guest_name)}</h3><p><b>Contact:</b> ${esc(g.contact_number)}</p><p><b>Purpose:</b> ${esc(g.purpose)}</p><small class="muted">Registered ${g.created_at?esc(new Date(g.created_at).toLocaleString()):""}</small></div><button class="danger-btn" onclick="deleteGuest(${jsArg(g.id)})">🗑 Remove</button></div>`).join("");
}

/* ---------------- REPORTS / CSV ---------------- */
function renderReports(){
  const c=document.getElementById("reportTable");if(!c)return;
  c.innerHTML=`<h3>Attendance Records</h3>${attendanceCache.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>ID</th><th>Time In</th><th>Time Out</th><th>Pickup</th><th>Option</th><th>Approver</th></tr></thead><tbody>${attendanceCache.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.student_name||"")}</td><td>${esc(r.student_id||"")}</td><td>${esc(r.time_in||"-")}</td><td>${esc(r.time_out||"-")}</td><td>${esc(r.pickup_person||"-")}</td><td>${esc(r.pickup_option||"-")}</td><td>${esc(r.approver||"-")}</td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">No attendance records yet.</p>'}<br><h3>Guest Audit Records</h3>${guestLogsCache.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Guest</th><th>Contact</th><th>Purpose</th><th>Action</th></tr></thead><tbody>${guestLogsCache.map(g=>{const d=g.created_at?new Date(g.created_at):null;return `<tr><td>${d?esc(d.toLocaleDateString()):"-"}</td><td>${d?esc(d.toLocaleTimeString()):"-"}</td><td>${esc(g.guest_name)}</td><td>${esc(g.contact_number)}</td><td>${esc(g.purpose)}</td><td>${esc(g.action)}</td></tr>`;}).join("")}</tbody></table></div>`:'<p class="muted">No guest audit records yet.</p>'}`;
}
function csv(v){return `"${String(v??"").replaceAll('"','""')}"`;}
function exportCSV(){
  const headers=["Record Type","Date","Time","Student ID","Student Name","Time In","Time Out","Pickup Person","Relationship","Phone","Pickup Option","Approver","Notes","Guest Name","Guest Contact","Guest Purpose","Guest Action"];
  const lines=[headers.map(csv).join(",")];
  attendanceCache.forEach(r=>lines.push(["ATTENDANCE",r.date,"",r.student_id,r.student_name,r.time_in,r.time_out,r.pickup_person,r.pickup_relationship,r.pickup_phone,r.pickup_option,r.approver,r.notes,"","","",""] .map(csv).join(",")));
  guestLogsCache.forEach(g=>{const d=g.created_at?new Date(g.created_at):null;lines.push(["GUEST AUDIT",d?.toLocaleDateString()||"",d?.toLocaleTimeString()||"","","","","","","","","","","",g.guest_name,g.contact_number,g.purpose,g.action].map(csv).join(","));});
  const a=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"}));a.href=url;a.download=`vision_school_monitoring_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------------- REALTIME ---------------- */
function setupRealtime(){
  if(realtimeChannel)return;
  realtimeChannel=db.channel("vision-school-live")
    .on("postgres_changes",{event:"*",schema:"public",table:STUDENTS_TABLE},async()=>{await loadStudents();refreshDashboard();if(document.getElementById("students")?.classList.contains("active"))renderStudents();if(currentStudent){currentStudent=studentsCache.find(s=>s.id===currentStudent.id)||currentStudent;renderStudent(currentStudent);}})
    .on("postgres_changes",{event:"*",schema:"public",table:ATTENDANCE_TABLE},async()=>{await loadAttendance();refreshDashboard();if(currentStudent)renderStudent(currentStudent);if(document.getElementById("reports")?.classList.contains("active"))renderReports();})
    .on("postgres_changes",{event:"*",schema:"public",table:GUESTS_TABLE},async()=>{await loadGuests();renderGuests();refreshDashboard();})
    .on("postgres_changes",{event:"*",schema:"public",table:GUEST_LOGS_TABLE},async()=>{await loadGuestLogs();if(document.getElementById("reports")?.classList.contains("active"))renderReports();})
    .subscribe(status=>console.log("Vision School realtime status:",status));
}

/* ---------------- EVENTS ---------------- */
function setupEvents(){
  document.querySelectorAll("[data-screen]").forEach(b=>b.addEventListener("click",()=>{show(b.dataset.screen);document.getElementById("sidebar")?.classList.remove("open");}));
  document.getElementById("startCamera")?.addEventListener("click",startScanner);
  document.getElementById("stopCamera")?.addEventListener("click",stopScanner);
  document.getElementById("manualOpen")?.addEventListener("click",()=>handleScan(document.getElementById("manualId")?.value||""));
  document.getElementById("studentForm")?.addEventListener("submit",addStudent);
  document.getElementById("addPickup")?.addEventListener("click",addPickupPersonField);
  document.getElementById("clearForm")?.addEventListener("click",clearStudentForm);
  document.getElementById("studentSearch")?.addEventListener("input",renderStudents);
  document.getElementById("refreshStudents")?.addEventListener("click",async()=>{await loadStudents();renderStudents();toast("Student list refreshed.");});
  document.getElementById("exportCsv")?.addEventListener("click",exportCSV);
  document.getElementById("mobileMenu")?.addEventListener("click",()=>document.getElementById("sidebar")?.classList.toggle("open"));
  document.getElementById("guestAddButton")?.addEventListener("click",openGuestForm);
}

/* ---------------- GLOBALS / STARTUP ---------------- */
Object.assign(window,{show,startScanner,stopScanner,handleScan,addStudent,timeIn,openPickup,confirmPickup,selectAuth,optionChanged,exportCSV,addPickupPersonField,deleteStudent,generateStudentQR,downloadStudentQR,viewStudent,openGuestForm,saveGuest,deleteGuest,clearGuestForm,renderGuests});
window.addEventListener("online",()=>{updateOnlineStatus();refreshAll();});
window.addEventListener("offline",updateOnlineStatus);
window.addEventListener("DOMContentLoaded",async()=>{
  console.log("Vision School starting...");
  updateOnlineStatus();updateClock();setInterval(updateClock,1000);setupEvents();clearStudentForm();
  await refreshAll();setupRealtime();
  console.log("✓ Vision School application started successfully.");
});
