import React, { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, StatPill } from '../components/Card';
import api from '../api';
import { getSocket } from '../socket';

export default function Stats() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.get('/status').then(({ data }) => setStatus(data));
    const s = getSocket();
    const onStats = (stats) => {
      setHistory((prev) => [...prev.slice(-29), { t: new Date().toLocaleTimeString(), commands: stats.commandsRun, messages: stats.messagesSeen }]);
    };
    s.on('stats', onStats);
    return () => s.off('stats', onStats);
  }, []);

  const stats = status?.stats || {};

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Statistics</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatPill label="Commands Run" value={stats.commandsRun ?? 0} accent="blue" />
        <StatPill label="Messages Seen" value={stats.messagesSeen ?? 0} accent="purple" />
        <StatPill label="Groups Seen" value={stats.groupsSeen ?? 0} accent="green" />
        <StatPill label="Users Seen" value={stats.usersSeen ?? 0} accent="blue" />
      </div>
      <Card title="Live Activity">
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={history}>
              <XAxis dataKey="t" stroke="#3fd0ff" fontSize={10} />
              <YAxis stroke="#3fd0ff" fontSize={10} />
              <Tooltip contentStyle={{ background: '#0b0e1a', border: '1px solid #1e2440' }} />
              <Line type="monotone" dataKey="commands" stroke="#3fd0ff" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="messages" stroke="#a855f7" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {history.length === 0 && <p className="text-slate-500 text-sm mt-2">Waiting for live activity…</p>}
      </Card>
    </div>
  );
}
