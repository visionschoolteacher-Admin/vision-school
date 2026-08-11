// server.js — integration scaffold only.
// Production should use Microsoft identity authentication and Microsoft Graph.
// Do NOT put Microsoft client secrets in app.js or any browser file.
//
// Expected POST body:
// {
//   "record": { ...attendance fields... },
//   "action": "TIME_IN" | "PICKUP"
// }
//
// This example intentionally does not hard-code credentials.
// See README.md for the Microsoft Graph Excel requirements.

const express = require("express");
const app = express();
app.use(express.json());

app.post("/api/sync", async (req,res)=>{
  try {
    // TODO:
    // 1. Authenticate the staff account with Microsoft identity platform.
    // 2. Obtain an access token with the required Files.ReadWrite permission.
    // 3. Call Microsoft Graph to add the record to an Excel table.
    // 4. Return 200 only after Excel confirms the row was written.
    console.log("SYNC REQUEST", req.body);
    res.json({ok:true, message:"Backend scaffold received the record. Connect Microsoft Graph here."});
  } catch (err) {
    console.error(err);
    res.status(500).json({ok:false,error:"Sync failed"});
  }
});

app.listen(process.env.PORT||3000,()=>console.log("Server listening"));
