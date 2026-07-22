"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import {
  getPrototypeDisplayName,
  prototypeAuthStorageKey,
  type PrototypeAuthSession
} from "@/lib/prototypeAuth";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password.trim()) {
      setError("Enter both email and password.");
      return;
    }

    const session: PrototypeAuthSession = {
      email: trimmedEmail,
      name: getPrototypeDisplayName(trimmedEmail),
      signedInAt: new Date().toISOString()
    };

    window.localStorage.setItem(prototypeAuthStorageKey, JSON.stringify(session));
    router.push("/dashboard");
  }

  return (
    <form action="/dashboard" onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase text-[#7c2d12]">
          Email <span className="text-[#f23f42]">*</span>
        </span>
        <span className="relative block">
          <Mail
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#c2410c]"
          />
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            className="h-11 w-full rounded-sm border border-[#fdba74] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#3d2115] outline-none transition placeholder:text-[#b9825c] focus:border-[#f97316] focus:bg-paper focus:ring-2 focus:ring-[#f97316]/15"
            autoComplete="email"
            placeholder="team@reddotpenguins.com"
            required
          />
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase text-[#7c2d12]">
          Password <span className="text-[#f23f42]">*</span>
        </span>
        <span className="relative block">
          <LockKeyhole
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#c2410c]"
          />
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
            className="h-11 w-full rounded-sm border border-[#fdba74] bg-[#fffaf5] pl-10 pr-11 text-sm text-[#3d2115] outline-none transition focus:border-[#f97316] focus:bg-paper focus:ring-2 focus:ring-[#f97316]/15"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-sm text-[#c2410c] transition hover:bg-[#ffedd5] hover:text-[#7c2d12]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </span>
      </label>

      <button
        type="button"
        className="-mt-3 self-start text-sm font-medium text-[#c2410c] transition hover:text-[#9a3412] hover:underline"
      >
        Forgot your password?
      </button>

      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-[#fb923c]/40 bg-[#fff1e6] px-3 py-2 text-sm text-[#c2410c]"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-sm bg-[#ef562d] px-4 text-sm font-semibold text-white transition hover:bg-[#d9481f] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30"
      >
        Log in
      </button>

      <p className="text-sm text-[#8a5a3c]">
        Need access?{" "}
        <span className="font-medium text-[#c2410c]">Contact the RDP admin team.</span>
      </p>
    </form>
  );
}
