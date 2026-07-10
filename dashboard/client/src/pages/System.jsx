import React, { useEffect, useState } from 'react';
import { Card, StatPill } from '../components/Card';
import api from '../api';

function fmtBytes(b) {
  if (!b) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(1)} ${units[i]}`;
}

export default function System() {
  const [sys, setSys] = useState(null);

  useEffect(() => {
    const load = () => api.get('/system').then(({ data }) => setSys(data));
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  const usedMem = sys ? sys.totalMem - sys.freeMem : 0;
  const memPct = sys ? Math.round((usedMem / sys.totalMem) * 100) : 0;
  const cpuPct = sys ? Math.min(100, Math.round((sys.loadavg[0] / sys.cpuCount) * 100)) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">System Monitor</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatPill label="CPU Load" value={`${cpuPct}%`} accent="blue" />
        <StatPill label="Memory Used" value={`${memPct}%`} accent="purple" />
        <StatPill label="Uptime" value={sys ? `${Math.floor(sys.uptime / 3600)}h` : '—'} accent="green" />
        <StatPill label="CPU Cores" value={sys?.cpuCount ?? '—'} accent="blue" />
      </div>
      <Card title="Host Details">
        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-slate-400">Hostname</dt><dd>{sys?.hostname || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Platform</dt><dd>{sys?.platform || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">CPU Model</dt><dd className="truncate max-w-xs">{sys?.cpuModel || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Memory</dt><dd>{fmtBytes(usedMem)} / {fmtBytes(sys?.totalMem)}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
