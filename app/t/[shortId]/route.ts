import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";

export const runtime = "nodejs"; // postgres-js needs Node APIs

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shortId: string }> },
) {
  const { shortId } = await params;
  if (!/^[0-9a-f]{10}$/.test(shortId)) notFound();
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.shortId, shortId))
    .limit(1);
  if (!row) notFound();
  redirect(`/tasks/${row.id}` as Route);
}
