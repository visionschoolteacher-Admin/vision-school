const DB="visionSchoolDB", VERSION=2, STORE_STUDENTS="students", STORE_ATT="attendance", STORE_QUEUE="queue";
let db=null, stream=null, currentStudent=null, selectedPickup=null, editingId=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const today=()=>new Date().toLocaleDateString("en-CA");
const now=()=>new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
const keyFor=id=>`${today()}_${id}`;

function openDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB,VERSION);
    r.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains(STORE_STUDENTS))d.createObjectStore(STORE_STUDENTS,{keyPath:"id"});
      if(!d.objectStoreNames.contains(STORE_ATT))d.createObjectStore(STORE_ATT,{keyPath:"key"});
      if(!d.objectStoreNames.contains(STORE_QUEUE))d.createObjectStore(STORE_QUEUE,{keyPath:"id",autoIncrement:true});
    };
    r.onsuccess=()=>{db=r.result;resolve(db)}; r.onerror=()=>reject(r.error);
  });
}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function get(name,key){return new Promise((res,rej)=>{const r=store(name).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function all(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(name,obj){return new Promise((res,rej)=>{const r=store(name,"readwrite").put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function del(name,key){return new Promise((res,rej)=>{const r=store(name,"readwrite").delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

function toast(msg){$("toast").textContent=msg;$("toast").style.display="block";clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$("toast").style.display="none",2600)}
function online(){const yes=navigator.onLine;$("onlineBadge").textContent=yes?"ONLINE":"OFFLINE";$("connectionText").textContent=yes?"Connected":"Offline mode";$("statusDot").style.background=yes?"#28d17c":"#ffb020"}
window.addEventListener("online",()=>{online();syncQueue()});window.addEventListener("offline",online);

const titles={home:"Dashboard",scanner:"Scan QR Code",students:"Students",addStudent:"Add Student",student:"Student Details",pickup:"Pickup / Time Out",reports:"Reports",about:"About System"};
function show(id){
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  const s=$(id);if(s)s.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));
  $("pageTitle").textContent=titles[id]||"Vision School";
  $("sidebar").classList.remove("open");
  if(id==="home")refresh();
  if(id==="students")renderStudents();
  if(id==="reports")renderReport();
  if(id==="addStudent"&&!editingId)clearForm();
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-screen]");
  if(b){e.preventDefault();show(b.dataset.screen)}
});
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");

async function refresh(){
  const students=await all(STORE_STUDENTS), rows=await all(STORE_ATT), d=today(), t=rows.filter(r=>r.date===d);
  $("totalStudents").textContent=students.length;
  $("timeInCount").textContent=t.filter(r=>r.timeIn).length;
  $("inSchoolCount").textContent=t.filter(r=>r.timeIn&&!r.timeOut).length;
  $("pickedCount").textContent=t.filter(r=>r.timeOut).length;
  $("notInCount").textContent=students.filter(s=>!t.some(r=>r.studentId===s.id&&r.timeIn)).length;
  $("activity").innerHTML=t.slice().sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,8).map(r=>`
    <div class="activity-row"><div><b>${esc(r.studentName)} — ${r.timeOut?"PICKED UP":"TIME IN"}</b><small>${r.pickupPerson?"Picked up by "+esc(r.pickupPerson):"Grade "+esc(r.grade)+" • Section "+esc(r.section)}</small></div><strong>${esc(r.timeOut||r.timeIn||"")}</strong></div>`).join("")||'<div class="empty">No activity yet.</div>';
}

function addPickupRow(p={name:"",relationship:"",phone:""}){
  const row=document.createElement("div");row.className="pickup-item";
  row.innerHTML=`<input class="p-name" placeholder="Full name" value="${esc(p.name)}"><input class="p-rel" placeholder="Relationship" value="${esc(p.relationship)}"><input class="p-phone" placeholder="Phone number" value="${esc(p.phone)}"><button type="button" class="danger-btn remove-pickup">Remove</button>`;
  row.querySelector(".remove-pickup").onclick=()=>row.remove();
  $("pickupPeople").appendChild(row);
}
function clearForm(){
  editingId=null;$("editId").value="";$("formTitle").textContent="Add Student";$("studentForm").reset();$("pickupPeople").innerHTML="";addPickupRow();
}
function collectPickups(){
  return [...document.querySelectorAll(".pickup-item")].map(row=>({name:row.querySelector(".p-name").value.trim(),relationship:row.querySelector(".p-rel").value.trim(),phone:row.querySelector(".p-phone").value.trim()})).filter(p=>p.name);
}
$("addPickup").onclick=()=>addPickupRow();
$("clearForm").onclick=clearForm;

$("studentForm").onsubmit=async e=>{
  e.preventDefault();
  const id=$("studentId").value.trim().toUpperCase(), oldId=$("editId").value;
  if(!id||!$("studentName").value.trim()||!$("studentGrade").value.trim()||!$("studentSection").value.trim()||!$("studentParent").value.trim()){toast("Please complete all required fields.");return}
  if(!oldId && await get(STORE_STUDENTS,id)){toast("That Student ID already exists.");return}
  if(oldId&&oldId!==id&&await get(STORE_STUDENTS,id)){toast("The new Student ID already exists.");return}
  const student={id,name:$("studentName").value.trim(),grade:$("studentGrade").value.trim(),section:$("studentSection").value.trim(),parent:$("studentParent").value.trim(),phone:$("studentPhone").value.trim(),authorized:collectPickups(),updatedAt:new Date().toISOString()};
  if(!student.authorized.length)student.authorized=[];
  if(oldId&&oldId!==id)await del(STORE_STUDENTS,oldId);
  await put(STORE_STUDENTS,student);
  toast(oldId?"Student updated successfully!":"Student saved successfully!");
  clearForm();await renderStudents();show("students");
};

async function renderStudents(){
  const rows=await all(STORE_STUDENTS), q=($("studentSearch").value||"").trim().toLowerCase();
  const filtered=rows.filter(s=>[s.id,s.name,s.grade,s.section,s.parent].join(" ").toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
  $("studentCountLabel").textContent=`${filtered.length} of ${rows.length} student(s)`;
  $("studentTable").innerHTML=filtered.length?`<table><thead><tr><th>Student</th><th>Grade / Section</th><th>Parent</th><th>Pickup People</th><th>Actions</th></tr></thead><tbody>${filtered.map(s=>`<tr><td><b>${esc(s.name)}</b><br><span class="muted">${esc(s.id)}</span></td><td>${esc(s.grade)} / ${esc(s.section)}</td><td>${esc(s.parent)}<br><span class="muted">${esc(s.phone)}</span></td><td>${s.authorized?.length||0}</td><td><div class="table-actions"><button class="secondary-btn tiny" onclick="viewStudent('${esc(s.id)}')">View</button><button class="secondary-btn tiny" onclick="editStudent('${esc(s.id)}')">Edit</button><button class="secondary-btn tiny" onclick="showQR('${esc(s.id)}')">QR</button><button class="danger-btn tiny" onclick="deleteStudent('${esc(s.id)}')">Delete</button></div></td></tr>`).join("")}</tbody></table>`:'<div class="empty">No students found. Add your first student.</div>';
}
$("studentSearch").oninput=renderStudents;

async function editStudent(id){
  const s=await get(STORE_STUDENTS,id);if(!s)return;
  editingId=id;$("editId").value=id;$("formTitle").textContent="Edit Student";$("studentId").value=s.id;$("studentName").value=s.name;$("studentGrade").value=s.grade;$("studentSection").value=s.section;$("studentParent").value=s.parent;$("studentPhone").value=s.phone||"";$("pickupPeople").innerHTML="";(s.authorized||[]).forEach(addPickupRow);if(!(s.authorized||[]).length)addPickupRow();show("addStudent");
}
async function deleteStudent(id){
  const s=await get(STORE_STUDENTS,id);if(!s)return;
  if(!confirm(`Delete ${s.name} (${s.id})? This removes the student record from this device.`))return;
  await del(STORE_STUDENTS,id);toast("Student deleted.");renderStudents();refresh();
}
async function viewStudent(id){const s=await get(STORE_STUDENTS,id);if(!s)return;currentStudent=s;renderStudent(s);show("student")}

async function renderStudent(s){
  const r=await get(STORE_ATT,keyFor(s.id));
  $("studentCard").innerHTML=`<div class="student-profile"><img src="logo.png" class="student-avatar"><div><h2>${esc(s.name)}</h2><p class="muted">${esc(s.id)} • ${esc(s.grade)} • Section ${esc(s.section)}</p><div class="profile-grid"><div class="info-box"><small>Parent / Guardian</small><b>${esc(s.parent)}</b></div><div class="info-box"><small>Contact</small><b>${esc(s.phone||"-")}</b></div><div class="info-box"><small>Pickup People</small><b>${s.authorized?.length||0} authorized</b></div></div>
  <p><b>Today's Status:</b> <span class="status-pill ${r?.timeOut?"status-out":r?.timeIn?"status-in":"status-none"}">${r?.timeOut?"PICKED UP":r?.timeIn?"IN SCHOOL":"NOT CHECKED IN"}</span></p>
  ${r?.timeIn?`<p>Time In: <b>${esc(r.timeIn)}</b></p>`:""}
  ${r?.timeOut?`<p>Time Out: <b>${esc(r.timeOut)}</b> • Pickup: <b>${esc(r.pickupPerson)}</b></p>`:""}
  <div class="button-row"><button class="secondary-btn" onclick="showQR('${esc(s.id)}')">▣ Generate QR</button><button class="primary-btn" onclick="timeIn()">↪ TIME IN</button><button class="secondary-btn" onclick="openPickup()">🚗 PICKUP / TIME OUT</button></div></div></div>
  <hr><h3>Authorized Pickup People</h3><div class="pickup-options">${(s.authorized||[]).map(p=>`<div class="info-box"><b>${esc(p.name)}</b><small>${esc(p.relationship)} • ${esc(p.phone||"No phone")}</small></div>`).join("")||'<div class="empty">No authorized pickup people registered.</div>'}</div>`;
}

async function handleScan(raw){
  stopScanner();const id=String(raw||"").trim().toUpperCase();if(!id)return;
  const s=await get(STORE_STUDENTS,id);
  if(!s){$("scanMessage").innerHTML=`<div class="warning">Student ID not found: ${esc(id)}</div>`;show("scanner");return}
  currentStudent=s;renderStudent(s);show("student");
}
async function timeIn(){
  if(!currentStudent)return;
  const k=keyFor(currentStudent.id),old=await get(STORE_ATT,k);
  if(old?.timeIn){toast("Already checked in at "+old.timeIn);return}
  const rec={key:k,date:today(),studentId:currentStudent.id,studentName:currentStudent.name,grade:currentStudent.grade,section:currentStudent.section,timeIn:now(),timeOut:"",pickupPerson:"",pickupRelationship:"",pickupPhone:"",pickupOption:"",staff:"Staff",approver:"",notes:"",updatedAt:new Date().toISOString()};
  await put(STORE_ATT,rec);await queue(rec,"TIME_IN");toast("TIME IN SUCCESSFUL");renderStudent(currentStudent);refresh();
}
async function openPickup(){
  if(!currentStudent)return;
  const r=await get(STORE_ATT,keyFor(currentStudent.id));
  if(!r?.timeIn){toast("WARNING: Student has no TIME IN today.");return}
  if(r.timeOut){toast("Student already picked up at "+r.timeOut);return}
  selectedPickup=null;
  $("pickupCard").innerHTML=`<h2>${esc(currentStudent.name)}</h2><p class="muted">${esc(currentStudent.id)} • ${esc(currentStudent.grade)} • Section ${esc(currentStudent.section)}</p>
  <h3>Select pickup person</h3><div class="pickup-options" id="authOptions">${(currentStudent.authorized||[]).map((p,i)=>`<div class="pickup-option" data-index="${i}"><b>${esc(p.name)}</b><br><small>${esc(p.relationship)} • ${esc(p.phone||"")}</small></div>`).join("")||'<p class="muted">No authorized pickup person registered.</p>'}</div>
  <div class="form-group" style="margin-top:18px"><label>Pickup Option</label><select id="pickupOption"><option value="">Select an option…</option><option value="AUTHORIZED">Authorized pickup person</option><option value="UNAUTHORIZED_APPROVAL">Unauthorized person — Request Admin Approval</option><option value="EMERGENCY_APPROVAL">Emergency / Parent Phone Confirmation</option><option value="OTHER_APPROVAL">Other — Admin Approval Required</option></select></div>
  <div id="unauthorizedFields"></div>
  <div class="button-row"><button class="secondary-btn" onclick="show('student')">Cancel</button><button class="primary-btn" id="confirmPickup">✓ CONFIRM PICKUP</button></div>`;
  document.querySelectorAll(".pickup-option").forEach((el,i)=>el.onclick=()=>{selectedPickup=currentStudent.authorized[i];document.querySelectorAll(".pickup-option").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");$("pickupOption").value="AUTHORIZED";$("unauthorizedFields").innerHTML=""});
  $("pickupOption").onchange=optionChanged;$("confirmPickup").onclick=confirmPickup;show("pickup");
}
function optionChanged(){
  const v=$("pickupOption").value;if(v==="AUTHORIZED"){$("unauthorizedFields").innerHTML="";return}
  if(v)$("unauthorizedFields").innerHTML=`<div class="form-grid"><div class="form-group"><label>Pickup Person Full Name *</label><input id="upName" placeholder="Full name"></div><div class="form-group"><label>Relationship</label><input id="upRel" placeholder="Aunt, grandparent, etc."></div><div class="form-group"><label>Contact Number</label><input id="upPhone" placeholder="Phone number"></div><div class="form-group"><label>Approving Staff *</label><input id="approver" placeholder="Admin / authorized staff"></div></div><div class="form-group"><label>Reason / Notes</label><textarea id="upReason" rows="3" placeholder="Explain the reason for this pickup."></textarea></div><div class="warning">⚠ <b>APPROVAL REQUIRED.</b> Do not release the student until an authorized staff member approves this request.</div>`;
}
async function confirmPickup(){
  const option=$("pickupOption").value;if(!option){toast("Please select a pickup option.");return}
  let p=selectedPickup;
  if(option!=="AUTHORIZED"){
    const name=$("upName")?.value.trim(),rel=$("upRel")?.value.trim(),phone=$("upPhone")?.value.trim(),approver=$("approver")?.value.trim(),reason=$("upReason")?.value.trim();
    if(!name||!approver){toast("Pickup name and approving staff are required.");return}
    if(!confirm("Confirm approval and release of this student?"))return;p={name,relationship:rel,phone,approver,reason};
  }
  if(!p){toast("Please select an authorized pickup person.");return}
  const k=keyFor(currentStudent.id),r=await get(STORE_ATT,k);if(!r||!r.timeIn){toast("No TIME IN record.");return}if(r.timeOut){toast("Already picked up.");return}
  Object.assign(r,{timeOut:now(),pickupPerson:p.name,pickupRelationship:p.relationship||"",pickupPhone:p.phone||"",pickupOption:option,notes:p.reason||"",approver:p.approver||"",updatedAt:new Date().toISOString()});
  await put(STORE_ATT,r);await queue(r,"PICKUP");toast("PICKUP SUCCESSFUL");show("home");refresh();
}

async function showQR(id){
  const s=await get(STORE_STUDENTS,id);if(!s)return;
  $("qrContent").innerHTML=`<h2>${esc(s.name)}</h2><p class="muted">${esc(s.id)}</p><div id="qrcode" class="qr-box"></div><p class="muted">Scan this QR to identify the student.</p><button class="primary-btn" onclick="window.print()">Print / Save QR</button>`;
  $("qrModal").classList.add("open");
  if(window.QRCode)new QRCode($("qrcode"),{text:s.id,width:240,height:240,correctLevel:QRCode.CorrectLevel.H});
  else $("qrcode").innerHTML='<div class="warning">QR generator could not load. Check your internet connection.</div>';
}
$("closeQr").onclick=()=>$("qrModal").classList.remove("open");$("qrModal").onclick=e=>{if(e.target===$("qrModal"))$("qrModal").classList.remove("open")};

async function startScanner(){
  if(!navigator.mediaDevices?.getUserMedia){toast("Camera is not available. Use Manual Student ID.");return}
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    $("video").srcObject=stream;await $("video").play();$("cameraHint").textContent="Point camera at a QR code";$("scanMessage").innerHTML="";
    scanLoop();
  }catch(e){$("cameraHint").textContent="Camera permission unavailable";toast("Allow camera access or use Manual Student ID.")}
}
function stopScanner(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$("cameraHint").textContent="Camera is stopped"}
function scanLoop(){
  if(!stream)return;
  const v=$("video"),c=$("canvas");
  if(v.readyState>=2){
    c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0,c.width,c.height);
    if("BarcodeDetector" in window){
      if(!scanLoop.detector)scanLoop.detector=new BarcodeDetector({formats:["qr_code"]});
      scanLoop.detector.detect(c).then(r=>{if(r.length)handleScan(r[0].rawValue);else requestAnimationFrame(scanLoop)}).catch(()=>requestAnimationFrame(scanLoop));
    }else{
      $("scanMessage").innerHTML='<div class="warning">This browser does not support built-in QR detection. Use Manual Student ID or a QR-capable browser.</div>';
      requestAnimationFrame(scanLoop);
    }
  }else requestAnimationFrame(scanLoop);
}
$("startCamera").onclick=startScanner;$("stopCamera").onclick=stopScanner;
$("manualOpen").onclick=()=>handleScan($("manualId").value);$("manualId").addEventListener("keydown",e=>{if(e.key==="Enter")handleScan($("manualId").value)});

async function renderReport(){
  const rows=(await all(STORE_ATT)).slice().sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  $("reportTable").innerHTML=rows.length?`<table><thead><tr><th>Date</th><th>Student</th><th>Time In</th><th>Time Out</th><th>Pickup Person</th><th>Option</th><th>Approver</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}</td><td><b>${esc(r.studentName)}</b><br><span class="muted">${esc(r.studentId)}</span></td><td>${esc(r.timeIn||"-")}</td><td>${esc(r.timeOut||"-")}</td><td>${esc(r.pickupPerson||"-")}</td><td>${esc(r.pickupOption||"-")}</td><td>${esc(r.approver||"-")}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">No attendance records yet.</div>';
}
async function exportCSV(){
  const rows=await all(STORE_ATT),headers=["Date","Student ID","Student Name","Grade","Section","Time In","Time Out","Pickup Person","Relationship","Phone","Pickup Option","Staff","Approver","Notes"];
  const map={Date:"date","Student ID:"studentId"};
  const keys=["date","studentId","studentName","grade","section","timeIn","timeOut","pickupPerson","pickupRelationship","pickupPhone","pickupOption","staff","approver","notes"];
  const lines=[headers,...rows.map(r=>keys.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`))].map(x=>x.join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+lines],{type:"text/csv;charset=utf-8"}));a.download="vision_school_attendance.csv";a.click();URL.revokeObjectURL(a.href);
}
$("exportCsv").onclick=exportCSV;

async function queue(record,action){
  return new Promise((res,rej)=>{const r=store(STORE_QUEUE,"readwrite").add({record,action,createdAt:new Date().toISOString()});r.onsuccess=res;r.onerror=()=>rej(r.error)})
}
async function syncQueue(){
  if(!navigator.onLine)return;
  const url=localStorage.getItem("VISION_SYNC_URL");if(!url)return;
  const q=await all(STORE_QUEUE);
  for(const item of q){try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)});if(r.ok)await del(STORE_QUEUE,item.id)}catch(e){break}}
}

function tickClock(){
  const d=new Date();$("clock").textContent=d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});$("dateText").textContent=d.toLocaleDateString([], {weekday:"short",year:"numeric",month:"short",day:"numeric"});
}
setInterval(tickClock,1000);tickClock();
window.addEventListener("beforeunload",stopScanner);

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(console.warn));

(async()=>{
  try{await openDB();online();await refresh();await renderStudents();clearForm()}catch(e){console.error(e);toast("Database could not be opened.")};
})();