"use client";

import { TabCard } from "@/components/tabs/TabCard";
import type { TabSummaryResponse } from "@/lib/tabs/types";

type TabGroupProps = {
  emptyCopy?: string;
  tabs: TabSummaryResponse[];
  title: string;
};

export function TabGroup({ emptyCopy, tabs, title }: TabGroupProps) {
  if (tabs.length === 0 && !emptyCopy) {
    return null;
  }

  return (
    <section className="grid gap-3" aria-labelledby={`${title.replace(/\s+/g, "-")}-heading`}>
      <div>
        <h2 className="text-lg font-semibold text-foreground" id={`${title.replace(/\s+/g, "-")}-heading`}>
          {title}
        </h2>
        {tabs.length === 0 && emptyCopy ? (
          <p className="mt-1 text-sm leading-6 text-muted">{emptyCopy}</p>
        ) : null}
      </div>
      {tabs.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {tabs.map((summary, index) => (
            <TabCard index={index} key={summary.tab.id} summary={summary} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
