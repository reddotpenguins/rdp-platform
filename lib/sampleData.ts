import { promises as fs } from "fs";
import path from "path";
import { parseCsvText } from "@/lib/parseFile";

export const defaultDatasetName = "RDP_LTS_2026_Q1_Q2_Cleaned_Combined.csv";
const demoDatasetName = "demo-lts-assessments.csv";

export async function getDefaultAssessmentRecords() {
  const defaultFilePath = path.join(process.cwd(), "data", defaultDatasetName);
  const demoFilePath = path.join(process.cwd(), "data", demoDatasetName);
  const filePath = await fs
    .access(defaultFilePath)
    .then(() => defaultFilePath)
    .catch(() => demoFilePath);
  const csvText = await fs.readFile(filePath, "utf8");

  return parseCsvText(csvText, {
    defaultYear: "2026",
    sourceName: path.basename(filePath)
  });
}
