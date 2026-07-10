import React, { useEffect, useState } from 'react';
import { Activity, Cpu, Clock, Hash } from 'lucide-react';
import api from '../api';
import { Card, StatPill, Button } from '../components/Card';
import { getSocket } from '../socket';

function fmtUptime(s) {
  if (!s && s !== 0) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function Status() {
  const [status, setStatus] = useState(null);
  const [restarting, setRestarting] = useState(false);

  async function load() {
    const { data } = await api.get('/status');
    setStatus(data);
  }

  useEffect(() => {
    load();
    const s = getSocket();
    const onStatus = (data) => setStatus((prev) => ({ ...prev, ...data }));
    const onConn = (data) => setStatus((prev) => ({ ...prev, connection: data.state, pairingCode: data.pairingCode ?? prev?.pairingCode }));
    s.on('status', onStatus);
    s.on('connection', onConn);
    const interval = setInterval(load, 10000);
    return () => { s.off('status', onStatus); s.off('connection', onConn); clearInterval(interval); };
  }, []);

  async function restart() {
    setRestarting(true);
    try { await api.post('/bot/restart'); } finally {
      setTimeout(() => setRestarting(false), 4000);
    }
  }

  const online = status?.connection === 'open';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Bot Status</h2>
        <Button variant="danger" onClick={restart} disabled={restarting}>
          {restarting ? 'Restarting…' : 'Restart Bot'}
        </Button>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${online ? 'bg-cyber-green shadow-[0_0_10px_#39ff88]' : 'bg-cyber-red shadow-[0_0_10px_#ff3f5f]'} animate-pulse`} />
          <span className="text-xl font-bold neon-text uppercase">{status?.connection || 'unknown'}</span>
          {status?.offline && <span className="text-xs text-cyber-red">(bot API unreachable)</span>}
        </div>
        {status?.pairingCode && (
          <div className="mt-4 text-cyber-green text-2xl font-mono tracking-[0.3em] neon-text">
            {status.pairingCode}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatPill label="Uptime" value={fmtUptime(status?.uptimeSeconds)} accent="blue" />
        <StatPill label="Messages Seen" value={status?.stats?.messagesSeen ?? 0} accent="purple" />
        <StatPill label="Commands Run" value={status?.stats?.commandsRun ?? 0} accent="green" />
        <StatPill label="Bot Number" value={status?.botNumber || '—'} accent="blue" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Configuration" icon={Hash}>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-slate-400">Prefix</dt><dd>{status?.prefix || '.'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Mode</dt><dd>{status?.mode || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Owner Number</dt><dd>{status?.ownerNumber || '—'}</dd></div>
          </dl>
        </Card>
        <Card title="Process" icon={Cpu}>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-slate-400">PID</dt><dd>{status?.pid || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">RSS Memory</dt><dd>{status?.memory ? `${Math.round(status.memory.rss / 1024 / 1024)} MB` : '—'}</dd></div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
