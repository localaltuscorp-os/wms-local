import { redirect } from "next/navigation";

/** MOVED (account holder, 2026-09-17): Recruitment JDs is an Operations MASTER
 *  now, not an HR rail row. Kept as a redirect because the section shipped at
 *  this path and links to it are already in circulation. */
export default function MovedRecruitmentJdPage() {
  redirect("/operations/masters/recruitment-jd");
}
