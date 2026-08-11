import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type TrainingResourcesPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
  };
};

export default function TrainingResourcesPage({ searchParams }: TrainingResourcesPageProps) {
  const params = new URLSearchParams({ tab: "resources" });

  if (searchParams?.error) {
    params.set("error", searchParams.error);
  }

  if (searchParams?.message) {
    params.set("message", searchParams.message);
  }

  redirect(`/training?${params.toString()}`);
}
