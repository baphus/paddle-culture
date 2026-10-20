"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_FORM = { name: "", email: "", password: "" };

export default function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function closeDialog(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(INITIAL_FORM);
      setFormError(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setFormError(body.error?.message ?? "Could not create user.");
        return;
      }
      toast.success("Admin user created.");
      setOpen(false);
      setForm(INITIAL_FORM);
      router.refresh();
    } catch {
      setFormError("Could not create user. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogTrigger
        render={
          <Button className="h-9">
            <UserPlus />
            Add user
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add admin user</DialogTitle>
          <DialogDescription>
            Create an active administrator account. Share the initial password securely.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="new-admin-name">Full name</Label>
            <Input
              id="new-admin-name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-admin-email">Email address</Label>
            <Input
              id="new-admin-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              maxLength={254}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-admin-password">Initial password</Label>
            <Input
              id="new-admin-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
              minLength={8}
              maxLength={256}
            />
            <p className="text-xs text-muted-foreground">Must be at least 8 characters.</p>
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
