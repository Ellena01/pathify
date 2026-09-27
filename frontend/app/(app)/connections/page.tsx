'use client';

import React from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectionsWorkbench, ConnectionRuleNote } from '@/components/connections/ConnectionsWorkbench';

/**
 * /connections — the individual half of the connection graph.
 *
 * Requests, the organization directory and the messages that open after an
 * acceptance all live behind one component shared with `/org/outreach`, so the
 * two sides cannot drift apart. Everything about *who* the caller is comes
 * from their session on the server; this page only draws what the API returns.
 */
export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Discover"
        title="Connections"
        subtitle="Organizations that reached out, requests you sent, and the conversations they opened."
      />
      <ConnectionsWorkbench mode="individual" />
      <ConnectionRuleNote mode="individual" />
    </div>
  );
}
