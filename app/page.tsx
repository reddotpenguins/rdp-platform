import { AuthLinkHandler } from "@/components/AuthLinkHandler";

export default function HomePage() {
  return <AuthLinkHandler fallbackPath="/login" />;
}
