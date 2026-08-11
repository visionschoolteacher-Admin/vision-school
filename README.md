# Vision School QR Attendance & Pickup — Offline-First Starter

This is a working front-end prototype for Vision School.

## What is included
- School logo supplied by the user
- Mobile-friendly PWA layout
- Dashboard
- QR camera screen
- Manual Student ID fallback for testing
- TIME IN
- PICKUP / TIME OUT
- Authorized pickup list
- **Option menu for unauthorized pickup**
- Admin approval fields for unauthorized/emergency/other pickup
- Duplicate TIME IN/TIME OUT protection
- IndexedDB local storage
- Offline app shell via Service Worker
- CSV export that opens in Microsoft Excel
- Queue for later cloud synchronization

## Demo students
STU001, STU002, STU003 are preloaded.

## Test
1. Serve this folder through HTTPS or localhost. Camera access normally requires a secure context.
2. Open the app.
3. Use Manual Student ID `STU001`.
4. Press TIME IN.
5. Open PICKUP / TIME OUT.
6. Select an authorized person, OR choose an option such as:
   - Unauthorized person — Request Admin Approval
   - Emergency / Parent Phone Confirmation
   - Other — Admin Approval Required
7. For unauthorized pickup, the system requires the pickup person's name and approving staff before release.

## Offline
The app stores attendance/pickup records in IndexedDB on the device. It can continue recording after the app has been loaded and cached. When internet returns, records remain queued.

## Microsoft Excel
The browser should NOT contain Microsoft client secrets or passwords.

The included `server.js` is a small integration scaffold. A production implementation should authenticate staff with Microsoft identity and use Microsoft Graph to write rows to an Excel workbook stored in OneDrive for Business or SharePoint.

Microsoft Graph supports reading and modifying Excel workbooks and table rows in supported OneDrive for Business/SharePoint storage:
https://learn.microsoft.com/en-us/graph/api/resources-excel?view=graph-rest-1.0

To use the queue:
- Deploy a secure backend.
- Make its POST endpoint accept `{record, action}`.
- Put the endpoint in the browser's local storage:
  `localStorage.setItem("VISION_SYNC_URL","https://your-domain.example/api/sync")`
- The PWA will POST queued records when online.

## Important production notes
- Add real staff authentication.
- Do not keep student data only in local storage for a multi-phone production deployment.
- Decide how conflict resolution works if two phones record the same student offline.
- Cache an authorized-pickup snapshot on each staff device and show an explicit OFFLINE warning.
- For unauthorized pickup, require an authorized staff approval and audit log.
- Protect student information and follow the school's privacy/data-protection requirements.
- The current QR camera uses the browser's BarcodeDetector API when available. For broad device support, bundle a QR decoder such as jsQR locally rather than depending on a CDN, so scanning also works without internet.
