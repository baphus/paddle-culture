import { redirect } from "next/navigation";

export default async function RevenueRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value) query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/admin/finance${suffix ? `?${suffix}` : ""}`);
}
