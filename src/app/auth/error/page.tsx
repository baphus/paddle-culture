import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Link Expired — CK Grounds",
};

// /auth/error — landing for failed auth-email links (expired/used PKCE
// recovery codes, provider errors). Generic: any auth failure lands here.
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card className="p-0">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
            <h1 className="text-2xl font-bold">This link can't be used</h1>
            <p className="text-sm text-balance text-muted-foreground">
              The email link is invalid or has expired. Links are single-use
              and short-lived — request a fresh one.
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/forgot-password" className="underline-offset-4 hover:underline">
                Request a new reset link
              </Link>
              <Link href="/login" className="underline-offset-4 hover:underline">
                ← Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
