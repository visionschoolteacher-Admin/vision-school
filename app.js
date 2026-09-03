/*
 Vision School — ATTENDANCE + EXCEL REPORT ONLY
 This patch does not modify Dashboard, Students, QR, Pickup, Supabase,
 navigation, or existing application functions.
 It only restores the HTML containers required by the existing
 renderAttendance() and exportAttendanceReport() functions.
*/

(function () {
    "use strict";

    function addAttendanceAndReports() {
        const main = document.querySelector(".main-content");
        if (!main) {
            console.warn("[Vision School] Attendance/Reports patch: .main-content not found.");
            return;
        }

        /* ---------------------------------------------------------
           ATTENDANCE — add only if the existing container is missing
        --------------------------------------------------------- */
        if (!document.getElementById("attendance")) {
            const attendance = document.createElement("section");
            attendance.id = "attendance";
            attendance.className = "page-section";
            attendance.innerHTML = `
                <div class="section-card">
                    <div class="section-card-header">
                        <div>
                            <h3>Today's Attendance</h3>
                            <p>Student attendance and pickup information.</p>
                        </div>
                        <button type="button" id="refreshAttendance" class="secondary-button">
                            ↻ Refresh
                        </button>
                    </div>

                    <div class="filters">
                        <input
                            type="search"
                            id="attendanceSearch"
                            placeholder="Search attendance, student or pickup person..."
                        >
                    </div>

                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Level</th>
                                    <th>Time In</th>
                                    <th>Time Out</th>
                                    <th>Pickup Person</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="attendanceBody">
                                <tr>
                                    <td colspan="6" class="empty-state">
                                        Loading attendance...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            main.appendChild(attendance);
            console.log("[Vision School] Attendance container restored.");
        }

        /* ---------------------------------------------------------
           REPORTS — add only if the existing container is missing
        --------------------------------------------------------- */
        if (!document.getElementById("reports")) {
            const reports = document.createElement("section");
            reports.id = "reports";
            reports.className = "page-section";
            reports.innerHTML = `
                <div class="section-card">
                    <div class="section-card-header">
                        <div>
                            <h3>Attendance Reports</h3>
                            <p>Choose a reporting period and export attendance to Excel.</p>
                        </div>

                        <button
                            type="button"
                            id="exportCsv"
                            class="primary-button"
                        >
                            📥 Export Excel
                        </button>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="reportPeriod">Reporting Period</label>
                            <select id="reportPeriod">
                                <option value="today">Today</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="semester1">1st Semester (August - December)</option>
                                <option value="semester2">2nd Semester (January - May)</option>
                                <option value="custom">Custom Date Range</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="reportReferenceDate">Reference Date</label>
                            <input type="date" id="reportReferenceDate">
                        </div>

                        <div class="form-group" id="reportStartGroup">
                            <label for="reportStartDate">Start Date</label>
                            <input type="date" id="reportStartDate">
                        </div>

                        <div class="form-group" id="reportEndGroup">
                            <label for="reportEndDate">End Date</label>
                            <input type="date" id="reportEndDate">
                        </div>
                    </div>

                    <div class="report-info" style="margin-top:18px;">
                        <div class="report-icon">📊</div>
                        <div>
                            <h3>Excel Attendance Report</h3>
                            <p>
                                The export includes Date, Student ID, Student Name,
                                Level, Time In, Time Out, Pickup Person, Pickup
                                Relationship, Pickup Phone, Pickup Option, Approver,
                                and Notes.
                            </p>
                        </div>
                    </div>
                </div>
            `;

            main.appendChild(reports);
            console.log("[Vision School] Reports container restored.");
        }

        /* Re-bind only the Attendance/Reports controls after they exist. */
        try {
            if (typeof initializeSearch === "function") {
                initializeSearch();
            }
        } catch (error) {
            console.error("[Vision School] Attendance control initialization error:", error);
        }

        try {
            if (typeof initializeReports === "function") {
                initializeReports();
            }
        } catch (error) {
            console.error("[Vision School] Report control initialization error:", error);
        }

        try {
            if (typeof renderAttendance === "function") {
                renderAttendance();
            }
        } catch (error) {
            console.error("[Vision School] Attendance render error:", error);
        }

        console.log("[Vision School] Attendance + Excel Report patch completed.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", addAttendanceAndReports, { once: true });
    } else {
        addAttendanceAndReports();
    }
})();
