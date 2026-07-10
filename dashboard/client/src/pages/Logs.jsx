import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../components/Card';
import api from '../api';
import { getSocket } from '../socket';

const LEVEL_COLOR = { info: 'text-cyber-blue', warn: 'text-yellow-400', error: 'text-cyber-red' };

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    api.get('/logs').then(({ data }) => setLogs(data));
    const s = getSocket();
    const onLog = (entry) => setLogs((prev) => [...prev.slice(-499), entry]);
    s.on('log', onLog);
    return () => s.off('log', onLog);
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [logs]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Live Logs</h2>
      <Card className="p-0 overflow-hidden">
        <div ref={boxRef} className="h-[70vh] overflow-y-auto p-4 text-xs space-y-1 bg-black/40">
          {logs.length === 0 && <p className="text-slate-500">No logs yet…</p>}
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-600">{new Date(l.ts).toLocaleTimeString()}</span>
              <span className={`${LEVEL_COLOR[l.level] || 'text-cyber-blue'} uppercase w-12`}>{l.level}</span>
              <span className="text-slate-300 break-all whitespace-pre-wrap">{l.message}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
