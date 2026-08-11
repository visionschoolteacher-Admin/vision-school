const DB="visionSchoolDB", STORE_STUDENTS="students", STORE_ATT="attendance", STORE_QUEUE="queue";
let db, stream=null, currentStudent=null, selectedPickup=null;

const demoStudents=[
 {id:"STU001",name:"Juan Dela Cruz",grade:"Grade 3",section:"A",parent:"Maria Dela Cruz",phone:"09171234567",
  authorized:[{name:"Maria Dela Cruz",relationship:"Mother",phone:"09171234567"},{name:"Juan Dela Cruz",relationship:"Father",phone:"09181234567"},{name:"Ana Santos",relationship:"Aunt",phone:"09201234567"}]},
 {id:"STU002",name:"Maria Santos",grade:"Grade 3",section:"A",parent:"Liza Santos",phone:"09170000002",
  authorized:[{name:"Liza Santos",relationship:"Mother",phone:"09170000002"},{name:"Pedro Santos",relationship:"Father",phone:"09170000003"}]},
 {id:"STU003",name:"Pedro Reyes",grade:"Grade 3",section:"A",parent:"Rosa Reyes",phone:"09170000004",
  authorized:[{name:"Rosa Reyes",relationship:"Mother",phone:"09170000004"}]}
];

