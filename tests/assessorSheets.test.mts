import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAssessorSheetRows,
  formatInstructorNames,
  getAssessorSheetSummary,
  normalizeSessionLabel,
  normalizeStudentNameForDisplay,
  parseDayFromSessionLabel,
  parseLevelFromClassText,
  parseLocationFromClassText,
  parseSessionFromClassText,
  splitClassTextsFromEventName
} from "../lib/assessorSheets.ts";

describe("assessor sheet helpers", () => {
  it("maps regular students to their current class timing and coach", () => {
    const rows = buildAssessorSheetRows({
      assessmentRows: [
        {
          "Student Name": "Aadi",
          "Current Coach": "Tyrone Peh",
          Level: "Intermediate"
        }
      ],
      regularRows: [
        {
          "Student Name": "-, Aadi",
          "Event Name": "ACS(BR) @ Bt Timah Intermediate (Br4, Br5, Br6) - Sat: 3:45 - 4:30"
        }
      ],
        makeUpRows: []
      });

    assert.deepEqual(rows, [
      {
        id: "regular-0-0-aadi",
        sessionTime: "Sat 3:45PM - 4:30PM",
        sessionDay: "Sat",
        location: "ACS(BR) @ Bt Timah",
        studentName: "Aadi",
        instructorName: "Tyrone Peh",
        classType: "Regular",
        currentLevel: "Intermediate (Br4, Br5, Br6)",
        passFail: ""
      }
    ]);
  });

  it("uses the student's individual assessed level before the broad class band", () => {
    const rows = buildAssessorSheetRows({
      assessmentRows: [
        {
          "Student Name": "Bryan Xu",
          "Q2 Current Level": "Water Confidence 2",
          Level: "Toddler (WD1, WC2, WM3)"
        }
      ],
      regularRows: [
        {
          "Student Name": "Bryan Xu",
          "Event Name": "ACS(BR) @ Bt Timah Toddler (WD1, WC2, WM3) - Sat: 4:30 - 5:15"
        }
      ],
      makeUpRows: []
    });

    assert.equal(rows[0].currentLevel, "Water Confidence 2");
  });

  it("uses direct session columns when regular rows come from a mapped upload file", () => {
    const rows = buildAssessorSheetRows({
      assessmentRows: [],
      regularRows: [
        {
          "Student Name": "Aadi",
          "Current Coach": "Ci Hui Jiang",
          Centre: "ACS(BR)",
          Level: "Intermediate (Br4, Br5, Br6)",
          "Q2 Current Level": "Breaststroke 5",
          Session: "Sat 3:45PM - 4:30PM"
        }
      ],
      makeUpRows: []
    });

    assert.deepEqual(rows, [
      {
        id: "regular-0-0-aadi",
        sessionTime: "Sat 3:45PM - 4:30PM",
        sessionDay: "Sat",
        location: "ACS(BR)",
        studentName: "Aadi",
        instructorName: "Ci Hui Jiang",
        classType: "Regular",
        currentLevel: "Breaststroke 5",
        passFail: ""
      }
    ]);
  });

  it("splits regular students with multiple class events and assigns matching instructors", () => {
    const rows = buildAssessorSheetRows({
      assessmentRows: [],
      regularRows: [
        {
          "Student Name": "Mersey",
          "Event Name":
            "SAAC @ Siglap Intermediate (Br4, Br5, Br6) - Sat: 8:45 - 9:30, SAAC @ Siglap Intermediate (Br4, Br5, Br6) - Sat: 9:30 - 10:15",
          Instructors: "Khoo, Julia,Tan, Louis"
        }
      ],
      makeUpRows: []
    });

    assert.deepEqual(
      rows.map((row) => ({
        instructorName: row.instructorName,
        location: row.location,
        sessionTime: row.sessionTime,
        studentName: row.studentName
      })),
      [
        {
          instructorName: "Julia Khoo",
          location: "SAAC @ Siglap",
          sessionTime: "Sat 8:45AM - 9:30AM",
          studentName: "Mersey"
        },
        {
          instructorName: "Louis Tan",
          location: "SAAC @ Siglap",
          sessionTime: "Sat 9:30AM - 10:15AM",
          studentName: "Mersey"
        }
      ]
    );
  });

  it("sorts assessor rows by session day, AM or PM, and timing before location", () => {
    const rows = buildAssessorSheetRows({
      assessmentRows: [],
      regularRows: [
        {
          "Student Name": "Pm Student",
          "Event Name": "ACS(BR) @ Bt Timah Foundation (F1, F2, F3) - Sat: 3:00 - 3:45",
          Instructors: "Coach, Pm"
        },
        {
          "Student Name": "Early Student",
          "Event Name": "YMCA @ Orchard Foundation (F1, F2, F3) - Sat: 8:30 - 9:15",
          Instructors: "Coach, Early"
        },
        {
          "Student Name": "Late Student",
          "Event Name": "SAAC @ Siglap Foundation (F1, F2, F3) - Sat: 10:15 - 11:00",
          Instructors: "Coach, Late"
        }
      ],
      makeUpRows: []
    });

    assert.deepEqual(
      rows.map((row) => `${row.sessionTime} | ${row.location}`),
      [
        "Sat 8:30AM - 9:15AM | YMCA @ Orchard",
        "Sat 10:15AM - 11:00AM | SAAC @ Siglap",
        "Sat 3:00PM - 3:45PM | ACS(BR) @ Bt Timah"
      ]
    );
  });

  it("adds make-up students with instructor names and class schedule", () => {
    const rows = buildAssessorSheetRows({
      assessmentRows: [],
      regularRows: [],
      makeUpRows: [
        {
          Type: "MAKEUP",
          "Class Name": "YMCA @ Orchard Intermediate (Br4, Br5, Br6) - Fri: 4:45 - 5:30",
          "Class Schedule": "Fri-4:45PM-5:30PM",
          Student: "Noah Seow",
          Instructors: "Lai, Joyce"
        }
      ]
    });

    assert.equal(rows[0].sessionTime, "Fri 4:45PM - 5:30PM");
    assert.equal(rows[0].sessionDay, "Fri");
    assert.equal(rows[0].location, "YMCA @ Orchard");
    assert.equal(rows[0].studentName, "Noah Seow");
    assert.equal(rows[0].instructorName, "Joyce Lai");
    assert.equal(rows[0].classType, "Make Up");
    assert.equal(rows[0].currentLevel, "Intermediate (Br4, Br5, Br6)");
    assert.equal(rows[0].passFail, "");
  });

  it("summarises generated rows and missing mapping values", () => {
    const summary = getAssessorSheetSummary([
      {
        id: "1",
        sessionTime: "Sun 1:00PM - 1:45PM",
        sessionDay: "Sun",
        location: "SAAC @ Siglap",
        studentName: "First Student",
        instructorName: "",
        classType: "Regular",
        currentLevel: "Foundation",
        passFail: ""
      },
      {
        id: "2",
        sessionTime: "",
        sessionDay: "",
        location: "YMCA @ Orchard",
        studentName: "Second Student",
        instructorName: "Coach",
        classType: "Make Up",
        currentLevel: "Intermediate",
        passFail: ""
      }
    ]);

    assert.equal(summary.totalRows, 2);
    assert.equal(summary.regularRows, 1);
    assert.equal(summary.makeUpRows, 1);
    assert.equal(summary.missingInstructorRows, 1);
    assert.equal(summary.missingSessionRows, 1);
    assert.deepEqual(summary.days, ["Sun"]);
    assert.deepEqual(summary.locations, ["SAAC @ Siglap", "YMCA @ Orchard"]);
    assert.deepEqual(summary.sessions, ["Sun 1:00PM - 1:45PM"]);
  });

  it("normalizes source-specific names, sessions, and levels", () => {
    assert.equal(normalizeStudentNameForDisplay("Lai, Qi En"), "Qi En Lai");
    assert.equal(normalizeStudentNameForDisplay("Liu, Allison, Jia En"), "Allison Jia En Liu");
    assert.equal(normalizeStudentNameForDisplay("-, Aadi"), "Aadi");
    assert.equal(normalizeSessionLabel("Fri-4:45PM-5:30PM"), "Fri 4:45PM - 5:30PM");
    assert.equal(parseSessionFromClassText("SAAC Foundation - Sat: 11:00 - 11:45"), "Sat 11:00AM - 11:45AM");
    assert.equal(parseLevelFromClassText("SAAC @ Siglap Foundation (F1, F2, F3)"), "Foundation (F1, F2, F3)");
    assert.equal(parseLocationFromClassText("SAAC @ Siglap Foundation (F1, F2, F3) - Sat: 11:00 - 11:45"), "SAAC @ Siglap");
    assert.equal(
      parseLevelFromClassText("Fundamental Squad, SAAC @ Siglap Mini Squad (Ba7, Ba8) - Sun: 2:00 - 3:00"),
      "Mini Squad (Ba7, Ba8)"
    );
    assert.equal(
      parseLocationFromClassText("Fundamental Squad, SAAC @ Siglap Mini Squad (Ba7, Ba8) - Sun: 2:00 - 3:00"),
      "SAAC @ Siglap"
    );
    assert.equal(parseDayFromSessionLabel("Sun 4:00PM - 5:00PM"), "Sun");
    assert.equal(formatInstructorNames("Lai, Joyce; Tan, Alex"), "Joyce Lai, Alex Tan");
    assert.equal(formatInstructorNames("Jiang, Ci Hui"), "Ci Hui Jiang");
    assert.equal(formatInstructorNames("Lim, Samuel, Sen, Lionel,Tan, Louis"), "Samuel Lim, Lionel Sen, Louis Tan");
    assert.deepEqual(
      splitClassTextsFromEventName(
        "ACS(BR) @ Bt Timah Mini Squad (Ba7, Ba8, Fl1, Fl2) - Sat: 4:00 - 5:00, SJII @ Caldecott Mini Squad (Ba7, Ba8, Fl1, Fl2) - Sun: 9:00 - 10:00"
      ),
      [
        "ACS(BR) @ Bt Timah Mini Squad (Ba7, Ba8, Fl1, Fl2) - Sat: 4:00 - 5:00",
        "SJII @ Caldecott Mini Squad (Ba7, Ba8, Fl1, Fl2) - Sun: 9:00 - 10:00"
      ]
    );
  });
});
