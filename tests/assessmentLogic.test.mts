import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBestAvailableLevel, getFilterOptions, getQuarterLevel } from "../lib/assessmentLogic.ts";
import type { StudentAssessmentRecord } from "../types/assessment.ts";

describe("assessment filter options", () => {
  it("keeps all centre options available when a quarter is selected", () => {
    const records: StudentAssessmentRecord[] = [
      buildRecord({
        id: "student-1",
        studentName: "ACS Student",
        centre: "ACS(BR)",
        quarterDetails: {
          Q3: {
            centre: "ACS(BR)",
            coachName: "Coach A",
            level: "Foundation",
            result: "Pass",
            session: "Sat 3:45PM - 4:30PM"
          }
        }
      }),
      buildRecord({
        id: "student-2",
        studentName: "SAAC Student",
        centre: "SAAC",
        quarterDetails: {
          Q3: {
            centre: "SAAC",
            coachName: "Coach B",
            level: "Foundation",
            result: "Fail",
            session: "Sun 9:30AM - 10:15AM"
          }
        }
      }),
      buildRecord({
        id: "student-3",
        studentName: "SJII Student",
        centre: "SJII",
        quarterDetails: {
          Q2: {
            centre: "SJII",
            coachName: "Coach C",
            level: "Intermediate",
            result: "Pass",
            session: "Sat 4:30PM - 5:15PM"
          }
        }
      }),
      buildRecord({
        id: "student-4",
        studentName: "YMCA Student",
        centre: "YMCA",
        quarterDetails: {
          Q2: {
            centre: "YMCA",
            coachName: "Coach D",
            level: "Intermediate",
            result: "Pass",
            session: "Fri 4:45PM - 5:30PM"
          }
        }
      })
    ];

    assert.deepEqual(getFilterOptions(records, "Q3").centres, [
      "ACS(BR)",
      "SAAC",
      "SJII",
      "YMCA"
    ]);
  });

  it("prefers exact quarter levels over broad class bands for current display", () => {
    const record = buildRecord({
      id: "student-1",
      studentName: "Aaron Tranter",
      level: "Squad",
      quarterDetails: {
        Q2: {
          centre: "ACS(BR)",
          coachName: "Taro Saito",
          level: "Backstroke 7",
          result: "",
          session: "Sat 3:00PM - 4:00PM"
        },
        Q3: {
          centre: "ACS(BR)",
          coachName: "Taro Saito",
          level: "Squad",
          result: "",
          session: "Sat 3:00PM - 4:00PM"
        }
      }
    });

    assert.equal(getQuarterLevel(record, "Q3"), "Backstroke 7");
    assert.equal(getBestAvailableLevel(record), "Backstroke 7");
    assert.deepEqual(getFilterOptions([record], "All").levels, ["Backstroke 7"]);
  });
});

function buildRecord(overrides: Partial<StudentAssessmentRecord>): StudentAssessmentRecord {
  return {
    actionRequired: "No immediate concern",
    coachName: "Coach",
    flagStatus: "None",
    id: "student",
    interventionRequired: false,
    q1Result: "",
    q2Result: "",
    studentName: "Student",
    ...overrides
  };
}
