import "server-only";
import { asc } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { indexSections, indexLinks } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

export interface IndexLinkView {
  id: string;
  label: string;
  url: string;
}

export interface IndexSectionView {
  id: string;
  title: string;
  links: IndexLinkView[];
}

/**
 * The full Index hub: every section with its hyperlink buttons, ordered by
 * sort_order (then label / title for stable ties). One small payload that the
 * whole team shares, so it's cached under the `indexHub` tag and busted by the
 * admin edit actions.
 */
export const listIndexSections = unstable_cache(
  async (): Promise<IndexSectionView[]> => {
    const [sections, links] = await Promise.all([
      db.select().from(indexSections).orderBy(asc(indexSections.sortOrder), asc(indexSections.title)),
      db.select().from(indexLinks).orderBy(asc(indexLinks.sortOrder), asc(indexLinks.label)),
    ]);

    const bySection = new Map<string, IndexLinkView[]>();
    for (const l of links) {
      const arr = bySection.get(l.sectionId) ?? [];
      arr.push({ id: l.id, label: l.label, url: l.url });
      bySection.set(l.sectionId, arr);
    }

    return sections.map((s) => ({
      id: s.id,
      title: s.title,
      links: bySection.get(s.id) ?? [],
    }));
  },
  ["list-index-sections"],
  { tags: [CACHE_TAGS.indexHub], revalidate: 600 },
);
