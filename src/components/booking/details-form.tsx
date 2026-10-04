"use client";

import { useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Dumbbell,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export interface DetailsValues {
  fullName: string;
  email: string;
  phone: string;
  paddleQty: number;
  paddleHours: number | null; // always null — duration equals booked court hours
  ball: boolean;
}

function makeDetailsSchema(_maxHours: number) {
  return z.object({
    fullName: z.string().trim().min(1, "Enter your full name.").max(100),
    email: z.string().trim().email("Enter a valid email address.").max(254),
    phone: z.string().trim().min(1, "Enter a contact number.").max(30),
    paddleQty: z.coerce
      .number()
      .int("Paddle count must be whole.")
      .min(0, "Paddle count can't be negative.")
      .max(50, "Max 50 paddles per booking."),
    ball: z.boolean(),
  });
}

export default function DetailsForm({
  maxHours,
  defaultValues,
  busy,
  onBack,
  onSubmit,
}: {
  maxHours: number;
  defaultValues?: Partial<DetailsValues>;
  busy: boolean;
  onBack: () => void;
  onSubmit: (values: DetailsValues) => void;
}) {
  const schema = useMemo(() => makeDetailsSchema(maxHours), [maxHours]);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(schema) as unknown as Resolver<DetailsValues>,
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      paddleQty: defaultValues?.paddleQty ?? 0,
      ball: defaultValues?.ball ?? false,
    },
  });

  const paddleQty = form.watch("paddleQty") || 0;
  const ball = form.watch("ball");

  return (
    <form
      onSubmit={form.handleSubmit((v) =>
        onSubmit({
          fullName: v.fullName,
          email: v.email,
          phone: v.phone,
          paddleQty: v.paddleQty,
          paddleHours: null, // duration equals booked court hours; set server-side
          ball: v.ball,
        }),
      )}
      className="space-y-6"
    >
      {/* Player Information Card */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-line-warm/40 pb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              Player Information
            </h2>
            <p className="mt-1 text-xs text-warm-muted sm:text-sm">
              Your booking confirmation and QR pass will be sent to this email.
            </p>
          </div>
          <div className="hidden size-10 items-center justify-center rounded-2xl bg-oat text-pine sm:flex">
            <User className="size-5" />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Full Name */}
          <div className="space-y-2">
            <label htmlFor="fullName" className="flex items-center gap-1.5 text-xs font-bold text-pine">
              <User className="size-3.5 text-flame" />
              <span>Full Name</span>
              <span className="text-error">*</span>
            </label>
            <input
              id="fullName"
              autoComplete="name"
              placeholder="e.g. Juan dela Cruz"
              {...form.register("fullName")}
              className={cn(
                "h-12 w-full rounded-xl border bg-cream/30 px-4 text-sm font-medium text-ink transition-all placeholder:text-warm-muted/60 focus:bg-white focus:outline-none",
                form.formState.errors.fullName
                  ? "border-error focus:border-error focus:ring-1 focus:ring-error"
                  : "border-line-warm focus:border-flame focus:ring-2 focus:ring-flame/15",
              )}
            />
            {form.formState.errors.fullName && (
              <p role="alert" className="flex items-center gap-1 text-xs font-semibold text-error">
                <CircleAlert className="size-3.5" />
                <span>{form.formState.errors.fullName.message}</span>
              </p>
            )}
          </div>

          {/* Contact Number */}
          <div className="space-y-2">
            <label htmlFor="phone" className="flex items-center gap-1.5 text-xs font-bold text-pine">
              <Phone className="size-3.5 text-flame" />
              <span>Contact Number</span>
              <span className="text-error">*</span>
            </label>
            <input
              id="phone"
              autoComplete="tel"
              placeholder="e.g. 0917 123 4567"
              {...form.register("phone")}
              className={cn(
                "h-12 w-full rounded-xl border bg-cream/30 px-4 text-sm font-medium text-ink transition-all placeholder:text-warm-muted/60 focus:bg-white focus:outline-none",
                form.formState.errors.phone
                  ? "border-error focus:border-error focus:ring-1 focus:ring-error"
                  : "border-line-warm focus:border-flame focus:ring-2 focus:ring-flame/15",
              )}
            />
            {form.formState.errors.phone && (
              <p role="alert" className="flex items-center gap-1 text-xs font-semibold text-error">
                <CircleAlert className="size-3.5" />
                <span>{form.formState.errors.phone.message}</span>
              </p>
            )}
          </div>

          {/* Email Address */}
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="email" className="flex items-center gap-1.5 text-xs font-bold text-pine">
              <Mail className="size-3.5 text-flame" />
              <span>Email Address</span>
              <span className="text-error">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="juan@example.com"
              {...form.register("email")}
              className={cn(
                "h-12 w-full rounded-xl border bg-cream/30 px-4 text-sm font-medium text-ink transition-all placeholder:text-warm-muted/60 focus:bg-white focus:outline-none",
                form.formState.errors.email
                  ? "border-error focus:border-error focus:ring-1 focus:ring-error"
                  : "border-line-warm focus:border-flame focus:ring-2 focus:ring-flame/15",
              )}
            />
            {form.formState.errors.email ? (
              <p role="alert" className="flex items-center gap-1 text-xs font-semibold text-error">
                <CircleAlert className="size-3.5" />
                <span>{form.formState.errors.email.message}</span>
              </p>
            ) : (
              <p className="text-[11px] text-warm-muted">
                We&apos;ll send your instant booking confirmation &amp; QR pass to this email.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Equipment Rentals Card */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-line-warm/40 pb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              Equipment Rentals (Optional)
            </h2>
            <p className="mt-1 text-xs text-warm-muted sm:text-sm">
              Need paddles or extra balls? Add them to your reservation here.
            </p>
          </div>
          <div className="hidden size-10 items-center justify-center rounded-2xl bg-oat text-pine sm:flex">
            <Dumbbell className="size-5" />
          </div>
        </div>

        <div className="space-y-6">
          {/* Paddle Rentals */}
          <div className="rounded-2xl border border-line-warm/60 bg-cream/40 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-bold text-ink">Paddle Rentals</span>
                <span className="block text-xs text-warm-muted">
                  ₱25 per paddle per hour · High-grade carbon fiber paddles
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => form.setValue("paddleQty", Math.max(0, paddleQty - 1))}
                  disabled={paddleQty <= 0}
                  className="flex size-10 items-center justify-center rounded-xl border border-line-warm bg-white text-base font-bold text-ink transition-all hover:bg-cream disabled:opacity-40"
                  aria-label="Decrease paddles"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-base font-extrabold text-ink">
                  {paddleQty}
                </span>
                <button
                  type="button"
                  onClick={() => form.setValue("paddleQty", Math.min(50, paddleQty + 1))}
                  disabled={paddleQty >= 50}
                  className="flex size-10 items-center justify-center rounded-xl border border-line-warm bg-white text-base font-bold text-ink transition-all hover:bg-cream disabled:opacity-40"
                  aria-label="Increase paddles"
                >
                  +
                </button>
              </div>
            </div>


          </div>

          {/* Ball Rental Card */}
          <label
            htmlFor="ball"
            className={cn(
              "flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 sm:p-5 transition-all select-none",
              ball
                ? "border-flame bg-flame-light/30 shadow-xs"
                : "border-line-warm/60 bg-cream/40 hover:bg-cream/70",
            )}
          >
            <input
              id="ball"
              type="checkbox"
              {...form.register("ball")}
              className="mt-0.5 size-5 rounded-md border-line-warm accent-flame"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">Add Pickleball Ball Set</span>
                <span className="rounded-full bg-flame/10 px-2.5 py-0.5 text-xs font-extrabold text-flame">
                  +₱15 flat
                </span>
              </div>
              <p className="mt-1 text-xs text-warm-muted">
                One-time fee per booking. Official tournament-grade outdoor pickleball balls.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-line-warm/70 bg-white px-5 text-sm font-bold text-pine transition-all hover:bg-cream active:scale-[0.99] disabled:opacity-50"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Slots</span>
        </button>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-7 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:opacity-50"
        >
            {busy ? (
              <><LoadingAnimation size="compact" label="Preparing payment" /> <span>Preparing payment…</span></>
            ) : (
              <><span>Continue to Payment</span><ArrowRight className="size-4" /></>
            )}
        </button>
      </div>
    </form>
  );
}
