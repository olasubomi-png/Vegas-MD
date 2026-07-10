import React, { useEffect, useState } from 'react';
import { Card, Button } from '../components/Card';
import api from '../api';

export default function GitHub() {
  const [status, setStatus] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState(null);

  function load() { api.get('/github/status').then(({ data }) => setStatus(data)); }
  useEffect(load, []);

  async function pull() {
    setPulling(true);
    try {
      const { data } = await api.post('/github/pull');
      setResult(data);
      load();
    } finally { setPulling(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg tracking-widest text-cyber-purple uppercase">GitHub Updates</h2>
        <Button onClick={pull} disabled={pulling}>{pulling ? 'Pulling…' : 'Pull Latest'}</Button>
      </div>
      <Card title="Repository">
        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-slate-400">Branch</dt><dd>{status?.branch || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Working tree</dt><dd>{status?.dirty ? 'has local changes' : 'clean'}</dd></div>
        </dl>
      </Card>
      {result && (
        <Card title="Pull Result">
          <pre className="text-xs whitespace-pre-wrap text-cyber-green">{result.stdout || result.stderr}</pre>
        </Card>
      )}
      <Card title="Recent Commits">
        <div className="space-y-2 text-sm">
          {status?.commits?.map((c) => (
            <div key={c.hash} className="border-b border-cyber-border/50 pb-2">
              <span className="font-mono text-cyber-blue">{c.hash}</span> — {c.message}
              <div className="text-xs text-slate-500">{c.author} · {c.date}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
