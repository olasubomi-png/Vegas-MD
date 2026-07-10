import React, { useEffect, useState } from 'react';
import { Card, Button, Textarea } from '../components/Card';
import api from '../api';

export default function Broadcast() {
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('users');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  function loadHistory() {
    api.get('/broadcast/history').then(({ data }) => setHistory(Array.isArray(data) ? data : []));
  }
  useEffect(loadHistory, []);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const { data } = await api.post('/broadcast', { message, target });
      setResult(data);
      setMessage('');
      loadHistory();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Broadcast</h2>
      <Card title="New Broadcast">
        <div className="flex gap-3 mb-3 text-sm">
          {['users', 'groups'].map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={`px-3 py-1.5 rounded-lg border ${target === t ? 'border-cyber-blue text-cyber-blue shadow-neon' : 'border-cyber-border text-slate-400'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your broadcast message…" />
        <div className="flex items-center gap-3 mt-3">
          <Button onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send Broadcast'}</Button>
          {result && <span className="text-xs text-cyber-green">Sent {result.sent ?? 0}/{result.total ?? 0}</span>}
        </div>
      </Card>
      <Card title="History">
        <div className="space-y-2 text-sm max-h-80 overflow-y-auto">
          {history.map((h) => (
            <div key={h._id} className="border-b border-cyber-border/50 pb-2">
              <div className="text-slate-500 text-xs">{new Date(h.createdAt).toLocaleString()} · {h.target}</div>
              <div className="truncate">{h.message}</div>
            </div>
          ))}
          {history.length === 0 && <p className="text-slate-500">No broadcasts yet.</p>}
        </div>
      </Card>
    </div>
  );
}
