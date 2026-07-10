import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import api from '../api';

export default function Sessions() {
  const [sessions, setSessions] = useState(null);
  useEffect(() => { api.get('/sessions').then(({ data }) => setSessions(data)); }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Sessions</h2>
      <Card title="Primary Session">
        {sessions ? (
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-slate-400">Auth folder present</dt><dd>{sessions.primary?.exists ? 'yes' : 'no'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Credential files</dt><dd>{sessions.primary?.fileCount ?? 0}</dd></div>
          </dl>
        ) : <p className="text-slate-500">Loading…</p>}
      </Card>
    </div>
  );
}
