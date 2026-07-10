import React, { useState } from 'react';
import { Card, Button } from '../components/Card';
import api from '../api';

export default function Backup() {
  const [status, setStatus] = useState('');

  async function downloadBackup() {
    const { data } = await api.get('/backup');
    const blob = new Blob([JSON.stringify(data.data || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olasubomi-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('Restoring…');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.post('/restore', parsed);
      setStatus('Restored ✓');
    } catch (err) {
      setStatus('Restore failed: ' + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Database Backup / Restore</h2>
      <Card title="Backup">
        <p className="text-sm text-slate-400 mb-3">Download a full JSON snapshot of the bot's database (users, groups, settings).</p>
        <Button onClick={downloadBackup}>Download Backup</Button>
      </Card>
      <Card title="Restore">
        <p className="text-sm text-slate-400 mb-3">Restore from a previously downloaded backup file. This overwrites current data.</p>
        <input type="file" accept="application/json" onChange={restoreBackup} className="text-sm" />
        {status && <p className="text-xs text-cyber-green mt-2">{status}</p>}
      </Card>
    </div>
  );
}
