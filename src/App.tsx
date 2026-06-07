import React, { useState, useEffect } from 'react';
import { MatchCard } from './components/MatchCard';
import { AIPredictor } from './components/AIPredictor';
import { StandingsGrid } from './components/StandingsGrid';
import { LiveTelemetry } from './components/LiveTelemetry';
import { Match } from './types';
import { GLOBAL_TEAMS_DIRECTORY, INITIAL_MATCHES, FootballTeamProfile } from './data';
import { BrainCircuit, Shield, Calendar, History, Globe } from 'lucide-react';

function App() {
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<FootballTeamProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'results' | 'teams'>('live');
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  // Countdown Timer Logic
  useEffect(() => {
    const targetDate = new Date('2026-06-11T00:00:00Z').getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;
      if (distance > 0) {
        setTimeLeft({
          d: Math.floor(distance / (1000 * 60 * 60 * 24)),
          h: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          m: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          s: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Live Matches Logic
  useEffect(() => {
    const fetchMatches = () => {
      fetch('/api/live-matches')
        .then((res) => res.json())
        .then((data) => {
          const liveData = data.matches || [];
          const updated = [...liveData, ...INITIAL_MATCHES.filter(m => m.status !== 'LIVE')];
          setMatches(updated);

          // Preserve selection smartly
          setSelectedMatch(prev => {
            if (!prev) return liveData[0] || updated.find(m => m.status === 'UPCOMING');
            return updated.find(m => m.id === prev.id) || prev;
          });
        })
        .catch((err) => console.error("Pipeline Error:", err));
    };

    fetchMatches();
    const interval = setInterval(fetchMatches, 60000); // Poll every 60s
    return () => clearInterval(interval);
  }, []);

  const filteredMatches = matches.filter((m) => {
    if (activeTab === 'live') return m.status === 'LIVE';
    if (activeTab === 'upcoming') return m.status === 'UPCOMING';
    if (activeTab === 'results') return m.status === 'FT';
    return false;
  });

  // Premium Empty State Component
  const renderWorldCupHub = () => (
    <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-8 relative overflow-hidden shadow-2xl min-h-[500px] flex flex-col items-center justify-center text-center">
       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
       
       <Globe className="w-16 h-16 text-indigo-400 mb-6 animate-[spin_10s_linear_infinite]" />
       <h2 className="text-3xl font-black text-white tracking-tight mb-2">FIFA World Cup 2026™</h2>
       <p className="text-sm text-slate-400 font-mono mb-10">The Intelligence Matrix is preparing for global deployment.</p>

       <div className="grid grid-cols-4 gap-4 w-full max-w-lg mb-8">
          <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl shadow-inner">
             <span className="text-4xl font-black text-white font-mono">{timeLeft.d}</span>
             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mt-1">Days</span>
          </div>
          <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl shadow-inner">
             <span className="text-4xl font-black text-white font-mono">{timeLeft.h}</span>
             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mt-1">Hours</span>
          </div>
          <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl shadow-inner">
             <span className="text-4xl font-black text-white font-mono">{timeLeft.m}</span>
             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mt-1">Mins</span>
          </div>
          <div className="bg-[#0f172a] border border-white/5 p-4 rounded-xl shadow-inner">
             <span className="text-4xl font-black text-indigo-400 font-mono">{timeLeft.s}</span>
             <span className="text-[10px] text-indigo-500/50 font-bold uppercase tracking-widest block mt-1">Secs</span>
          </div>
       </div>

       <button onClick={() => { setActiveTab('upcoming'); setSelectedTeam(null); }} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2">
          <Calendar className="w-4 h-4" /> View Upcoming Fixtures
       </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">e2match<span className="text-indigo-400">.ai</span></h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-1">Live Intelligence Matrix</p>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
          <div className="bg-[#0B1121] border border-white/5 p-1.5 rounded-xl grid grid-cols-4 gap-1 text-center">
            <button onClick={() => { setActiveTab('live'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'live' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Live
            </button>
            <button onClick={() => { setActiveTab('upcoming'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'upcoming' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Calendar className="w-3 h-3" /> Upcmg
            </button>
            <button onClick={() => { setActiveTab('results'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'results' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <History className="w-3 h-3" /> Results
            </button>
            <button onClick={() => { setActiveTab('teams'); setSelectedTeam(GLOBAL_TEAMS_DIRECTORY[0]); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'teams' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Shield className="w-3 h-3" /> Teams
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
            {activeTab !== 'teams' ? (
              filteredMatches.length === 0 && activeTab === 'live' ? (
                <div className="text-xs text-slate-500 font-mono text-center p-8 bg-[#0B1121] rounded-xl border border-white/5 flex flex-col items-center gap-2">
                   <span className="text-2xl">⚽</span>
                   <span>Off-Season Mode Active.</span>
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono text-center p-8 bg-[#0B1121] rounded-xl border border-white/5">No active fixtures in this matrix.</div>
              ) : (
                filteredMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    isSelected={selectedMatch?.id === match.id && !selectedTeam}
                    onSelect={() => { setSelectedMatch(match); setSelectedTeam(null); }}
                  />
                ))
              )
            ) : (
              GLOBAL_TEAMS_DIRECTORY.map((team) => (
                <div
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedTeam?.id === team.id ? 'bg-gradient-to-r from-indigo-950/40 to-[#0B1121] border-indigo-500/50' : 'bg-[#0B1121] border-white/5 hover:border-indigo-500/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{team.logo}</span>
                    <span className="text-xs font-bold text-white">{team.name}</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded">{team.code}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
          {activeTab === 'teams' && selectedTeam ? (
            <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <span className="text-6xl p-4 bg-slate-900 rounded-2xl border border-white/5 shadow-inner">{selectedTeam.logo}</span>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">{selectedTeam.name}</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedTeam.country} • Founded in {selectedTeam.founded}</p>
                </div>
              </div>
            </div>
          ) : activeTab === 'live' && filteredMatches.length === 0 ? (
            renderWorldCupHub()
          ) : selectedMatch ? (
            <>
              <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">{selectedMatch.competition}</span>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded border ${selectedMatch.status === 'LIVE' ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' : 'bg-white/5 text-slate-400 border-white/10'}`}>{selectedMatch.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col items-center gap-3 w-1/3">
                    <span className="text-5xl">{selectedMatch.homeTeam.logo}</span>
                    <span className="text-base font-black text-white">{selectedMatch.homeTeam.name}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center w-1/3">
                    {selectedMatch.status === 'LIVE' || selectedMatch.status === 'FT' ? (
                      <div className="flex items-center gap-4 text-5xl font-black text-white font-mono">
                        <span>{selectedMatch.homeScore}</span><span className="text-slate-600 pb-2">-</span><span>{selectedMatch.awayScore}</span>
                      </div>
                    ) : (
                      <div className="text-xl font-mono font-black text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-4 py-1.5 rounded-xl tracking-wider">{selectedMatch.time}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-3 w-1/3">
                    <span className="text-5xl">{selectedMatch.awayTeam.logo}</span>
                    <span className="text-base font-black text-white">{selectedMatch.awayTeam.name}</span>
                  </div>
                </div>
              </div>
              <AIPredictor match={selectedMatch} />
              
              {/* નવો ટેલિમેટ્રી ગ્રાફ માત્ર લાઈવ અને પૂરી થયેલી મેચો માટે જ */}
              {(selectedMatch.status === 'LIVE' || selectedMatch.status === 'FT') && (
                <LiveTelemetry match={selectedMatch} />
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default App;