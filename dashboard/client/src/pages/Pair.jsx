import React, { useState } from 'react';
import { Card, Button, Input } from '../components/Card';
import api from '../api';

export default function Pair() {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function submit() {
    if (!number.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pair', { number: number.replace(/\D/g, '') });
      setResult(data);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Pair New Number</h2>
      <Card>
        <label className="text-xs text-slate-400 uppercase">WhatsApp Number (with country code)</label>
        <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="2349112097911" className="mt-1 mb-4" />
        <Button onClick={submit} disabled={loading}>{loading ? 'Requesting…' : 'Request Pairing Code'}</Button>
        {result && <p className="text-xs text-cyber-green mt-3">Request sent — check Bot Status for the pairing code.</p>}
      </Card>
    </div>
  );
}
