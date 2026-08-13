// Vision School - Supabase multi-device version + Guest Register
"use strict";

const SUPABASE_URL = "https://ymonpeujmhaymkxfmmtq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wrTUwpJaW8NlvBLR914apw_0kAQdnnK";
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const STUDENTS_TABLE = "students";
const ATTENDANCE_TABLE = "attendance";
const GUESTS_TABLE = "guests";
const GUEST_LOGS_TABLE = "guest_logs";

let studentsCache = [];
let attendanceCache = [];
let guestsCache = [];
let guestLogsCache = [];
let guestTableAvailable = true;
let currentStudent = null;
let selectedPickup = null;
let qrScanner = null;
let scannerRunning = false;
let realtimeChannel = null;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}
function attr(v) { return esc(v).replace(/`/g, "&#96;"); }
function toast(msg) {
  const e = document.getElementById("toast");
  if (!e) return;
  e.textContent = msg;
  e.style.display = "block";
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => e.style.display = "none", 2800);
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function now() {
  return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
}
function updateClock() {
  const clock = document.getElementById("clock");
  const date = document.getElementById("dateText");
  const d = new Date();
  if (clock) clock.textContent = d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  if (date) date.textContent = d.toLocaleDateString([], {weekday:"short", year:"numeric", month:"short", day:"numeric"});
}
function updateOnlineStatus() {
  const e = document.getElementById("onlineBadge");
  const t = document.getElementById("connectionText");
  if (!e) return;
  const on = navigator.onLine;
  e.textContent = on ? "ONLINE" : "OFFLINE";
  e.className = "badge " + (on ? "online" : "offline");
  if (t) t.textContent = on ? "Connected" : "No internet connection";
}

function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === id));
  document.getElementById(id)?.classList.add("active");
  const titleMap = {home:"Dashboard", scanner:"Scan QR Code", students:"Students", addStudent:"Add Student", guests:"Guests", reports:"Reports", about:"About System", student:"Student Details", pickup:"Pickup / Time Out"};
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = titleMap[id] || "Vision School";
  if (id !== "scanner") stopScanner();
  if (id === "home") { refreshAll(); }
  if (id === "students") renderStudents();
  if (id === "guests") renderGuests();
  if (id === "reports") renderReport();
  window.scrollTo({top:0, behavior:"smooth"});
}

function normalizeStudent(s) {
  return {...s,
    id:String(s.id||"").trim(), name:String(s.name||"").trim(), level:String(s.level||"").trim(),
    parent:String(s.parent||"").trim(), phone:String(s.phone||"").trim(), authorized:Array.isArray(s.authorized)?s.authorized:[]
  };
}
function normalizeAttendance(a) {
  return {...a,
    student_id:a.student_id??a.studentId, date:a.date??"", time_in:a.time_in??a.timeIn, time_out:a.time_out??a.timeOut,
    pickup_person:a.pickup_person??a.pickupPerson, pickup_relationship:a.pickup_relationship??a.pickupRelationship,
    pickup_phone:a.pickup_phone??a.pickupPhone, pickup_option:a.pickup_option??a.pickupOption, staff:a.staff??"", approver:a.approver??"", notes:a.notes??""
  };
}
function normalizeGuest(g) {
  return {...g, id:g.id, guest_name:String(g.guest_name||"").trim(), contact_number:String(g.contact_number||"").trim(), purpose:String(g.purpose||"").trim()};
}

async function loadStudents() {
  const {data,error} = await supabase.from(STUDENTS_TABLE).select("*").order("name",{ascending:true});
  if (error) throw error;
  studentsCache = (data||[]).map(normalizeStudent);
}
async function loadAttendance() {
  const {data,error} = await supabase.from(ATTENDANCE_TABLE).select("*").order("created_at",{ascending:false});
  if (error) throw error;
  attendanceCache = (data||[]).map(normalizeAttendance);
}
async function loadGuests() {
  const {data,error} = await supabase.from(GUESTS_TABLE).select("*").order("created_at",{ascending:false});
  if (error) { guestTableAvailable=false; console.warn("Guest table not available:", error.message); return; }
  guestTableAvailable=true; guestsCache=(data||[]).map(normalizeGuest);
}
async function loadGuestLogs() {
  const {data,error} = await supabase.from(GUEST_LOGS_TABLE).select("*").order("created_at",{ascending:false});
  if (error) { console.warn("Guest logs not available:", error.message); return; }
  guestLogsCache=data||[];
}
async function refreshAll() {
  try {
    await Promise.all([loadStudents(), loadAttendance(), loadGuests(), loadGuestLogs()]);
    refreshDashboard();
    renderStudents();
    if (document.getElementById("guests")?.classList.contains("active")) renderGuests();
  } catch(e) {
    console.error(e);
    toast("Could not load Supabase data. Check RLS policies and table columns.");
  }
}

function setupRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase.channel("vision-school-live")
    .on("postgres_changes", {event:"*",schema:"public",table:STUDENTS_TABLE}, async()=>{await loadStudents();refreshDashboard();renderStudents();if(currentStudent)await refreshCurrentStudent();})
    .on("postgres_changes", {event:"*",schema:"public",table:ATTENDANCE_TABLE}, async()=>{await loadAttendance();refreshDashboard();if(currentStudent)await refreshCurrentStudent();renderReport();})
    .on("postgres_changes", {event:"*",schema:"public",table:GUESTS_TABLE}, async()=>{await loadGuests();renderGuests();})
    .on("postgres_changes", {event:"*",schema:"public",table:GUEST_LOGS_TABLE}, async()=>{await loadGuestLogs();renderGuests();})
    .subscribe();
}

function refreshDashboard() {
  const date=today(), todays=attendanceCache.filter(a=>a.date===date), timeIn=todays.filter(a=>a.time_in), picked=todays.filter(a=>a.time_out);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set("totalStudents",studentsCache.length); set("timeInCount",timeIn.length); set("inSchoolCount",todays.filter(a=>a.time_in&&!a.time_out).length); set("pickedCount",picked.length); set("notInCount",Math.max(0,studentsCache.length-timeIn.length)); set("guestCount",guestsCache.length);
  const activity=document.getElementById("activity"); if(!activity)return;
  if(!todays.length && !guestsCache.length){activity.innerHTML='<p class="muted">No activity yet.</p>';return;}
  const studentRows=todays.slice().sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))).slice(0,6).map(a=>`<div class="activity-row"><b>${esc(a.student_name||"")}</b> — ${a.time_out?"PICKED UP":"IN SCHOOL"}<br><span class="muted">${esc(a.time_in||"")}${a.time_out?` → ${esc(a.time_out)}`:""}${a.pickup_person?` • ${esc(a.pickup_person)}`:""}</span></div>`);
  const guestRows=guestsCache.slice(0,2).map(g=>`<div class="activity-row"><b>GUEST: ${esc(g.guest_name)}</b> — REGISTERED<br><span class="muted">${esc(g.purpose)} • ${esc(g.created_at?new Date(g.created_at).toLocaleTimeString():"")}</span></div>`);
  activity.innerHTML=studentRows.concat(guestRows).join("")||'<p class="muted">No activity yet.</p>';
}

function addPickupPersonField(){const c=document.getElementById("pickupPeopleContainer");if(!c)return;const d=document.createElement("div");d.className="student-card";d.innerHTML=`<div class="row"><b>Authorized Person</b><button type="button" class="danger" onclick="this.closest('.student-card').remove()">Remove</button></div><label>Full Name</label><input class="pickup-name" placeholder="Full name"><label>Relationship</label><input class="pickup-relationship" placeholder="Mother, Father, Aunt..."><label>Contact Number</label><input class="pickup-phone" placeholder="Phone number">`;c.appendChild(d);}
function clearStudentForm(){["studentIdInput","studentNameInput","studentLevelInput","studentParentInput","studentPhoneInput"].forEach(id=>{const e=document.getElementById(id);if(e)e.value=""});const c=document.getElementById("pickupPeopleContainer");if(c)c.innerHTML="";const m=document.getElementById("studentMessage");if(m)m.innerHTML="";addPickupPersonField();}
function showStudentMessage(m,type="success"){const e=document.getElementById("studentMessage");if(!e)return;e.innerHTML=`<div class="${type==="warning"?"warning":"success"}">${esc(m)}</div>`;setTimeout(()=>e.innerHTML="",3500);}

async function addStudent(event){if(event)event.preventDefault();const id=document.getElementById("studentIdInput").value.trim().toUpperCase(),name=document.getElementById("studentNameInput").value.trim(),level=document.getElementById("studentLevelInput").value.trim(),parent=document.getElementById("studentParentInput").value.trim(),phone=document.getElementById("studentPhoneInput").value.trim();if(!id||!name||!level||!parent){showStudentMessage("Please complete Student ID, Name, Level/Grade, and Parent/Guardian.","warning");return;}if(studentsCache.some(s=>s.id.toUpperCase()===id)){showStudentMessage("This Student ID already exists.","warning");return;}const authorized=[...document.querySelectorAll("#pickupPeopleContainer .student-card")].map(d=>({name:d.querySelector(".pickup-name")?.value.trim()||"",relationship:d.querySelector(".pickup-relationship")?.value.trim()||"",phone:d.querySelector(".pickup-phone")?.value.trim()||""})).filter(p=>p.name);const {error}=await supabase.from(STUDENTS_TABLE).insert({id,name,level,parent,phone,authorized});if(error){console.error(error);showStudentMessage("Save failed: "+error.message,"warning");return;}showStudentMessage(`${name} was added successfully.`);clearStudentForm();await loadStudents();renderStudents();refreshDashboard();toast("Student added to shared database.");}

function renderStudents(){const c=document.getElementById("studentList");if(!c)return;const q=(document.getElementById("studentSearch")?.value||"").toLowerCase().trim();const rows=studentsCache.filter(s=>!q||s.id.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)||s.level.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));if(!rows.length){c.innerHTML='<p class="muted">No students found.</p>';return;}c.innerHTML=rows.map(s=>`<div class="student-card"><div class="student-title"><div><h3>${esc(s.name)}</h3><div>${esc(s.id)} • ${esc(s.level)}</div><div class="muted">Parent: ${esc(s.parent)}</div></div><span class="pill">${(s.authorized||[]).length} authorized</span></div><div class="row" style="margin-top:12px"><button class="primary" onclick="generateStudentQR('${attr(s.id)}')">🔲 Generate QR</button><button class="secondary" onclick="viewStudent('${attr(s.id)}')">👁 View</button><button class="danger" onclick="deleteStudent('${attr(s.id)}')">🗑 Remove</button></div></div>`).join("");}
async function viewStudent(id){currentStudent=studentsCache.find(s=>s.id===id)||null;if(!currentStudent){toast("Student not found.");return;}await renderStudent(currentStudent);show("student");}
async function deleteStudent(id){const s=studentsCache.find(x=>x.id===id);if(!s||!confirm(`Remove ${s.name} (${s.id})?`))return;const {error}=await supabase.from(STUDENTS_TABLE).delete().eq("id",id);if(error){toast("Delete failed: "+error.message);return;}toast("Student removed.");await loadStudents();refreshDashboard();renderStudents();}

function generateStudentQR(id){document.getElementById("qrModal")?.remove();const m=document.createElement("div");m.id="qrModal";m.className="modal";m.innerHTML=`<div class="modal-box"><h2>Student QR Code</h2><p class="muted">Student ID</p><h2>${esc(id)}</h2><div id="qrCodeBox" style="display:flex;justify-content:center;margin:18px"></div><p class="muted">This QR contains only the Student ID.</p><div class="row"><button class="primary" onclick="downloadStudentQR('${attr(id)}')">💾 Download</button><button class="secondary" onclick="document.getElementById('qrModal').remove()">Close</button></div></div>`;document.body.appendChild(m);try{if(typeof QRCode!=="undefined"){new QRCode(document.getElementById("qrCodeBox"),{text:id,width:250,height:250,correctLevel:QRCode.CorrectLevel.H});}else{throw new Error("QRCode library unavailable");}}catch(e){console.error(e);document.getElementById("qrCodeBox").innerHTML='<div class="warning">QR generator failed to load. Check your internet connection and refresh.</div>';}}
function downloadStudentQR(id){const box=document.getElementById("qrCodeBox"),canvas=box?.querySelector("canvas"),img=box?.querySelector("img");if(canvas){const a=document.createElement("a");a.download=`${id}_QR.png`;a.href=canvas.toDataURL("image/png");a.click();}else if(img){const a=document.createElement("a");a.download=`${id}_QR.png`;a.href=img.src;a.click();}else toast("QR code is not ready.");}

function attendanceFor(id){return attendanceCache.find(a=>a.date===today()&&String(a.student_id)===String(id));}
async function refreshCurrentStudent(){if(currentStudent){const fresh=studentsCache.find(s=>s.id===currentStudent.id);if(fresh){currentStudent=fresh;await renderStudent(fresh);}}}
async function renderStudent(s){const r=attendanceFor(s.id),auth=s.authorized||[],status=r?.time_out?"PICKED UP":r?.time_in?"IN SCHOOL":"NOT CHECKED IN",cls=r?.time_out?"status-out":r?.time_in?"status-in":"status-none";const card=document.getElementById("studentCard");if(!card)return;card.innerHTML=`<h2>Student Details</h2><h2>${esc(s.name)}</h2><p><b>Student ID:</b> ${esc(s.id)}</p><p><b>Level / Grade:</b> ${esc(s.level)}</p><p><b>Parent / Guardian:</b> ${esc(s.parent)}</p><p><b>Parent Phone:</b> ${esc(s.phone||"-")}</p><p><b>Authorized Pickup People:</b> ${auth.length}</p>${auth.length?`<div class="student-card">${auth.map((p,i)=>`<div><b>${i+1}. ${esc(p.name)}</b> — ${esc(p.relationship||"")} ${p.phone?`• ${esc(p.phone)}`:""}</div>`).join("")}</div>`:"<p class='muted'>No authorized pickup people registered.</p>"}<p><b>Status:</b> <span class="pill ${cls}">${status}</span></p>${r?.time_in?`<p><b>Time In:</b> ${esc(r.time_in)}</p>`:""}${r?.time_out?`<p><b>Time Out:</b> ${esc(r.time_out)}</p><p><b>Pickup:</b> ${esc(r.pickup_person||"-")}</p>`:""}<div class="row" style="margin-top:16px">${!r?.time_in?'<button class="primary" onclick="timeIn()">⏱️ TIME IN</button>':!r?.time_out?'<button class="primary" onclick="openPickup()">🚗 PICKUP / TIME OUT</button>':""}<button class="secondary" onclick="show('scanner')">← Scan Another</button></div>`;}

async function timeIn(){if(!currentStudent){toast("No student selected.");return;}const existing=attendanceFor(currentStudent.id);if(existing?.time_in){toast(`Already checked in at ${existing.time_in}.`);return;}const payload={date:today(),student_id:currentStudent.id,student_name:currentStudent.name,level:currentStudent.level,time_in:now(),time_out:null,pickup_person:null,pickup_relationship:null,pickup_phone:null,pickup_option:null,staff:"Staff",approver:null,notes:null};const {error}=await supabase.from(ATTENDANCE_TABLE).insert(payload);if(error){console.error(error);toast("Time In failed: "+error.message);return;}await loadAttendance();toast("TIME IN SUCCESSFUL");await renderStudent(currentStudent);refreshDashboard();}

async function openPickup(){if(!currentStudent){toast("No student selected.");return;}const r=attendanceFor(currentStudent.id);if(!r?.time_in){toast("WARNING: Student has no TIME IN today.");return;}if(r.time_out){toast("Student already picked up.");return;}selectedPickup=null;const auth=currentStudent.authorized||[],c=document.getElementById("pickupCard");c.innerHTML=`<h2>🚗 Secure Pickup / Time Out</h2><h3>${esc(currentStudent.name)}</h3><p>${esc(currentStudent.id)} • ${esc(currentStudent.level)}</p><hr><h3>Authorized Pickup Person</h3><div class="option-grid">${auth.length?auth.map((p,i)=>`<div id="authOption${i}" class="option" onclick="selectAuth(${i})"><b>${esc(p.name)}</b><br>${esc(p.relationship||"")}${p.phone?` • ${esc(p.phone)}`:""}</div>`).join(""):'<div class="warning">No authorized pickup persons are registered.</div>'}</div><label>Pickup Option</label><select id="pickupOption" onchange="optionChanged()"><option value="">Select an option...</option><option value="AUTHORIZED">Authorized pickup person</option><option value="UNAUTHORIZED_APPROVAL">Unauthorized person — Admin Approval</option><option value="EMERGENCY_APPROVAL">Emergency / Parent Phone Confirmation</option><option value="OTHER_APPROVAL">Other — Admin Approval</option></select><div id="unauthorizedFields"></div><div class="row"><button class="secondary" onclick="show('student')">Cancel</button><button class="primary" onclick="confirmPickup()">CONFIRM PICKUP</button></div>`;c.dataset.authorized=JSON.stringify(auth);show("pickup");}
function selectAuth(i){const auth=JSON.parse(document.getElementById("pickupCard").dataset.authorized||"[]"),p=auth[i];if(!p)return;selectedPickup={...p,option:"AUTHORIZED"};document.getElementById("pickupOption").value="AUTHORIZED";document.getElementById("unauthorizedFields").innerHTML="";document.querySelectorAll(".option").forEach(x=>x.classList.remove("selected"));document.getElementById(`authOption${i}`)?.classList.add("selected");}
function optionChanged(){const v=document.getElementById("pickupOption").value,f=document.getElementById("unauthorizedFields");selectedPickup=null;if(v==="AUTHORIZED"||!v){f.innerHTML="";return;}f.innerHTML=`<label>Pickup Person Full Name *</label><input id="upName" placeholder="Full name"><label>Relationship</label><input id="upRel" placeholder="Aunt, Grandparent..."><label>Contact Number</label><input id="upPhone" placeholder="Phone number"><label>Vehicle Plate Number <span class="muted">(optional)</span></label><input id="upPlate" placeholder="e.g. 1234 ABC"><label>Reason / Notes</label><textarea id="upReason" rows="3" placeholder="Explain why this person is picking up the student."></textarea><label>Approving Staff *</label><input id="approver" placeholder="Admin / authorized staff name"><div class="warning"><b>⚠ APPROVAL REQUIRED</b><br>Do not release the student until authorized staff approves this request.</div>`;}
async function confirmPickup(){if(!currentStudent)return;const option=document.getElementById("pickupOption")?.value;if(!option){toast("Please select a pickup option.");return;}let pickup=selectedPickup;if(option==="AUTHORIZED"){if(!pickup){toast("Please select an authorized pickup person.");return;}}else{const name=document.getElementById("upName")?.value.trim(),relationship=document.getElementById("upRel")?.value.trim(),phone=document.getElementById("upPhone")?.value.trim(),plate=document.getElementById("upPlate")?.value.trim(),reason=document.getElementById("upReason")?.value.trim(),approver=document.getElementById("approver")?.value.trim();if(!name||!approver){toast("Pickup person name and approving staff are required.");return;}pickup={name,relationship,phone,plate,reason,approver,option};if(!confirm("Confirm ADMIN APPROVAL and release this student?"))return;}const r=attendanceFor(currentStudent.id);if(!r||!r.time_in||r.time_out){toast("Attendance record is not ready for pickup.");return;}const notes=[r.notes||"",pickup.plate?`Plate: ${pickup.plate}`:"",pickup.reason||""].filter(Boolean).join(" | ");const payload={time_out:now(),pickup_person:pickup.name||null,pickup_relationship:pickup.relationship||null,pickup_phone:pickup.phone||null,pickup_option:option,approver:pickup.approver||null,notes:notes||null};const {error}=await supabase.from(ATTENDANCE_TABLE).update(payload).eq("id",r.id);if(error){console.error(error);toast("Pickup failed: "+error.message);return;}await loadAttendance();toast("PICKUP SUCCESSFUL");currentStudent=null;show("home");refreshDashboard();}

async function renderReport(){const c=document.getElementById("reportTable");if(!c)return;if(!attendanceCache.length&&!guestLogsCache.length){c.innerHTML='<p class="muted">No attendance or guest records yet.</p>';return;}c.innerHTML=`<h3>Attendance Records</h3><table><thead><tr><th>Date</th><th>Student</th><th>Level</th><th>Time In</th><th>Time Out</th><th>Pickup</th><th>Option</th><th>Approver</th><th>Notes</th></tr></thead><tbody>${attendanceCache.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.student_name||"")}</td><td>${esc(r.level||"")}</td><td>${esc(r.time_in||"-")}</td><td>${esc(r.time_out||"-")}</td><td>${esc(r.pickup_person||"-")}</td><td>${esc(r.pickup_option||"-")}</td><td>${esc(r.approver||"-")}</td><td>${esc(r.notes||"-")}</td></tr>`).join("")}</tbody></table><br><h3>Guest Audit Records</h3>${guestLogsCache.length?`<table><thead><tr><th>Date</th><th>Time</th><th>Guest Name</th><th>Contact</th><th>Purpose</th><th>Action</th></tr></thead><tbody>${guestLogsCache.map(g=>`<tr><td>${esc(g.created_at?new Date(g.created_at).toLocaleDateString():"-")}</td><td>${esc(g.created_at?new Date(g.created_at).toLocaleTimeString():"-")}</td><td>${esc(g.guest_name)}</td><td>${esc(g.contact_number)}</td><td>${esc(g.purpose)}</td><td>${esc(g.action)}</td></tr>`).join("")}</tbody></table>`:'<p class="muted">No guest audit records yet.</p>'}`;}
function csv(v){return `"${String(v??"").replaceAll('"','""')}"`;}
function exportCSV(){const headers=["Record Type","Date","Time","Student ID","Student Name","Level","Time In","Time Out","Pickup Person","Relationship","Phone","Pickup Option","Staff","Approver","Notes","Guest Name","Guest Contact","Guest Purpose","Guest Action"];const lines=[headers.map(csv).join(",")];attendanceCache.forEach(r=>lines.push(["ATTENDANCE",r.date,"",r.student_id,r.student_name,r.level,r.time_in,r.time_out,r.pickup_person,r.pickup_relationship,r.pickup_phone,r.pickup_option,r.staff,r.approver,r.notes,"","","",""] .map(csv).join(",")));guestLogsCache.forEach(g=>{const d=g.created_at?new Date(g.created_at):null;lines.push(["GUEST AUDIT",d?d.toLocaleDateString():"",d?d.toLocaleTimeString():"","","","","","","","","","","","","",g.guest_name,g.contact_number,g.purpose,g.action].map(csv).join(","));});const a=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"}));a.href=url;a.download=`vision_school_monitoring_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function startScanner(){if(typeof Html5Qrcode==="undefined"){toast("QR scanner library did not load.");return;}if(scannerRunning)return;const reader=document.getElementById("reader");if(!reader)return;reader.innerHTML="";qrScanner=new Html5Qrcode("reader");try{await qrScanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>handleScan(text),()=>{});scannerRunning=true;const m=document.getElementById("scanMessage");if(m)m.innerHTML='<div class="success">Camera is ready. Point it at the QR code.</div>';}catch(e){console.error(e);scannerRunning=false;toast("Camera could not start. Allow camera permission and try again.");}}
async function stopScanner(){if(!qrScanner){scannerRunning=false;return;}try{if(scannerRunning)await qrScanner.stop();}catch(_){}try{await qrScanner.clear();}catch(_){}qrScanner=null;scannerRunning=false;}
async function handleScan(raw){const id=String(raw||"").trim().toUpperCase();if(!id){toast("No Student ID detected.");return;}await stopScanner();const s=studentsCache.find(x=>x.id.toUpperCase()===id);if(!s){const m=document.getElementById("scanMessage");if(m)m.innerHTML=`<div class="warning">Student ID not found: <b>${esc(id)}</b><br><br>Please add this student first.</div>`;return;}currentStudent=s;await renderStudent(s);show("student");}

// ---------------- GUEST REGISTER ----------------
function openGuestForm(){
  const c=document.getElementById("guestFormCard");
  if(!c)return;
  c.innerHTML=`<h2>Register Guest</h2><p class="muted">Enter the visitor's information for school monitoring.</p><div class="form-grid"><div class="form-group"><label for="guestName">Guest Name *</label><input id="guestName" placeholder="Full name" autocomplete="off"></div><div class="form-group"><label for="guestContact">Contact Number *</label><input id="guestContact" placeholder="Phone number" autocomplete="off"></div><div class="form-group" style="grid-column:1/-1"><label for="guestPurpose">Purpose *</label><textarea id="guestPurpose" rows="3" placeholder="Reason for visiting Vision School"></textarea></div></div><div class="form-actions"><button type="button" class="secondary-btn" onclick="clearGuestForm()">Clear</button><button type="button" class="primary-btn" onclick="saveGuest()">✓ Save Guest</button></div>`;
  show("guests");
  document.getElementById("guestName")?.focus();
}
function clearGuestForm(){["guestName","guestContact","guestPurpose"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});}
async function saveGuest(){
  const name=document.getElementById("guestName")?.value.trim(), contact=document.getElementById("guestContact")?.value.trim(), purpose=document.getElementById("guestPurpose")?.value.trim();
  if(!name||!contact||!purpose){toast("Guest Name, Contact Number, and Purpose are required.");return;}
  if(!guestTableAvailable){toast("Guest database is not ready. Run guest_setup.sql in Supabase first.");return;}
  const {data,error}=await supabase.from(GUESTS_TABLE).insert({guest_name:name,contact_number:contact,purpose}).select().single();
  if(error){console.error(error);toast("Guest save failed: "+error.message);return;}
  const guestId=data?.id||null;
  const log={guest_id:guestId,guest_name:name,contact_number:contact,purpose,action:"ADDED"};
  const logResult=await supabase.from(GUEST_LOGS_TABLE).insert(log);
  if(logResult.error)console.warn("Guest log failed:",logResult.error.message);
  clearGuestForm();toast("Guest registered successfully.");await loadGuests();await loadGuestLogs();renderGuests();refreshDashboard();
}
async function deleteGuest(id){
  const g=guestsCache.find(x=>String(x.id)===String(id));
  if(!g)return;
  if(!confirm(`Remove guest ${g.guest_name} from the active guest list?\n\nThe monitoring record will be kept in the Guest Audit Records.`))return;
  const logResult=await supabase.from(GUEST_LOGS_TABLE).insert({guest_id:g.id,guest_name:g.guest_name,contact_number:g.contact_number,purpose:g.purpose,action:"REMOVED"});
  if(logResult.error){toast("Could not record guest removal: "+logResult.error.message);return;}
  const {error}=await supabase.from(GUESTS_TABLE).delete().eq("id",id);
  if(error){toast("Guest removal failed: "+error.message);return;}
  toast("Guest removed from active list. Audit record kept.");await loadGuests();await loadGuestLogs();renderGuests();refreshDashboard();
}
function renderGuests(){
  const list=document.getElementById("guestList"), count=document.getElementById("guestCountLabel");if(!list)return;
  if(count)count.textContent=`${guestsCache.length} active guest${guestsCache.length===1?"":"s"}`;
  if(!guestTableAvailable){list.innerHTML='<div class="warning"><b>Guest database is not ready.</b><br>Run the included <code>guest_setup.sql</code> in Supabase SQL Editor, then refresh this app.</div>';return;}
  if(!guestsCache.length){list.innerHTML='<p class="muted">No active guests right now.</p>';return;}
  list.innerHTML=guestsCache.map(g=>`<div class="guest-card"><div><h3>${esc(g.guest_name)}</h3><p><b>Contact:</b> ${esc(g.contact_number)}</p><p><b>Purpose:</b> ${esc(g.purpose)}</p><small class="muted">Registered ${g.created_at?esc(new Date(g.created_at).toLocaleString()):""}</small></div><button class="danger" onclick="deleteGuest('${attr(g.id)}')">🗑 Remove</button></div>`).join("");
}

