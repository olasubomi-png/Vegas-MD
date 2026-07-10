import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setToken } from '../api';
import { Button, Input } from '../components/Card';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { password });
      setToken(data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="glass-panel rounded-2xl p-8 w-full max-w-sm shadow-neon">
        <h1 className="text-2xl font-bold neon-text text-center tracking-widest mb-1">OLASUBOMI-MD</h1>
        <p className="text-center text-xs text-cyber-purple mb-6 uppercase tracking-widest">Restricted Access</p>
        <label className="text-xs text-slate-400 uppercase tracking-wide">Admin Password</label>
        <Input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="mt-1 mb-4"
        />
        {error && <p className="text-cyber-red text-xs mb-3">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Authenticating…' : 'Access Console'}
        </Button>
      </form>
    </div>
  );
}
