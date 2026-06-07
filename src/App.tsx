import React, { useState, useEffect } from 'react';
import { MatchCard } from './components/MatchCard';
import { AIPredictor } from './components/AIPredictor';
import { StandingsGrid } from './components/StandingsGrid';
import { Match } from './types';
import { GLOBAL_TEAMS_DIRECTORY, INITIAL_MATCHES, FootballTeamProfile } from './data';
import { BrainCircuit, Target, Shield, Calendar, History, Trophy, Search } from 'lucide-react';

function App() {
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(INITIAL_MATCHES[0]);
  const [selectedTeam, setSelectedTeam] = useState<FootballTeamProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'results' | 'teams'>('live');
  useEffect(() => {
    fetch('/api/live-matches')
      .then((res) => res.json())
      .then((data) => {
        if (data.matches && data.matches.length > 0) {
          // Merge live feed with local dataset
          const updated = [...data.matches, ...INITIAL_MATCHES.filter(m => m.status !== 'LIVE')];
          setMatches(updated);

          // SMART ROUTING: If actual live matches are 0, auto-switch tab to 'upcoming'
          const actualLiveCount = data.matches.filter((m: any) => !m.isFallback && m.status === 'LIVE').length;

          if (actualLiveCount === 0) {
            setActiveTab('upcoming');
            // Select the first upcoming match as default view
            const firstUpcoming = updated.find(m => m.status === 'UPCOMING');
            if (firstUpcoming) setSelectedMatch(firstUpcoming);
          } else {
            setActiveTab('live');
            setSelectedMatch(data.matches[0]);
          }
        }
      })
      .catch((err) => console.error("Error cross-referencing sports pipeline:", err));
  }, []);
  // Filter conditions based on user navigation matrix selection
  const filteredMatches = matches.filter((m) => {
    if (activeTab === 'live') return m.status === 'LIVE';
    if (activeTab === 'upcoming') return m.status === 'UPCOMING';
    if (activeTab === 'results') return m.status === 'FT';
    return false;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Top Header */}
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

        {/* Left Column: SofaScore Style Fixture Schedule Center */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">

          {/* High Density Navigation Hub */}
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

          {/* List Renderer Frame */}
          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
            {activeTab !== 'teams' ? (
              filteredMatches.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono text-center p-8 bg-[#0B1121] rounded-xl border border-white/5">No active fixtures in this matrix index.</div>
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

        {/* Right Column: Dynamic Deep Analytics Framework */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">

          {/* Render Team Profile Card if Teams Directory is Active */}
          {activeTab === 'teams' && selectedTeam ? (
            <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
              <div className="flex items-center gap-4 mb-6">
                <span className="text-6xl p-4 bg-slate-900 rounded-2xl border border-white/5 shadow-inner">{selectedTeam.logo}</span>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">{selectedTeam.name}</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedTeam.country} • Founded in {selectedTeam.founded}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                <div className="bg-slate-900/40 border border-white/5 p-4 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Home Arena</span>
                  <span className="text-sm font-bold text-slate-200">{selectedTeam.stadium}</span>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-4 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Current Form Factor</span>
                  <div className="flex gap-1.5 mt-1">
                    {selectedTeam.form.map((f, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center font-mono ${f === 'W' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : f === 'D' ? 'bg-slate-500/20 text-slate-400 border border-white/10' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : selectedMatch ? (
            <>
              {/* Match Score Hero Display */}
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
                    {selectedMatch.status === 'LIVE' && <span className="text-red-500 text-[11px] font-mono font-bold mt-2 animate-pulse">{selectedMatch.minute}' Mins</span>}
                  </div>
                  <div className="flex flex-col items-center gap-3 w-1/3">
                    <span className="text-5xl">| {selectedMatch.awayTeam.logo}</span>
                    <span className="text-base font-black text-white">{selectedMatch.awayTeam.name}</span>
                  </div>
                </div>
              </div>

              {/* Neural Predictive Analytics Matrix */}
              <AIPredictor match={selectedMatch} />
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default App;