function setupButtonEvents(){
  document.querySelectorAll("[data-screen]").forEach(b=>b.addEventListener("click",()=>{show(b.dataset.screen);if(document.getElementById("sidebar")?.classList.contains("open"))document.getElementById("sidebar").classList.remove("open");}));
  document.getElementById("startCamera")?.addEventListener("click",startScanner);
  document.getElementById("stopCamera")?.addEventListener("click",stopScanner);
  document.getElementById("manualOpen")?.addEventListener("click",()=>handleScan(document.getElementById("manualId")?.value||""));
  document.getElementById("studentForm")?.addEventListener("submit",addStudent);
  document.getElementById("addPickup")?.addEventListener("click",addPickupPersonField);
  document.getElementById("clearForm")?.addEventListener("click",clearStudentForm);
  document.getElementById("studentSearch")?.addEventListener("input",renderStudents);
  document.getElementById("refreshStudents")?.addEventListener("click",async()=>{await loadStudents();renderStudents();toast("Student list refreshed.");});
  document.getElementById("exportCsv")?.addEventListener("click",exportCSV);
  document.getElementById("closeQr")?.addEventListener("click",()=>document.getElementById("qrModal")?.classList.add("hidden"));
  document.getElementById("mobileMenu")?.addEventListener("click",()=>document.getElementById("sidebar")?.classList.toggle("open"));
  document.getElementById("guestAddButton")?.addEventListener("click",openGuestForm);
}

window.addEventListener("online",()=>{updateOnlineStatus();refreshAll();});
window.addEventListener("offline",updateOnlineStatus);
window.show=show;window.startScanner=startScanner;window.stopScanner=stopScanner;window.handleScan=handleScan;window.addStudent=addStudent;window.timeIn=timeIn;window.openPickup=openPickup;window.confirmPickup=confirmPickup;window.selectAuth=selectAuth;window.optionChanged=optionChanged;window.exportCSV=exportCSV;window.addPickupPersonField=addPickupPersonField;window.deleteStudent=deleteStudent;window.editStudent=()=>toast("Student editing is not enabled in this version.");window.renderStudents=renderStudents;window.generateStudentQR=generateStudentQR;window.downloadStudentQR=downloadStudentQR;window.viewStudent=viewStudent;window.openGuestForm=openGuestForm;window.saveGuest=saveGuest;window.deleteGuest=deleteGuest;window.clearGuestForm=clearGuestForm;window.renderGuests=renderGuests;

window.addEventListener("DOMContentLoaded",async()=>{
  updateOnlineStatus(); updateClock(); setInterval(updateClock,1000); setupButtonEvents(); clearStudentForm(); await refreshAll(); setupRealtime();
  console.log("Vision School application started successfully.");
});
