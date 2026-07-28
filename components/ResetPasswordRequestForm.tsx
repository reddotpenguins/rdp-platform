"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim();

    if (!submittedEmail) {
      setError("Enter your email address.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/auth/set-password`
    });

    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message || "Unable to send reset email.");
      return;
    }

    setSentTo(submittedEmail);
  }

  if (sentTo) {
    return (
      <div className="mt-6 rounded-sm border border-[#fdba74] bg-[#fffaf5] p-4 text-sm leading-6 text-[#7c2d12]">
        <p className="font-semibold text-[#3d2115]">Check your email</p>
        <p className="mt-1">
          If an account exists for {sentTo}, Supabase will send a password reset link.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-sm bg-[#ef562d] px-4 text-sm font-semibold text-white transition hover:bg-[#d9481f]"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
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
            name="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            className="h-11 w-full rounded-sm border border-[#fdba74] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#3d2115] outline-none transition placeholder:text-[#b9825c] focus:border-[#f97316] focus:bg-paper focus:ring-2 focus:ring-[#f97316]/15"
            autoComplete="email"
            placeholder="team@reddotpenguins.com"
            disabled={isSubmitting}
            required
          />
        </span>
      </label>

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
        disabled={isSubmitting}
        className="inline-flex h-11 items-center justify-center rounded-sm bg-[#ef562d] px-4 text-sm font-semibold text-white transition hover:bg-[#d9481f] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Sending..." : "Send reset link"}
      </button>

      <Link
        href="/login"
        className="self-start text-sm font-medium text-[#c2410c] transition hover:text-[#9a3412] hover:underline"
      >
        Back to login
      </Link>
    </form>
  );
}
