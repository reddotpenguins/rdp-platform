import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAssessmentRows } from "../lib/parseFile.ts";
import { recordsToAssessmentImportRows } from "../lib/supabase/assessmentImport.ts";

describe("assessment upload parsing", () => {
  it("uses exact Q2 current and Q3 assessed levels before broad class bands", () => {
    const records = parseAssessmentRows(
      [
        {
          "Student Name": "Nga Yin Ella Ching",
          "Current Coach": "Shao An Tan",
          Centre: "ACS(BR)",
          Level: "Foundation (F1, F2, F3)",
          Session: "Sat 3:00PM - 3:45PM",
          "Q2 Coach": "Shao An Tan",
          "Q2 Centre": "ACS(BR)",
          "Q2 Level": "Foundation (F1, F2, F3)",
          "Q2 Session": "Sat 3:00PM - 3:45PM",
          "Q2 Tested Level": "Freestyle 1",
          "Q2 Current Level": "Freestyle 2",
          "Q2 Result": "Fail",
          "Q3 Coach": "Tyrone Peh",
          "Q3 Centre": "ACS(BR)",
          "Q3 Level": "Foundation (F1, F2, F3)",
          "Q3 Session": "Sat 3:00PM - 3:45PM",
          "Q3 Assessed Level": "Freestyle 3",
          "Q3 Result": "Pass"
        }
      ],
      { defaultYear: "2026", sourceName: "RDP_LTS_2026_Upload_Ready_Current_Class.xlsx" }
    );

    assert.equal(records[0].quarterDetails?.Q2?.level, "Freestyle 2");
    assert.equal(records[0].quarterDetails?.Q3?.level, "Freestyle 3");
    assert.equal(records[0].level, "Freestyle 3");

    const importRows = recordsToAssessmentImportRows(records);
    assert.equal(importRows.find((row) => row.quarter === "Q2")?.level, "Freestyle 2");
    assert.equal(importRows.find((row) => row.quarter === "Q3")?.level, "Freestyle 3");
  });

  it("falls back from a broad Q3 class band to the latest exact Q2 current level", () => {
    const records = parseAssessmentRows(
      [
        {
          "Student Name": "Ho Yin Ethan Ching",
          "Current Coach": "Ci Hui Jiang",
          Centre: "ACS(BR)",
          Level: "Intermediate (Br4, Br5, Br6)",
          Session: "Sat 3:00PM - 3:45PM",
          "Q2 Coach": "Ci Hui Jiang",
          "Q2 Centre": "ACS(BR)",
          "Q2 Level": "Intermediate (Br4, Br5, Br6)",
          "Q2 Session": "Sat 3:00PM - 3:45PM",
          "Q2 Tested Level": "Breaststroke 4",
          "Q2 Current Level": "Breaststroke 5",
          "Q2 Result": "Pass",
          "Q3 Centre": "ACS(BR)",
          "Q3 Level": "Intermediate (Br4, Br5, Br6)",
          "Q3 Session": "Sat 3:00PM - 3:45PM"
        }
      ],
      { defaultYear: "2026", sourceName: "RDP_LTS_2026_Upload_Ready_Current_Class.xlsx" }
    );

    assert.equal(records[0].quarterDetails?.Q3?.level, "Breaststroke 5");
    assert.equal(records[0].level, "Breaststroke 5");
  });
});
