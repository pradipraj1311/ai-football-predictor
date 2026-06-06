import React, { useState, useEffect } from 'react';
import { Match } from '../types';
import { Cpu, Target, TrendingUp, Zap, Sparkles, Star, AlertTriangle } from 'lucide-react';

export const AIPredictor: React.FC<{ match: Match }> = ({ match }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match }),
    })
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.details || payload.error || "Analysis Failed");
        setData(payload.prediction);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [match.id]);

  if (loading) {
    return (
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
        <Cpu className="w-8 h-8 text-indigo-500 animate-pulse mb-4" />
        <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest animate-pulse">Synchronizing Intelligence Streams...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0B1121] border border-red-500/20 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
        <AlertTriangle className="w-8 h-8 text-red-500 mb-4" />
        <p className="text-sm font-bold text-red-400 mb-2">Neural Engine Offline</p>
        <p className="text-xs text-slate-500 font-mono text-center max-w-sm">{error}</p>
        <p className="text-[10px] text-slate-600 mt-4 uppercase">Check your GEMINI_API_KEY in the .env file</p>
      </div>
    );
  }

  if (!data) return null;

  const pHome = data.winProbability?.home || 33;
  const pDraw = data.winProbability?.draw || 34;
  const pAway = data.winProbability?.away || 33;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
      {/* Panel 1: Match Forecaster */}
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-indigo-900/20 to-transparent p-4 border-b border-white/5 flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">AI Tactical Forecaster</h3>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-white/5">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Projected Outcome</span>
              <div className="text-2xl font-black text-white flex items-center gap-2 font-mono">
                <Target className="w-5 h-5 text-emerald-400" /> {data.suggestedScore}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Model State</span>
              <span className="text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">LIVE ENGINE</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase font-mono">
              <span>{match.homeTeam.code} ({pHome}%)</span>
              <span>Draw ({pDraw}%)</span>
              <span>{match.awayTeam.code} ({pAway}%)</span>
            </div>
            <div className="h-2 flex rounded-full overflow-hidden bg-slate-800">
              <div style={{ width: `${pHome}%` }} className="bg-emerald-500"></div>
              <div style={{ width: `${pDraw}%` }} className="bg-slate-500"></div>
              <div style={{ width: `${pAway}%` }} className="bg-blue-500"></div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h4 className="flex items-center gap-2 text-xs font-black text-slate-300 uppercase mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Live Matrix Overview
            </h4>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">{data.analysis}</p>
          </div>
        </div>
      </div>

      {/* Panel 2: Fantasy Advisory Starters */}
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-emerald-900/20 to-transparent p-4 border-b border-white/5 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">AI Lineup Advisor</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 p-3.5 border border-white/5 rounded-xl">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-0.5">CAPTAIN</span>
              <strong className="text-emerald-400 text-sm font-black tracking-tight">{data.advisor?.captain || 'Formulating...'}</strong>
            </div>
            <div className="bg-slate-900/50 p-3.5 border border-white/5 rounded-xl">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-0.5">VICE-CAPTAIN</span>
              <strong className="text-blue-400 text-sm font-black tracking-tight">{data.advisor?.viceCaptain || 'Formulating...'}</strong>
            </div>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {data.advisor?.bestXI?.map((player: any, idx: number) => (
              <div key={idx} className="bg-slate-900/30 p-3 rounded-xl border border-white/5 flex justify-between items-center text-xs">
                <div>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold text-white text-sm">{player.name}</span>
                    <span className="text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.2 rounded text-slate-400 font-mono uppercase">{player.team}</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5 line-clamp-1">{player.reason}</p>
                </div>
                <div className="flex gap-1 items-center bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                  <Star className="w-3 h-3 fill-emerald-500 text-emerald-500" /> {player.rating}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};