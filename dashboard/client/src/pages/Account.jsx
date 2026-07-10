import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, StatPill } from '../components/Card';
import userApi, { getUserToken, setUserToken } from '../userApi';

export default function Account() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setUserToken(token);
      window.history.replaceState({}, '', '/account');
    }
    if (!getUserToken()) {
      navigate('/account/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const { data } = await userApi.get('/me');
      setMe(data);
      setNumber(data.pendingNumber || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load account');
    }
  }

  async function claim() {
    setBusy(true); setError(''); setMessage('');
    try {
      await userApi.post('/coins/claim');
      setMessage('Claimed 10 coins!');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Claim failed');
    } finally { setBusy(false); }
  }

  async function pair() {
    if (!number.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await userApi.post('/pair', { number });
      setMessage('Number saved. Click Deploy to pair it and go live.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Pairing failed');
    } finally { setBusy(false); }
  }

  async function deploy() {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await userApi.post('/deploy');
      setMessage(`Deployed! ${data.coins} coins remaining. A pairing code will appear on the admin Bot Status page.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Deploy failed');
    } finally { setBusy(false); }
  }

  function logout() {
    setUserToken(null);
    navigate('/account/login');
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {error ? <p className="text-cyber-red text-sm">{error}</p> : <p className="text-slate-400 text-sm">Loading…</p>}
      </div>
    );
  }

  const deployment = me.deployment || {};
  const expiresAt = deployment.expiresAt ? new Date(deployment.expiresAt) : null;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {me.picture && <img src={me.picture} alt="" className="w-10 h-10 rounded-full" />}
          <div>
            <h1 className="text-lg font-bold neon-text">{me.name}</h1>
            <p className="text-xs text-slate-400">{me.email}</p>
          </div>
        </div>
        <Button variant="ghost" onClick={logout}>Log out</Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatPill label="Coin balance" value={me.coins} accent="blue" />
        <StatPill label="Deploy cost" value={`${me.deployCost} coins / 3 days`} accent="purple" />
      </div>

      {error && <p className="text-cyber-red text-sm">{error}</p>}
      {message && <p className="text-cyber-green text-sm">{message}</p>}

      <Card title="Daily Coins">
        <p className="text-sm text-slate-400 mb-4">Claim 10 free coins once every 24 hours.</p>
        <Button onClick={claim} disabled={busy || !me.canClaim}>
          {me.canClaim ? 'Claim 10 coins' : 'Already claimed today'}
        </Button>
      </Card>

      <Card title="Your Bot Deployment">
        {deployment.active ? (
          <div className="space-y-3 text-sm">
            <p className="text-cyber-green">Active — number {deployment.ownerNumber}</p>
            {expiresAt && <p className="text-slate-400">Renews automatically on {expiresAt.toLocaleString()} for {me.deployCost} coins (or stops if your balance is too low).</p>}
            {deployment.lastNote && <p className="text-slate-500 text-xs">{deployment.lastNote}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase">Your WhatsApp number (with country code)</label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="2349112097911" className="mt-1" />
            </div>
            <Button variant="ghost" onClick={pair} disabled={busy}>Save number</Button>
            <div>
              <Button onClick={deploy} disabled={busy || !me.pendingNumber || me.coins < me.deployCost}>
                Deploy bot ({me.deployCost} coins, runs 3 days)
              </Button>
              {me.coins < me.deployCost && <p className="text-xs text-cyber-red mt-2">Not enough coins — claim your daily coins first.</p>}
            </div>
            {deployment.lastNote && <p className="text-slate-500 text-xs">{deployment.lastNote}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