function openDB(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=e=>{
   const d=e.target.result;
   if(!d.objectStoreNames.contains(STORE_STUDENTS)) d.createObjectStore(STORE_STUDENTS,{keyPath:"id"});
   if(!d.objectStoreNames.contains(STORE_ATT)) d.createObjectStore(STORE_ATT,{keyPath:"key"});
   if(!d.objectStoreNames.contains(STORE_QUEUE)) d.createObjectStore(STORE_QUEUE,{keyPath:"id",autoIncrement:true});
  };
  r.onsuccess=()=>{db=r.result;resolve(db)}; r.onerror=()=>reject(r.error);
 });
}
function tx(store,mode="readonly"){return db.transaction(store,mode).objectStore(store)}
function put(store,obj){return new Promise((res,rej)=>{let r=tx(store,"readwrite").put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function get(store,key){return new Promise((res,rej)=>{let r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function all(store){return new Promise((res,rej)=>{let r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function today(){return new Date().toISOString().slice(0,10)}
function now(){return new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
function keyFor(id){return `${today()}_${id}`}
async function seed(){for(const s of demoStudents){if(!(await get(STORE_STUDENTS,s.id))) await put(STORE_STUDENTS,s)}}
function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");if(id==="home")refresh();if(id==="reports")renderReport()}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",2600)}
function online(){const b=document.getElementById("onlineBadge");b.textContent=navigator.onLine?"ONLINE":"OFFLINE";b.className="badge "+(navigator.onLine?"online":"offline")}
window.addEventListener("online",()=>{online();syncQueue()});window.addEventListener("offline",online);

async function refresh(){
 const students=await all(STORE_STUDENTS), at=await all(STORE_ATT), d=today();
 const todays=at.filter(x=>x.date===d);
 document.getElementById("totalStudents").textContent=students.length;
 document.getElementById("timeInCount").textContent=todays.filter(x=>x.timeIn).length;
 document.getElementById("inSchoolCount").textContent=todays.filter(x=>x.timeIn&&!x.timeOut).length;
 document.getElementById("pickedCount").textContent=todays.filter(x=>x.timeOut).length;
 document.getElementById("notInCount").textContent=students.length-todays.filter(x=>x.timeIn).length;
 document.getElementById("activity").innerHTML=todays.slice(-8).reverse().map(x=>`<div class="activity-row"><b>${x.studentName}</b> — ${x.timeOut?"PICKED UP":"IN SCHOOL"}<br><span class="muted">${x.timeIn||""} ${x.timeOut?"→ "+x.timeOut:""} ${x.pickupPerson?" • "+x.pickupPerson:""}</span></div>`).join("")||'<p class="muted">No activity yet.</p>';
}
async function handleScan(raw){
 stopScanner(); const id=String(raw||"").trim(); if(!id)return;
 const s=await get(STORE_STUDENTS,id);
 if(!s){document.getElementById("scanMessage").innerHTML='<div class="card warning">Student ID not found: '+escapeHtml(id)+'</div>';return}
 currentStudent=s; renderStudent(s); show("student");
}
function renderStudent(s){
 const rec=awaitRecord(s.id);
 rec.then(r=>{
  document.getElementById("studentCard").innerHTML=`<div class="student-head"><img class="avatar" src="logo.png"><div><h2>${escapeHtml(s.name)}</h2><div>${s.id} • ${s.grade} - ${s.section}</div></div></div>
  <hr><p><b>Parent/Guardian:</b> ${escapeHtml(s.parent)}</p>
  <p><b>Authorized pickup:</b> ${s.authorized.length} person(s)</p>
  <p><b>Status:</b> <span class="status ${r?.timeOut?"out":"in"}">${r?.timeIn?(r.timeOut?"PICKED UP":"IN SCHOOL"):"NOT CHECKED IN"}</span></p>
  ${r?.timeIn?`<p><b>Time In:</b> ${r.timeIn}</p>`:""}
  <div class="row">
   <button class="primary" onclick="timeIn()">TIME IN</button>
   <button class="secondary" onclick="openPickup()">PICKUP / TIME OUT</button>
  </div>`;
 });
}
async function awaitRecord(id){return await get(STORE_ATT,keyFor(id))}
async function timeIn(){
 if(!currentStudent)return; const k=keyFor(currentStudent.id), old=await get(STORE_ATT,k);
 if(old?.timeIn){toast("Already checked in at "+old.timeIn);return}
 const rec={key:k,date:today(),studentId:currentStudent.id,studentName:currentStudent.name,grade:currentStudent.grade,section:currentStudent.section,timeIn:now(),timeOut:"",pickupPerson:"",pickupRelationship:"",pickupPhone:"",pickupOption:"",staff:"Staff",notes:""};
 await put(STORE_ATT,rec); await queue(rec,"TIME_IN"); toast("TIME IN SUCCESSFUL"); renderStudent(currentStudent); refresh();
}
function openPickup(){
 if(!currentStudent)return;
 get(STORE_ATT,keyFor(currentStudent.id)).then(r=>{
  if(!r?.timeIn){toast("WARNING: Student has no TIME IN today.");return}
  if(r.timeOut){toast("Student already picked up at "+r.timeOut);return}
  selectedPickup=null;
  document.getElementById("pickupCard").innerHTML=`<h2>Pickup / Time Out</h2>
   <div class="student-head"><img class="avatar" src="logo.png"><div><b>${escapeHtml(currentStudent.name)}</b><br>${currentStudent.id} • ${currentStudent.grade} - ${currentStudent.section}</div></div>
   <p class="muted">Select the pickup option/person. If the person is unauthorized, use the <b>Option</b> menu below and request approval before releasing the student.</p>
   <label>Authorized Pickup Person</label>
   <div class="option-grid">${currentStudent.authorized.map((p,i)=>`<div class="option" onclick='selectAuth(${JSON.stringify(p)})'><b>${escapeHtml(p.name)}</b>${escapeHtml(p.relationship)} • ${escapeHtml(p.phone)}</div>`).join("")}</div>
   <label>Option</label>
   <select id="pickupOption" onchange="optionChanged()">
    <option value="">Select an option…</option>
    <option value="AUTHORIZED">Authorized pickup person</option>
    <option value="UNAUTHORIZED_APPROVAL">Unauthorized person — Request Admin Approval</option>
    <option value="EMERGENCY_APPROVAL">Emergency / Parent Phone Confirmation</option>
    <option value="OTHER_APPROVAL">Other — Admin Approval Required</option>
   </select>
   <div id="unauthorizedFields"></div>
   <div class="row" style="margin-top:14px"><button class="secondary" onclick="show('student')">Cancel</button><button class="primary" onclick="confirmPickup()">CONFIRM PICKUP</button></div>`;
  show("pickup");
 });
}
function selectAuth(p){selectedPickup={...p,option:"AUTHORIZED"};document.getElementById("pickupOption").value="AUTHORIZED";document.getElementById("unauthorizedFields").innerHTML="";toast(p.name+" selected")}
function optionChanged(){
 const v=document.getElementById("pickupOption").value;
 if(v==="AUTHORIZED") return;
 if(v){document.getElementById("unauthorizedFields").innerHTML=`<label>Pickup Person Full Name</label><input id="upName" placeholder="Full name">
 <label>Relationship</label><input id="upRel" placeholder="e.g. Aunt, Grandparent">
 <label>Contact Number</label><input id="upPhone" placeholder="Phone number">
 <label>Reason / Notes</label><textarea id="upReason" rows="3" placeholder="Explain why this person is picking up the student."></textarea>
 <div class="card warning"><b>⚠ ${v==="UNAUTHORIZED_APPROVAL"?"UNAUTHORIZED PICKUP":"APPROVAL REQUIRED"}</b><br>Do not release the student until an authorized staff member approves this request.</div>
 <label>Approving Staff (required before release)</label><input id="approver" placeholder="Admin / authorized staff name">`;
 }
}
async function confirmPickup(){
 const option=document.getElementById("pickupOption").value;
 if(!option){toast("Please select a pickup option.");return}
 let p=selectedPickup;
 if(option!=="AUTHORIZED"){
  const name=document.getElementById("upName")?.value.trim(), rel=document.getElementById("upRel")?.value.trim(), phone=document.getElementById("upPhone")?.value.trim(), reason=document.getElementById("upReason")?.value.trim(), approver=document.getElementById("approver")?.value.trim();
  if(!name||!approver){toast("Name and approving staff are required.");return}
  p={name,relationship:rel,phone,option,reason,approver};
 }
 if(!p){toast("Select an authorized person or option.");return}
 if(option!=="AUTHORIZED" && !confirm("Confirm ADMIN APPROVAL and release of this student?")) return;
 const k=keyFor(currentStudent.id), r=await get(STORE_ATT,k);
 if(!r||!r.timeIn){toast("No TIME IN record.");return}
 if(r.timeOut){toast("Already picked up.");return}
 r.timeOut=now();r.pickupPerson=p.name;r.pickupRelationship=p.relationship||"";r.pickupPhone=p.phone||"";r.pickupOption=option;r.notes=p.reason||"";r.approver=p.approver||"";
 await put(STORE_ATT,r);await queue(r,"PICKUP");toast("PICKUP SUCCESSFUL");show("home");refresh();
}
async function queue(record,action){await new Promise((res,rej)=>{let o=tx(STORE_QUEUE,"readwrite");let r=o.add({record,action,createdAt:new Date().toISOString()});r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function syncQueue(){
 if(!navigator.onLine)return;
 const q=await all(STORE_QUEUE); if(!q.length)return;
 // Set SYNC_URL in localStorage if you have deployed the backend.
 const url=localStorage.getItem("VISION_SYNC_URL");
 if(!url)return;
 for(const item of q){
  try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)});if(res.ok)await new Promise((resv,reje)=>{let o=tx(STORE_QUEUE,"readwrite");let r=o.delete(item.id);r.onsuccess=()=>resv();r.onerror=()=>reje(r.error)})}catch(e){break}
 }
}
async function exportCSV(){
 const rows=await all(STORE_ATT); const headers=["Date","Student ID","Student Name","Grade","Section","Time In","Time Out","Pickup Person","Relationship","Phone","Pickup Option","Staff","Approver","Notes"];
 const lines=[headers,...rows.map(r=>headers.map(h=>csv(r[map[h]]??"")))].map(a=>a.join(",")).join("\n");
 const blob=new Blob([lines],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="vision_school_attendance.csv";a.click();
}
const map={"Date":"date","Student ID":"studentId","Student Name":"studentName","Grade":"grade","Section":"section","Time In":"timeIn","Time Out":"timeOut","Pickup Person":"pickupPerson","Relationship":"pickupRelationship","Phone":"pickupPhone","Pickup Option":"pickupOption","Staff":"staff","Approver":"approver","Notes":"notes"};
function csv(v){return '"'+String(v).replaceAll('"','""')+'"'}
async function renderReport(){
 const rows=await all(STORE_ATT);document.getElementById("reportTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Time In</th><th>Time Out</th><th>Pickup</th><th>Option</th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr><td>${r.date}</td><td>${escapeHtml(r.studentName)}</td><td>${r.timeIn||"-"}</td><td>${r.timeOut||"-"}</td><td>${escapeHtml(r.pickupPerson||"-")}</td><td>${escapeHtml(r.pickupOption||"-")}</td></tr>`).join("")}</tbody></table></div>`;
}
async function clearDemo(){if(confirm("Reset local demo records?")){indexedDB.deleteDatabase(DB);location.reload()}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function startScanner(){
 if(!navigator.mediaDevices?.getUserMedia){toast("Camera is not available in this browser.");return}
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
  const v=document.getElementById("video");v.srcObject=stream;await v.play();scanLoop();
 }catch(e){toast("Camera permission was denied or unavailable. Use Manual Student ID.");}
}
function stopScanner(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
function scanLoop(){
 if(!stream)return;const v=document.getElementById("video"),c=document.getElementById("canvas");
 if(v.readyState>=2){
  c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext("2d");ctx.drawImage(v,0,0,c.width,c.height);
  if("BarcodeDetector" in window){new BarcodeDetector({formats:["qr_code"]}).detect(c).then(res=>{if(res.length)handleScan(res[0].rawValue);else requestAnimationFrame(scanLoop)}).catch(()=>requestAnimationFrame(scanLoop))}
  else {document.getElementById("scanMessage").innerHTML='<div class="card">This browser does not support built-in QR detection. Use Manual Student ID or add a bundled QR library.</div>';requestAnimationFrame(scanLoop)}
 }else requestAnimationFrame(scanLoop);
}
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
(async()=>{await openDB();await seed();online();refresh();syncQueue()})();
