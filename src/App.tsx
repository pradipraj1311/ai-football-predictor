import React, { useState, useEffect } from 'react';
import { MatchCard } from './components/MatchCard';
import { AIPredictor } from './components/AIPredictor';
import { StandingsGrid } from './components/StandingsGrid';
import { Match } from './types';
import { BrainCircuit, Activity, Globe, Radar } from 'lucide-react';

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(true);

  useEffect(() => {
    // 1. Function to fetch data
    const fetchLiveMatches = () => {
      fetch('/api/live-matches')
        .then((res) => res.json())
        .then((data) => {
          if (data.matches && data.matches.length > 0) {
            setMatches(data.matches);

            // Only set the selected match initially, don't overwrite user selection on polling updates
            setSelectedMatch((prevSelected) => {
              if (!prevSelected) return data.matches[0];

              // Find the updated version of the currently selected match to update scores
              const updatedSelected = data.matches.find((m: Match) => m.id === prevSelected.id);
              return updatedSelected || prevSelected;
            });
          }
        })
        .catch((err) => console.error("Error capturing live fixture grid:", err))
        .finally(() => setLoadingMatches(false));
    };

    // 2. Initial fetch on load
    fetchLiveMatches();

    // 3. Set up the polling interval (every 60 seconds)
    const POLLING_INTERVAL_MS = 60000;
    const intervalId = setInterval(fetchLiveMatches, POLLING_INTERVAL_MS);

    // 4. Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
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

      <main className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Fixture Column */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Live Fixtures</h2>
          </div>
          <div className="flex flex-col gap-2">
            {loadingMatches ? (
              <div className="text-xs text-slate-500 font-mono p-4 animate-pulse">Interrogating live wire...</div>
            ) : (
              matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  isSelected={selectedMatch?.id === match.id}
                  onSelect={() => setSelectedMatch(match)}
                />
              ))
            )}
          </div>
          <div className="mt-4">
            <StandingsGrid />
          </div>
        </div>

        {/* Right Intelligence Column */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
          {selectedMatch ? (
            <>
              {/* Match Header Hero */}
              <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase">{selectedMatch.competition}</span>
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

              {/* Dynamic Predictor Grid combining Forecast + Fantasy */}
              <AIPredictor match={selectedMatch} />
            </>
          ) : (
            <div className="text-sm font-mono text-slate-500">Select an active fixture tracking frame...</div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;