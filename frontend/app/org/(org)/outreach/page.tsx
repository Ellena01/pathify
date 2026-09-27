'use client';

import React from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectionsWorkbench, ConnectionRuleNote } from '@/components/connections/ConnectionsWorkbench';

/**
 * /org/outreach — the organisation half of the same conversation.
 *
 * Requests come in, connections are accepted, messages open. The component is
 * shared with `/connections` so the two sides cannot disagree about a status;
 * only the copy and the tab set differ.
 */
export default function OrgOutreachPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Hiring"
        title="Outreach"
        subtitle="Requests waiting on you, conversations in progress, and everything already settled."
      />
      <ConnectionsWorkbench mode="org" />
      <ConnectionRuleNote mode="org" />
    </div>
  );
}
