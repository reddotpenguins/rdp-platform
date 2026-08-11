export const trainingResourceProgrammes = [
  "Learn to Swim",
  "Race Team",
  "Baby Class",
  "Social Swim Club"
] as const;

export const trainingResourceStatuses = ["draft", "published", "archived"] as const;

export type TrainingResourceProgramme = (typeof trainingResourceProgrammes)[number];
export type TrainingResourceStatus = (typeof trainingResourceStatuses)[number];

export type TrainingResource = {
  assessmentCriteria: string | null;
  commonMistakes: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  levelLabel: string | null;
  programme: TrainingResourceProgramme;
  skillType: string | null;
  sortOrder: number;
  status: TrainingResourceStatus;
  teachingCues: string | null;
  title: string;
  updatedAt: string;
  videoUrl: string | null;
};

export function isTrainingResourceProgramme(value: string): value is TrainingResourceProgramme {
  return trainingResourceProgrammes.includes(value as TrainingResourceProgramme);
}

export function isTrainingResourceStatus(value: string): value is TrainingResourceStatus {
  return trainingResourceStatuses.includes(value as TrainingResourceStatus);
}

export function getTrainingResourceVideoEmbedUrl(videoUrl: string | null) {
  if (!videoUrl) {
    return null;
  }

  try {
    const url = new URL(videoUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = url.searchParams.get("v") || url.pathname.match(/\/shorts\/([^/]+)/)?.[1];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (host === "vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }

    if (host === "drive.google.com") {
      const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
      return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function splitTrainingResourceText(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
