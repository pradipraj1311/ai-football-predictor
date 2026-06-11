import React, { useState, useEffect } from 'react';
import { Match } from '../types';
import { Cpu, Target, TrendingUp, Zap, Sparkles, Star, AlertTriangle, Activity, Volume2, Square, MapPin } from 'lucide-react';
import { GLOBAL_TEAMS_DIRECTORY } from '../data';

const teamLogoMap = GLOBAL_TEAMS_DIRECTORY.reduce((acc, team) => {
  acc[team.name] = team.logo;
  return acc;
}, {} as Record<string, string>);

export const AIPredictor: React.FC<{ match: Match }> = ({ match }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Audio & Heatmap States
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedPlayerForHeatmap, setSelectedPlayerForHeatmap] = useState<any>(null);

  useEffect(() => {
    // Stop any ongoing speech when match changes
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSelectedPlayerForHeatmap(null);

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

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [match.id, match.homeScore, match.awayScore]); 

  // --- 🎙️ AI VOICE COMMENTARY LOGIC ---
  const toggleSpeech = () => {
    if (!data || !data.analysis) return;

    if (isSpeaking) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    } else {
      if ('speechSynthesis' in window) {
        const script = `Live intelligence update for ${match.homeTeam.name} versus ${match.awayTeam.name}. ${data.analysis} The current projected outcome is ${data.suggestedScore}.`;
        
        const utterance = new SpeechSynthesisUtterance(script);
        utterance.rate = 1.1; 
        utterance.pitch = 1.0;
        utterance.lang = 'en-US';

        utterance.onend = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      } else {
        console.warn("Speech synthesis is not supported in this environment.");
      }
    }
  };

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

  const margin = 1.05;
  const oddsHome = ((100 / pHome) / margin).toFixed(2);
  const oddsDraw = ((100 / pDraw) / margin).toFixed(2);
  const oddsAway = ((100 / pAway) / margin).toFixed(2);

  return (
    <>
      {/* GLOBAL AUDIO CONTROLLER - Highly Visible */}
      <div className="mb-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between shadow-lg">
         <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isSpeaking ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-indigo-500/20 text-indigo-400'}`}>
               <Volume2 className="w-5 h-5" />
            </div>
            <div>
               <h4 className="text-xs font-black text-white tracking-widest uppercase">AI Audio Commentary</h4>
               <p className="text-[10px] text-slate-400">Listen to real-time tactical breakdowns</p>
            </div>
         </div>
         <button 
            onClick={toggleSpeech}
            className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-xl ${isSpeaking ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
         >
            {isSpeaking ? <span className="flex items-center gap-2"><Square className="w-3.5 h-3.5 fill-current" /> Stop Audio</span> : <span className="flex items-center gap-2">▶ Play Now</span>}
         </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
        {/* Panel 1: Match Forecaster */}
        <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative animate-fade-in-up">
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

            {/* Live Implied Odds Row */}
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

            {/* ⚠️ Legal Disclaimer Banner */}
            <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <span className="text-red-400 text-lg">⚠️</span>
              <div>
                <h4 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-1">
                  Important Disclaimer
                </h4>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  E2match.ai is strictly for informational and entertainment purposes. We are <strong>NOT</strong> a gambling or betting site. AI-generated implied odds and predictions are simulations and do not guarantee real-world outcomes. We are not responsible for any financial decisions made based on this data. By using this platform, you agree to our <a href="/terms-of-service" className="text-indigo-400 hover:underline">Terms of Service</a>.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest uppercase mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Live Matrix Overview
              </h4>
              <p className="text-sm text-slate-300 leading-relaxed font-medium mb-5">{data.analysis}</p>

              {/* TACTICAL INSIGHTS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl">
                  <h5 className="text-[9px] font-black text-red-400 tracking-widest uppercase mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> Tactical Vulnerabilities
                  </h5>
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block mb-0.5">{match.homeTeam.code} Weakness</span>
                      <p className="text-xs text-slate-300">{data.vulnerabilities?.home || "Analyzing..."}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block mb-0.5">{match.awayTeam.code} Weakness</span>
                      <p className="text-xs text-slate-300">{data.vulnerabilities?.away || "Analyzing..."}</p>
                    </div>
                  </div>
                </div>

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
        <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-fade-in-up" style={{ animationDelay: '100ms' }}>
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
              <div className="flex justify-between items-end mb-2">
                 <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase block">Live Top Performers</span>
                 <span className="text-[8px] text-indigo-400 font-bold uppercase animate-pulse">Click player for Heatmap</span>
              </div>
              
              {data.advisor?.bestXI?.map((player: any, idx: number) => (
                <div 
                   key={idx} 
                   onClick={() => setSelectedPlayerForHeatmap(player)}
                   className="bg-[#0f172a] p-3 rounded-xl border border-white/5 flex flex-col gap-2 hover:border-indigo-500/50 hover:bg-indigo-900/10 cursor-pointer transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <MapPin className="w-5 h-5 text-indigo-400/50" />
                  </div>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">{player.name}</span>
                      <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                        {teamLogoMap[player.team]} {player.team}
                      </span>
                    </div>
                    <div className="flex gap-1 items-center bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold z-10">
                      <Star className="w-3 h-3 fill-emerald-500 text-emerald-500" /> {player.rating}
                    </div>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-snug w-[90%]">{player.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 🗺️ MODAL: AI Player Heatmap */}
      {selectedPlayerForHeatmap && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-[#0B1121] border border-indigo-500/30 rounded-2xl max-w-md w-full shadow-[0_0_50px_rgba(79,70,229,0.15)] overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-900/40 to-[#0B1121] p-4 flex justify-between items-center border-b border-white/5">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                       <MapPin className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                       <h3 className="text-white font-black">{selectedPlayerForHeatmap.name}</h3>
                       <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Live Positional Heatmap</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedPlayerForHeatmap(null)} className="text-slate-500 hover:text-white p-2">✕</button>
              </div>
              
              <div className="p-6">
                 {/* CSS Pitch Representation */}
                 <div className="w-full h-48 bg-emerald-900/20 border-2 border-white/10 rounded-lg relative overflow-hidden flex items-center justify-center">
                    {/* Pitch Lines */}
                    <div className="absolute w-full h-px bg-white/10"></div>
                    <div className="absolute w-16 h-16 border-2 border-white/10 rounded-full"></div>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-16 border-2 border-l-0 border-white/10"></div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-16 border-2 border-r-0 border-white/10"></div>
                    
                    {/* Fake Heatmap Blobs (Simulated based on rating) */}
                    <div className="absolute w-24 h-24 bg-red-500/40 blur-xl rounded-full" style={{ left: '60%', top: '30%' }}></div>
                    <div className="absolute w-32 h-20 bg-amber-500/30 blur-xl rounded-full" style={{ left: '40%', top: '40%' }}></div>
                    <div className="absolute w-16 h-16 bg-red-600/50 blur-lg rounded-full" style={{ left: '75%', top: '50%' }}></div>
                 </div>

                 <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-900/50 p-2 rounded border border-white/5">
                       <span className="block text-[9px] text-slate-500 uppercase tracking-widest">Touches</span>
                       <span className="text-white font-mono font-bold">{(parseFloat(selectedPlayerForHeatmap.rating) * 5.2).toFixed(0)}</span>
                    </div>
                    <div className="bg-slate-900/50 p-2 rounded border border-white/5">
                       <span className="block text-[9px] text-slate-500 uppercase tracking-widest">Distance</span>
                       <span className="text-white font-mono font-bold">{(parseFloat(selectedPlayerForHeatmap.rating) * 1.1).toFixed(1)}km</span>
                    </div>
                    <div className="bg-slate-900/50 p-2 rounded border border-white/5">
                       <span className="block text-[9px] text-slate-500 uppercase tracking-widest">Heat Zone</span>
                       <span className="text-red-400 font-mono font-bold uppercase text-[10px]">Final Third</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </>
  );
};