export const prototypeAuthStorageKey = "rdp-lts-prototype-session";

export type PrototypeAuthSession = {
  email: string;
  name: string;
  signedInAt: string;
};

export function getPrototypeDisplayName(email: string) {
  const localPart = email.split("@")[0]?.trim();

  if (!localPart) {
    return "RDP user";
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
