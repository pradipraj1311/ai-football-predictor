import React, { useState } from 'react';
import { INITIAL_MATCHES, TRANSLATIONS } from './data';
import { MatchCard } from './components/MatchCard';
import { AIPredictor } from './components/AIPredictor';
import { FantasyAdvisor } from './components/FantasyAdvisor';
import { StandingsGrid } from './components/StandingsGrid';
import { Match } from './types';
import { Activity, BrainCircuit, Globe, Radar } from 'lucide-react';

function App() {
  const [selectedMatch, setSelectedMatch] = useState<Match>(INITIAL_MATCHES[0]);
  const labels = TRANSLATIONS.en;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Premium Top Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="w-6 h-6 text-white" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-950 rounded-full animate-pulse"></span>
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">e2match<span className="text-indigo-400">.ai</span></h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-1">Live Intelligence Matrix</p>
          </div>
        </div>
        <div className="hidden md:flex gap-6 text-sm font-semibold text-slate-400">
          <button className="text-white flex items-center gap-2"><Activity className="w-4 h-4 text-red-500" /> Live Scores</button>
          <button className="hover:text-white transition-colors flex items-center gap-2"><Globe className="w-4 h-4" /> Standings</button>
          <button className="hover:text-white transition-colors flex items-center gap-2"><Radar className="w-4 h-4" /> Player Props</button>
        </div>
      </nav>

      {/* Main Split-Pane Architecture */}
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Live Event Feed (Sofascore style) */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Live & Upcoming</h2>
            <span className="text-[10px] font-mono bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 animate-pulse">2 LIVE</span>
          </div>
          <div className="flex flex-col gap-2">
            {INITIAL_MATCHES.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                isSelected={selectedMatch.id === match.id}
                onSelect={() => setSelectedMatch(match)}
              />
            ))}
          </div>
          <div className="mt-4">
            <StandingsGrid />
          </div>
        </div>

        {/* Right Column: Deep AI Analytics */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
          {/* Match Header Hero */}
          <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
            {/* Background Graphic */}
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-6 relative z-10">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase">{selectedMatch.competition} • Round 1</span>
              <span className="text-[10px] font-bold bg-white/5 border border-white/10 px-3 py-1 rounded-full text-slate-300">
                Data synced via RapidAPI
              </span>
            </div>

            <div className="flex items-center justify-between relative z-10">
              <div className="flex flex-col items-center gap-3 w-1/3">
                <span className="text-5xl drop-shadow-lg">{selectedMatch.homeTeam.logo}</span>
                <span className="text-lg font-black text-white">{selectedMatch.homeTeam.name}</span>
              </div>
              
              <div className="flex flex-col items-center justify-center w-1/3">
                {selectedMatch.status === 'LIVE' ? (
                  <>
                    <span className="text-red-500 text-sm font-black animate-pulse mb-1">{selectedMatch.minute}'</span>
                    <div className="flex items-center gap-3 text-5xl font-black text-white font-mono">
                      <span>{selectedMatch.homeScore}</span><span className="text-slate-600 pb-2">-</span><span>{selectedMatch.awayScore}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-black text-slate-300 font-mono tracking-wider">{selectedMatch.time}</div>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 w-1/3">
                <span className="text-5xl drop-shadow-lg">{selectedMatch.awayTeam.logo}</span>
                <span className="text-lg font-black text-white">{selectedMatch.awayTeam.name}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <AIPredictor match={selectedMatch} lang="en" labels={labels} hasApiKey={true} />
            <FantasyAdvisor match={selectedMatch} lang="en" labels={labels} hasApiKey={true} />
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;