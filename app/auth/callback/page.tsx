import type { Metadata } from "next";
import { AuthLinkHandler } from "@/components/AuthLinkHandler";

export const metadata: Metadata = {
  title: "Signing in | RDP LTS Assessment Dashboard"
};

export default function AuthCallbackPage() {
  return <AuthLinkHandler fallbackPath="/login" />;
}
