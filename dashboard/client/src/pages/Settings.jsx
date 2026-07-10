import React, { useEffect, useState } from 'react';
import { Card, Button, Input } from '../components/Card';
import api from '../api';

export default function Settings() {
  const [form, setForm] = useState({ prefix: '.', mode: 'private', botApiUrl: '', botApiKey: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(({ data }) => setForm((f) => ({
      ...f,
      prefix: data.prefix ?? f.prefix,
      mode: data.mode ?? f.mode,
      botApiUrl: data.botApi?.url ?? '',
      botApiKey: data.botApi?.apiKey ?? '',
    })));
  }, []);

  async function save() {
    await api.post('/settings', form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Settings</h2>
      <Card title="Bot Behaviour">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 uppercase">Prefix</label>
            <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase">Mode</label>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className="mt-1 w-full bg-cyber-panel2 border border-cyber-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>
      </Card>
      <Card title="Bot API Connection">
        <p className="text-xs text-slate-500 mb-3">Point this dashboard at the bot's internal API (same box or remote, e.g. your AWS server).</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 uppercase">Bot API URL</label>
            <Input value={form.botApiUrl} onChange={(e) => setForm({ ...form, botApiUrl: e.target.value })} placeholder="http://your-server:8090" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase">Bot API Key</label>
            <Input value={form.botApiKey} onChange={(e) => setForm({ ...form, botApiKey: e.target.value })} placeholder="DASHBOARD_API_KEY" className="mt-1" />
          </div>
        </div>
      </Card>
      <Button onClick={save}>{saved ? 'Saved ✓' : 'Save Settings'}</Button>
    </div>
  );
}
