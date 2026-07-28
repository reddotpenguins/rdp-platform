"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const submittedPassword = String(formData.get("password") ?? "");
    const submittedConfirmPassword = String(formData.get("confirmPassword") ?? "");

    if (submittedPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (submittedPassword !== submittedConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: submittedPassword
    });

    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message || "Unable to update password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      <PasswordField
        label="New password"
        name="password"
        value={password}
        showPassword={showPassword}
        disabled={isSubmitting}
        onChange={(value) => {
          setPassword(value);
          setError("");
        }}
      />
      <PasswordField
        label="Confirm password"
        name="confirmPassword"
        value={confirmPassword}
        showPassword={showPassword}
        disabled={isSubmitting}
        onChange={(value) => {
          setConfirmPassword(value);
          setError("");
        }}
      />

      <button
        type="button"
        onClick={() => setShowPassword((current) => !current)}
        className="-mt-3 inline-flex h-9 items-center gap-2 self-start rounded-sm px-2 text-sm font-medium text-[#c2410c] transition hover:bg-[#ffedd5] hover:text-[#9a3412]"
      >
        {showPassword ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
        {showPassword ? "Hide password" : "Show password"}
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
        disabled={isSubmitting}
        className="inline-flex h-11 items-center justify-center rounded-sm bg-[#ef562d] px-4 text-sm font-semibold text-white transition hover:bg-[#d9481f] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}

function PasswordField({
  label,
  name,
  value,
  showPassword,
  disabled,
  onChange
}: {
  label: string;
  name: string;
  value: string;
  showPassword: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase text-[#7c2d12]">
        {label} <span className="text-[#f23f42]">*</span>
      </span>
      <span className="relative block">
        <LockKeyhole
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#c2410c]"
        />
        <input
          name={name}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-sm border border-[#fdba74] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#3d2115] outline-none transition focus:border-[#f97316] focus:bg-paper focus:ring-2 focus:ring-[#f97316]/15"
          autoComplete="new-password"
          disabled={disabled}
          required
        />
      </span>
    </label>
  );
}
