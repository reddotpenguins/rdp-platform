import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAssessorSheetRows,
  formatInstructorNames,
  getAssessorSheetSummary,
  normalizeSessionLabel,
  normalizeStudentNameForDisplay,
  parseLevelFromClassText,
  parseSessionFromClassText
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
        id: "regular-0-aadi",
        sessionTime: "Sat 3:45PM - 4:30PM",
        studentName: "Aadi",
        instructorName: "Tyrone Peh",
        classType: "Regular",
        currentLevel: "Intermediate (Br4, Br5, Br6)",
        passFail: ""
      }
    ]);
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
        studentName: "First Student",
        instructorName: "",
        classType: "Regular",
        currentLevel: "Foundation",
        passFail: ""
      },
      {
        id: "2",
        sessionTime: "",
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
    assert.deepEqual(summary.sessions, ["Sun 1:00PM - 1:45PM"]);
  });

  it("normalizes source-specific names, sessions, and levels", () => {
    assert.equal(normalizeStudentNameForDisplay("Lai, Qi En"), "Qi En Lai");
    assert.equal(normalizeStudentNameForDisplay("Liu, Allison, Jia En"), "Allison Jia En Liu");
    assert.equal(normalizeStudentNameForDisplay("-, Aadi"), "Aadi");
    assert.equal(normalizeSessionLabel("Fri-4:45PM-5:30PM"), "Fri 4:45PM - 5:30PM");
    assert.equal(parseSessionFromClassText("SAAC Foundation - Sat: 11:00 - 11:45"), "Sat 11:00AM - 11:45AM");
    assert.equal(parseLevelFromClassText("SAAC @ Siglap Foundation (F1, F2, F3)"), "Foundation (F1, F2, F3)");
    assert.equal(formatInstructorNames("Lai, Joyce; Tan, Alex"), "Joyce Lai, Alex Tan");
  });
});
