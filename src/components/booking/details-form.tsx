"use client";

import { useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DetailsValues {
  fullName: string;
  email: string;
  phone: string;
  paddleQty: number;
  paddleHours: number | null;
  ball: boolean;
}

function makeDetailsSchema(maxHours: number) {
  return z
    .object({
      fullName: z.string().trim().min(1, "Enter your full name.").max(100),
      email: z.string().trim().email("Enter a valid email address.").max(254),
      phone: z.string().trim().min(1, "Enter a contact number.").max(30),
      paddleQty: z.coerce
        .number()
        .int("Paddle count must be whole.")
        .min(0, "Paddle count can't be negative.")
        .max(50, "Max 50 paddles per booking."),
      paddleHours: z.coerce
        .number()
        .min(0, "Paddle hours can't be negative.")
        .max(12, "Paddle hours can't exceed 12.")
        .nullish(),
      ball: z.boolean(),
    })
    .superRefine((v, ctx) => {
      // Client guard mirroring the server cross-check in recalculateTotal:
      // paddle hours are capped at the booked slot count.
      if (v.paddleQty > 0 && v.paddleHours != null && v.paddleHours > maxHours) {
        ctx.addIssue({
          code: "custom",
          path: ["paddleHours"],
          message: `Paddle hours can't exceed your booked hours (${maxHours}).`,
        });
      }
    });
}

// Step 2 — customer details + rentals (RHF + zod, per ADR-10).
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
  // zod v4 coerced inputs type as unknown on the input side; the submit
  // handler below receives the parsed (coerced) output.
  const form = useForm<DetailsValues>({
    resolver: zodResolver(schema) as unknown as Resolver<DetailsValues>,
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      paddleQty: defaultValues?.paddleQty ?? 0,
      paddleHours: defaultValues?.paddleHours ?? null,
      ball: defaultValues?.ball ?? false,
    },
  });

  const paddleQty = form.watch("paddleQty");
  const showHours = (paddleQty ?? 0) > 0;

  return (
    <form
      onSubmit={form.handleSubmit((v) =>
        onSubmit({
          fullName: v.fullName,
          email: v.email,
          phone: v.phone,
          paddleQty: v.paddleQty,
          paddleHours: showHours ? (v.paddleHours ?? maxHours) : null,
          ball: v.ball,
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" {...form.register("fullName")} />
          {form.formState.errors.fullName ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.fullName.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Contact number</Label>
          <Input id="phone" autoComplete="tel" {...form.register("phone")} />
          {form.formState.errors.phone ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.phone.message}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email (confirmation + approval go here)</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        {form.formState.errors.email ? (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="paddleQty">Paddle rentals (0–50)</Label>
          <Input
            id="paddleQty"
            type="number"
            min={0}
            max={50}
            {...form.register("paddleQty", { valueAsNumber: true })}
          />
          {form.formState.errors.paddleQty ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.paddleQty.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paddleHours">
            Paddle hours (max {maxHours}, your booked hours)
          </Label>
          <Input
            id="paddleHours"
            type="number"
            min={0}
            max={maxHours}
            disabled={!showHours}
            placeholder={showHours ? String(maxHours) : "—"}
            {...form.register("paddleHours", { valueAsNumber: true })}
          />
          {form.formState.errors.paddleHours ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.paddleHours.message}
            </p>
          ) : null}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-current" {...form.register("ball")} />
        Add ball rental (one-time fee per booking)
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" disabled={busy}>
          Continue to payment
        </Button>
      </div>
    </form>
  );
}
