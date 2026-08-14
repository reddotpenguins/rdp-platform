import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCurrentClassMappings } from "../lib/currentClassMapping.ts";

describe("current class mapping", () => {
  it("extracts student name, current level, and current session from the regular class list", () => {
    const mappings = parseCurrentClassMappings([
      {
        "Student Name": "-, Aadi",
        "Event Name": "ACS(BR) @ Bt Timah Intermediate (Br4, Br5, Br6) - Sat: 3:45 - 4:30"
      },
      {
        "Student Name": "Meghan Johnston",
        "Event Name": "Fundamental Squad, SAAC @ Siglap Mini Squad (Ba7, Ba8, Fl1, Fl2) - Sun: 2:00 - 3:00"
      }
    ]);

    assert.deepEqual(mappings, [
      {
        studentName: "Aadi",
        studentKey: "aadi",
        centreName: "ACS(BR)",
        session: "Sat 3:45PM - 4:30PM",
        level: "Intermediate (Br4, Br5, Br6)",
        eventName: "ACS(BR) @ Bt Timah Intermediate (Br4, Br5, Br6) - Sat: 3:45 - 4:30"
      },
      {
        studentName: "Meghan Johnston",
        studentKey: "meghan johnston",
        centreName: "SAAC",
        session: "Sun 2:00PM - 3:00PM",
        level: "Mini Squad (Ba7, Ba8, Fl1, Fl2)",
        eventName:
          "Fundamental Squad, SAAC @ Siglap Mini Squad (Ba7, Ba8, Fl1, Fl2) - Sun: 2:00 - 3:00"
      }
    ]);
  });

  it("keeps the first mapping when a student appears more than once", () => {
    const mappings = parseCurrentClassMappings([
      {
        "Student Name": "Noah Seow",
        "Event Name": "YMCA @ Orchard Intermediate (Br4, Br5, Br6) - Fri: 4:45 - 5:30"
      },
      {
        "Student Name": "Noah Seow",
        "Event Name": "YMCA @ Orchard Foundation (F1, F2, F3) - Fri: 5:30 - 6:15"
      }
    ]);

    assert.equal(mappings.length, 1);
    assert.equal(mappings[0].centreName, "YMCA");
    assert.equal(mappings[0].session, "Fri 4:45PM - 5:30PM");
    assert.equal(mappings[0].level, "Intermediate (Br4, Br5, Br6)");
  });
});
