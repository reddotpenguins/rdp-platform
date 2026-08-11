import { createClient } from "@/lib/supabase/server";
import {
  isTrainingResourceProgramme,
  isTrainingResourceStatus,
  type TrainingResource
} from "@/lib/trainingResources";

type TrainingResourceRow = {
  assessment_criteria: string | null;
  common_mistakes: string | null;
  created_at: string;
  description: string | null;
  id: string;
  level_label: string | null;
  programme: string;
  skill_type: string | null;
  sort_order: number | null;
  status: string;
  teaching_cues: string | null;
  title: string;
  updated_at: string;
  video_url: string | null;
};

export type TrainingResourcesResult = {
  error?: string;
  resources: TrainingResource[];
};

export const trainingResourceColumns = [
  "id",
  "title",
  "programme",
  "level_label",
  "skill_type",
  "video_url",
  "description",
  "teaching_cues",
  "common_mistakes",
  "assessment_criteria",
  "status",
  "sort_order",
  "created_at",
  "updated_at"
].join(", ");

export async function getTrainingResources(canManage: boolean): Promise<TrainingResourcesResult> {
  const supabase = createClient();
  let query = supabase
    .from("training_resources")
    .select(trainingResourceColumns)
    .order("programme", { ascending: true })
    .order("level_label", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (!canManage) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    return {
      error: error.message.includes("training_resources")
        ? "Run the training resources SQL in Supabase before using this page."
        : error.message,
      resources: []
    };
  }

  return {
    resources: ((data ?? []) as unknown as TrainingResourceRow[]).map(mapTrainingResource)
  };
}

export function mapTrainingResource(row: TrainingResourceRow): TrainingResource {
  const programme = isTrainingResourceProgramme(row.programme) ? row.programme : "Learn to Swim";
  const status = isTrainingResourceStatus(row.status) ? row.status : "draft";

  return {
    assessmentCriteria: row.assessment_criteria,
    commonMistakes: row.common_mistakes,
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    levelLabel: row.level_label,
    programme,
    skillType: row.skill_type,
    sortOrder: row.sort_order ?? 100,
    status,
    teachingCues: row.teaching_cues,
    title: row.title,
    updatedAt: row.updated_at,
    videoUrl: row.video_url
  };
}
