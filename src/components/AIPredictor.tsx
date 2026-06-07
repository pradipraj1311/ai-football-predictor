import React, { useState, useEffect } from 'react';
import { Match } from '../types';
import { Cpu, Target, TrendingUp, Zap, Sparkles, Star, AlertTriangle, Activity } from 'lucide-react';

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
  }, [match.id, match.homeScore, match.awayScore]); // Add scores to dependency array to re-fetch on goals

  if (loading && !data) {
    return (
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] col-span-full">
        <Cpu className="w-8 h-8 text-indigo-500 animate-pulse mb-4" />
        <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest animate-pulse">Synchronizing Intelligence Streams...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0B1121] border border-red-500/20 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] col-span-full">
        <AlertTriangle className="w-8 h-8 text-red-500 mb-4" />
        <p className="text-sm font-bold text-red-400 mb-2">Neural Engine Offline</p>
        <p className="text-xs text-slate-500 font-mono text-center max-w-sm">{error}</p>
        <p className="text-[10px] text-slate-600 mt-4 uppercase">Check API Quotas or Key validity</p>
      </div>
    );
  }

  if (!data) return null;

  const pHome = data.winProbability?.home || 33;
  const pDraw = data.winProbability?.draw || 34;
  const pAway = data.winProbability?.away || 33;

  // Calculate Implied Decimal Odds (with a small 5% bookmaker margin simulation for realism)
  const margin = 1.05;
  const oddsHome = ((100 / pHome) / margin).toFixed(2);
  const oddsDraw = ((100 / pDraw) / margin).toFixed(2);
  const oddsAway = ((100 / pAway) / margin).toFixed(2);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
      {/* Panel 1: Match Forecaster */}
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
        {loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500/20 overflow-hidden z-20">
            <div className="h-full bg-indigo-500 animate-[pulse_1s_ease-in-out_infinite] w-1/3"></div>
          </div>
        )}
        <div className="bg-gradient-to-r from-indigo-900/20 to-transparent p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">AI Tactical Forecaster</h3>
          </div>
          {loading && <Activity className="w-4 h-4 text-indigo-400 animate-spin" />}
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
              <span className="text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span> LIVE ENGINE
              </span>
            </div>
          </div>

          {/* NEW: Live Implied Odds Row */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Live Implied Odds</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-[#0f172a] border border-white/5 rounded-lg p-2 text-center hover:border-emerald-500/30 transition-colors">
                <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">1 ({match.homeTeam.code})</span>
                <span className="font-mono font-black text-emerald-400">{oddsHome}</span>
              </div>
              <div className="bg-[#0f172a] border border-white/5 rounded-lg p-2 text-center hover:border-slate-400/30 transition-colors">
                <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">X (Draw)</span>
                <span className="font-mono font-black text-slate-300">{oddsDraw}</span>
              </div>
              <div className="bg-[#0f172a] border border-white/5 rounded-lg p-2 text-center hover:border-blue-500/30 transition-colors">
                <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">2 ({match.awayTeam.code})</span>
                <span className="font-mono font-black text-blue-400">{oddsAway}</span>
              </div>
            </div>

            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase font-mono tracking-widest">
              <span>{pHome}%</span>
              <span>{pDraw}%</span>
              <span>{pAway}%</span>
            </div>
            <div className="h-1.5 flex rounded-full overflow-hidden bg-slate-800">
              <div style={{ width: `${pHome}%` }} className="bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
              <div style={{ width: `${pDraw}%` }} className="bg-slate-500"></div>
              <div style={{ width: `${pAway}%` }} className="bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]"></div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest uppercase mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Live Matrix Overview
            </h4>
            <p className="text-sm text-slate-300 leading-relaxed font-medium mb-5">{data.analysis}</p>

            {/* NEW: PREMIUM TACTICAL INSIGHTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vulnerabilities */}
              <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl">
                <h5 className="text-[9px] font-black text-red-400 tracking-widest uppercase mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Tactical Vulnerabilities
                </h5>
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block mb-0.5">{match.homeTeam.code} Weakness</span>
                    <p className="text-xs text-slate-300">{data.vulnerabilities?.home || "Analyzing defensive structure..."}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block mb-0.5">{match.awayTeam.code} Weakness</span>
                    <p className="text-xs text-slate-300">{data.vulnerabilities?.away || "Analyzing defensive structure..."}</p>
                  </div>
                </div>
              </div>

              {/* Key Matchups */}
              <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl">
                <h5 className="text-[9px] font-black text-amber-400 tracking-widest uppercase mb-3 flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> Key Pitch Battles
                </h5>
                <div className="space-y-3">
                  {data.keyMatchups?.map((matchup: any, idx: number) => (
                    <div key={idx} className="border-l-2 border-amber-500 pl-2">
                      <span className="text-xs font-bold text-white block">{matchup.battle}</span>
                      <span className="text-[9px] text-amber-500/70 font-mono font-bold uppercase mb-1 block">Impact: {matchup.impact}</span>
                      <p className="text-[11px] text-slate-400 leading-snug">{matchup.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
            <div className="bg-[#0f172a] border border-white/5 rounded-xl p-3.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-1">CAPTAIN</span>
              <strong className="text-emerald-400 text-sm font-black tracking-tight">{data.advisor?.captain || 'Formulating...'}</strong>
            </div>
            <div className="bg-[#0f172a] border border-white/5 rounded-xl p-3.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-1">VICE-CAPTAIN</span>
              <strong className="text-blue-400 text-sm font-black tracking-tight">{data.advisor?.viceCaptain || 'Formulating...'}</strong>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase block mb-2">Live Top Performers</span>
            {data.advisor?.bestXI?.map((player: any, idx: number) => (
              <div key={idx} className="bg-[#0f172a] p-3 rounded-xl border border-white/5 flex flex-col gap-2 hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-sm">{player.name}</span>
                    <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">{player.team}</span>
                  </div>
                  <div className="flex gap-1 items-center bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                    <Star className="w-3 h-3 fill-emerald-500 text-emerald-500" /> {player.rating}
                  </div>
                </div>
                <p className="text-slate-400 text-[11px] leading-snug">{player.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};