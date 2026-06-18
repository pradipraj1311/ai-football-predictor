import React, { useState } from 'react';
import { BrainCircuit, LogIn, AlertTriangle } from 'lucide-react';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        sessionStorage.setItem('is_admin_auth', 'true');
        window.location.href = '/'; // Redirect to home page
      } else {
        const data = await res.json();
        setError(data.message || 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 font-sans">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
          <BrainCircuit className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">E2match<span className="text-indigo-400">.ai</span></h1>
      </div>
      <div className="w-full max-w-sm">
        <form onSubmit={handleLogin} className="bg-[#0B1121] rounded-2xl border border-white/10 p-8 shadow-2xl space-y-6">
          <h2 className="text-xl font-bold text-white text-center">Admin Access</h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider" htmlFor="username">Username</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className="mt-2 w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider" htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-2 w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-500 transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
            {loading ? <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <><LogIn className="w-4 h-4" /> Sign In</>}
          </button>
        </form>
      </div>
    </div>
  );
};