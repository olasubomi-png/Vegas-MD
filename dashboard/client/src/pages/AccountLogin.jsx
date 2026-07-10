import React from 'react';
import { Card } from '../components/Card';

export default function AccountLogin() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold neon-text tracking-widest mb-1">OLASUBOMI-MD</h1>
        <p className="text-xs text-cyber-purple mb-6 uppercase tracking-widest">My Account</p>
        <p className="text-sm text-slate-400 mb-6">
          Sign in with Google to claim daily coins and deploy your own bot instance.
        </p>
        {error && <p className="text-cyber-red text-xs mb-4">Google sign-in failed — please try again.</p>}
        <a
          href="/api/user/auth/google"
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:shadow-neon transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.1-17.1 10.1z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.5l-6.6-5.4C29.6 34.7 27 35.5 24 35.5c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.9 39.8 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.6 5.4C41.5 35.7 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>
          Sign in with Google
        </a>
      </Card>
    </div>
  );
}
