import React, { useState, useEffect, useRef } from 'react';
import { MatchCard } from './components/MatchCard';
import { AIPredictor } from './components/AIPredictor';
import { LiveTelemetry } from './components/LiveTelemetry';
import { StandingsGrid } from './components/StandingsGrid';
import { PlayerProps } from './components/PlayerProps';
import { TriviaQuiz } from './components/TriviaQuiz';
import { NewsTicker } from './components/NewsTicker';
import { Match } from './types';
import FanPoll from './components/FanPoll';
import { H2HMatrix } from './components/H2HMatrix';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { GLOBAL_TEAMS_DIRECTORY, WORLD_CUP_STANDINGS, FootballTeamProfile } from './data';
import { BrainCircuit, Shield, Calendar, History, Globe, Coins, CloudRain, Thermometer, BellRing, Target, ListOrdered, Activity, Trophy } from 'lucide-react';
import { Analytics } from '@vercel/analytics/nuxt/runtime';

function App() {

  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [standings, setStandings] = useState(WORLD_CUP_STANDINGS);
  const [selectedTeam, setSelectedTeam] = useState<FootballTeamProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'UPCOMING' | 'FINISHED' | 'TEAMS' | 'STANDINGS'>('LIVE');
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [showProps, setShowProps] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

  const [userLocation, setUserLocation] = useState('Global');
  const [sportName, setSportName] = useState('Football');
  const [alerts, setAlerts] = useState<any[]>([]);
  const previousMatchesRef = useRef<Match[]>([]);

  useEffect(() => {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserLocation(timeZone);
      if (timeZone.includes('America') || timeZone.includes('Australia')) {
        setSportName('Soccer');
      } else {
        setSportName('Football');
      }
    } catch (e) {
      console.warn("Could not determine user location");
    }
  }, []);

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

  // NEW: Intelligent Data Pipeline (DB + RapidAPI)
  useEffect(() => {
    const fetchAllMatches = async () => {
      try {
        console.log("Fetching matches from DB..."); // Debugging log
        // 1. Fetch from Database (Added timestamp to bypass aggressive browser caching)
        const dbRes = await fetch(`/api/db-matches?t=${Date.now()}`);
        if (!dbRes.ok) throw new Error("Failed to fetch DB matches");
        const dbData = await dbRes.json();

        // Determine status on the frontend based on local time (Bulletproof Version)
        const dbMatches = (dbData.matches || []).map((m: any) => {
          if (m.dbStatus === 'FINISHED') return { ...m, status: 'FINISHED', time: 'FT' };

          let calculatedStatus = 'UPCOMING';
          let displayTime = m.time;

          try {
            // Safely parse "HH:MM"
            if (m.time && m.time.includes(':')) {
              const [hours, minutes] = m.time.split(':').map(Number);

              // Create a date object in the USER's local timezone based on the DB date
              const matchDateObj = new Date(m.date);

              // Define the offset. IST is UTC+5:30 (330 minutes)
              const istOffsetMinutes = 330;
              // Get the user's local offset in minutes
              const localOffsetMinutes = -matchDateObj.getTimezoneOffset();

              // Calculate the difference
              const offsetDifference = localOffsetMinutes - istOffsetMinutes;

              // Apply the hours/minutes from the database, then adjust for the timezone difference
              matchDateObj.setHours(hours, minutes + offsetDifference, 0, 0);

              const now = new Date(); // User's current local time
              const twoHoursInMillis = 120 * 60000;

              // Logic check
              if (now.getTime() >= matchDateObj.getTime() && now.getTime() < (matchDateObj.getTime() + twoHoursInMillis)) {
                calculatedStatus = 'LIVE';
              } else if (now.getTime() >= (matchDateObj.getTime() + twoHoursInMillis)) {
                calculatedStatus = 'FINISHED';
                displayTime = 'FT';
              }
            }
          } catch (e) {
            console.error("Time parsing error for match:", m.id, e);
          }

          return { ...m, status: calculatedStatus, time: displayTime };
        });
        console.log("DB Matches loaded with robust local timezone status:", dbMatches.length);

        // 2. Fetch from Live API
        console.log("Fetching live matches from API..."); // Debugging log
        const liveRes = await fetch(`/api/live-matches?t=${Date.now()}`);
        let liveMatches = [];
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          liveMatches = liveData.matches || [];
        }
        console.log("Live Matches loaded:", liveMatches.length); // Debugging log

        // 3. Combine them intelligently
        // Remove any DB match that is currently LIVE according to the external API to avoid duplicates
        const liveIds = liveMatches.map((m: Match) => m.id);
        const nonLiveDbMatches = dbMatches.filter((m: Match) => !liveIds.includes(m.id));

        const combinedMatches = [...liveMatches, ...nonLiveDbMatches];

        console.log("Total Combined Matches:", combinedMatches.length); // Debugging log

        // State Update
        setMatches(combinedMatches);

        // --- NEW: DYNAMIC STANDINGS ENGINE ---
        let newStandings = JSON.parse(JSON.stringify(WORLD_CUP_STANDINGS));

        // Safely extract all matches that actually have scores to calculate
        const validMatchesToCalculate = combinedMatches.filter((m: Match) =>
          (m.status === 'FINISHED' || m.status === 'LIVE') &&
          m.homeScore !== undefined &&
          m.awayScore !== undefined &&
          (m.competition.toLowerCase().includes('world cup') || m.competition === 'FIFA World Cup 2026')
        );

        validMatchesToCalculate.forEach((m: Match) => {
          // 🚨 FIX: Force scores to be numbers, default to 0 if missing/null
          const homeScore = Number(m.homeScore) || 0;
          const awayScore = Number(m.awayScore) || 0;
          const homeName = typeof m.homeTeam === 'object' ? m.homeTeam.name.toLowerCase() : m.homeTeam.toLowerCase();
          const awayName = typeof m.awayTeam === 'object' ? m.awayTeam.name.toLowerCase() : m.awayTeam.toLowerCase();

          newStandings.forEach((group: any) => {
            group.entries.forEach((team: any) => {
              // Safe name matching (bypasses 3-letter code mismatches)
              const isHome = team.teamName.toLowerCase().includes(homeName) || homeName.includes(team.teamName.toLowerCase());
              const isAway = team.teamName.toLowerCase().includes(awayName) || awayName.includes(team.teamName.toLowerCase());

              if (isHome || isAway) {
                team.played += 1;
                if (isHome) {
                  team.goalsFor += homeScore;
                  team.goalsAgainst += awayScore;
                  if (homeScore > awayScore) { team.win += 1; team.points += 3; }
                  else if (homeScore < awayScore) { team.lose += 1; }
                  else { team.draw += 1; team.points += 1; }
                }
                if (isAway) {
                  team.goalsFor += awayScore;
                  team.goalsAgainst += homeScore;
                  if (awayScore > homeScore) { team.win += 1; team.points += 3; }
                  else if (awayScore < homeScore) { team.lose += 1; }
                  else { team.draw += 1; team.points += 1; }
                }
                // 🚨 FIX: Ensure GD is a valid number before moving on
                team.gd = (team.goalsFor || 0) - (team.goalsAgainst || 0);
              }
            });
          });
        });

        // 3. Sort and Rank the Groups
        newStandings.forEach((group: any) => {
          group.entries.sort((a: any, b: any) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.gd - a.gd; // Sort by Goal Difference if points are tied
          });

          group.entries.forEach((team: any, idx: number) => {
            team.rank = idx + 1;
            // Safe formatting for GD
            const validGd = Number(team.gd) || 0;
            team.gd = validGd > 0 ? `+${validGd}` : `${validGd}`;
          });
        });

        setStandings(newStandings);

        // Goal Tracking Logic
        const newAlerts: any[] = [];
        liveMatches.forEach((newMatch: any) => {
          const oldMatch = previousMatchesRef.current.find(m => m.id === newMatch.id);
          if (oldMatch) {
            if (newMatch.homeScore > oldMatch.homeScore) {
              newAlerts.push({ id: Date.now(), matchName: `${newMatch.homeTeam.code} v ${newMatch.awayTeam.code}`, message: `GOAL! ${newMatch.homeTeam.name} [${newMatch.homeScore}] - ${newMatch.awayScore}`, minute: newMatch.minute });
            }
          }
        });

        if (newAlerts.length > 0) {
          setAlerts(prev => [...prev, ...newAlerts]);
          setTimeout(() => setAlerts(prev => prev.filter(a => !newAlerts.map(n => n.id).includes(a.id))), 6000);
        }

        previousMatchesRef.current = liveMatches;

        // Smart Selection Logic
        setSelectedMatch(prev => {
          if (!prev) {
            // Default selection: Try to pick a live match first, if none, pick an upcoming one
            return combinedMatches.find((m: Match) => m.status === 'LIVE') ||
              combinedMatches.find((m: Match) => m.status === 'UPCOMING') ||
              combinedMatches[0];
          }
          return combinedMatches.find((m: Match) => m.id === prev.id) || prev;
        });

      } catch (err) {
        console.error("Pipeline Error:", err);
      }
    };

    fetchAllMatches();
    const interval = setInterval(fetchAllMatches, 60000);
    return () => clearInterval(interval);
  }, []);

  const triggerTestGoal = () => {
    const testAlert = { id: Date.now(), matchName: "ARG v BRA", message: "GOAL! Argentina [1] - 0 Brazil", minute: 42 };
    setAlerts(prev => [...prev, testAlert]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== testAlert.id)), 6000);
  };

  // SOFASCORE STYLE TAB FILTERING
  const filteredMatches = matches.filter((m) => {
    if (activeTab === 'LIVE') return m.status === 'LIVE';
    if (activeTab === 'UPCOMING') return m.status === 'UPCOMING';
    if (activeTab === 'FINISHED') return m.status === 'FINISHED';
    return false;
  });

  const path = window.location.pathname;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; } @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } .animate-slide-in { animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }`}</style>

      <NewsTicker />

      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight leading-none">E2match<span className="text-indigo-400">.ai</span></h1>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-1">Live Intelligence</p>
            </div>
          </a>

          {/* Premium Navbar Buttons - Top Left */}
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/10 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
            <button onClick={triggerTestGoal} className="text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg uppercase tracking-widest transition-all flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5" /> Alerts</button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={() => document.getElementById('fan-poll')?.scrollIntoView({ behavior: 'smooth' })} className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Fan Poll</button>
            <button onClick={() => setShowQuiz(true)} className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-indigo-500/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" /> Trivia Quiz</button>
            <button onClick={() => setShowProps(true)} className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Player Props</button>
          </div>
        </div>

        {/* Mobile fallback buttons (Icons only to save space) */}
        <div className="lg:hidden flex items-center gap-1.5">
          <button onClick={triggerTestGoal} className="text-slate-400 bg-white/5 border border-white/10 p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors" aria-label="Alerts"><BellRing className="w-4 h-4" /></button>
          <button onClick={() => setShowQuiz(true)} className="text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 p-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors" aria-label="Trivia Quiz"><BrainCircuit className="w-4 h-4" /></button>
          <button onClick={() => setShowProps(true)} className="text-amber-400 bg-amber-500/10 border border-amber-500/20 p-1.5 rounded-lg hover:bg-amber-500/20 transition-colors" aria-label="Player Props"><Coins className="w-4 h-4" /></button>
          <button onClick={() => document.getElementById('fan-poll')?.scrollIntoView({ behavior: 'smooth' })} className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg uppercase tracking-widest flex items-center gap-1.5 transition-colors"><Trophy className="w-3.5 h-3.5" /> Poll</button>
        </div>
      </nav>
      {path === '/privacy-policy' ? (
        <PrivacyPolicy />
      ) : path === '/terms-of-service' ? (
        <TermsOfService />
      ) : (
        <main className="max-w-[1600px] mx-auto p-4 md:p-6 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative min-h-screen">
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 sticky top-24">
            <div className="bg-[#0B1121] border border-white/5 p-1.5 rounded-xl grid grid-cols-5 gap-1 text-center">
              <button onClick={() => { setActiveTab('LIVE'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'LIVE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Live</button>
              <button onClick={() => { setActiveTab('UPCOMING'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'UPCOMING' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><Calendar className="w-3 h-3" /> Upcoming</button>
              <button onClick={() => { setActiveTab('FINISHED'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'FINISHED' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><History className="w-3 h-3" /> Results</button>
              <button onClick={() => { setActiveTab('STANDINGS'); setSelectedTeam(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'STANDINGS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><ListOrdered className="w-3 h-3" /> Table</button>
              <button onClick={() => { setActiveTab('TEAMS'); setSelectedTeam(GLOBAL_TEAMS_DIRECTORY[0]); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'TEAMS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><Shield className="w-3 h-3" /> Teams</button>
            </div>

            <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
              {activeTab === 'STANDINGS' ? (
                <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-6 text-center shadow-inner flex flex-col items-center justify-center min-h-[300px]">
                  <Globe className="w-12 h-12 text-indigo-400 mb-4 animate-[spin_10s_linear_infinite]" />
                  <h4 className="text-sm font-black text-white uppercase tracking-widest mb-2">Global Group Stage</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">The top two teams from each group, along with the eight best third-placed teams, will advance to the Round of 32.</p>
                </div>
              ) : activeTab !== 'TEAMS' ? (
                filteredMatches.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center p-8 bg-[#0B1121] rounded-xl border border-white/5 flex flex-col items-center gap-2">
                    <span className="text-2xl">⚽</span><span className="font-bold">No Matches Right Now.</span>
                  </div>
                ) : (
                  filteredMatches.map((match, index) => (
                    <div key={match.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                      <MatchCard
                        match={match}
                        isSelected={selectedMatch?.id === match.id && !selectedTeam}
                        onSelect={() => {
                          setSelectedMatch(match);
                          setSelectedTeam(null);
                          // 🚨 ADDED: Smooth scroll for mobile users
                          setTimeout(() => {
                            document.getElementById('ai-analysis-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }}
                      />
                    </div>
                  ))
                )
              ) : (
                GLOBAL_TEAMS_DIRECTORY.map((team, index) => (
                  <div key={team.id} onClick={() => setSelectedTeam(team)} className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all animate-fade-in-up ${selectedTeam?.id === team.id ? 'bg-gradient-to-r from-indigo-950/40 to-[#0B1121] border-indigo-500/50' : 'bg-[#0B1121] border-white/5 hover:border-indigo-500/30'}`} style={{ animationDelay: `${index * 30}ms` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{team.logo || '⚽'}</span>
                      <span className="text-xs font-bold text-white">{team.name}</span>
                    </div>
                    <span className="text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded">{team.code}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6" id="ai-analysis-section">
            {activeTab === 'STANDINGS' ? (
              <StandingsGrid standings={standings} />
            ) : activeTab === 'TEAMS' && selectedTeam ? (
              <div className="flex flex-col gap-6">
                <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
                  <div className="flex items-center gap-4 mb-6 relative z-10">
                    <span className="text-6xl p-4 bg-slate-900 rounded-2xl border border-white/5 shadow-inner">{selectedTeam.logo || '⚽'}</span>
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tight">{selectedTeam.name}</h2>
                      <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">{selectedTeam.country} • Founded in {selectedTeam.founded}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 shadow-xl">
                    <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest uppercase mb-4"><Activity className="w-4 h-4 text-emerald-400" /> Form Analytics</h4>
                    <div className="flex gap-2">
                      {selectedTeam.form.map((f, i) => (
                        <span key={i} className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center font-mono ${f === 'W' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : f === 'D' ? 'bg-slate-500/20 text-slate-400 border border-white/10' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>{f}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedMatch ? (
              <>
                <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">{selectedMatch.competition}</span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded border ${selectedMatch.status === 'LIVE' ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' : selectedMatch.status === 'UPCOMING' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/5 text-slate-400 border-white/10'}`}>{selectedMatch.status}</span>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center justify-center gap-3 w-1/3 text-center">
                      <span className="text-4xl">{selectedMatch.homeTeam?.logo || '⚽'}</span>
                      <span className="text-lg font-black text-white">{selectedMatch.homeTeam?.name}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center w-1/3">
                      {selectedMatch.status === 'LIVE' || selectedMatch.status === 'FINISHED' ? (
                        <div className="flex items-center gap-4 text-5xl font-black text-white font-mono">
                          <span>{selectedMatch.homeScore}</span><span className="text-slate-600 pb-2">-</span><span>{selectedMatch.awayScore}</span>
                        </div>
                      ) : (
                        <div className="text-xl font-mono font-black text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-4 py-1.5 rounded-xl tracking-wider">{selectedMatch.time}</div>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-3 w-1/3 text-center">
                      <span className="text-4xl">{selectedMatch.awayTeam?.logo || '⚽'}</span>
                      <span className="text-lg font-black text-white">{selectedMatch.awayTeam?.name}</span>
                    </div>
                  </div>
                  <div className="flex gap-4 justify-center mt-6 pt-6 border-t border-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Thermometer className="w-3.5 h-3.5 text-red-400" /> Temp: 24°C (Optimal)</div>
                  </div>
                </div>
                <AIPredictor match={selectedMatch} />
                {(selectedMatch.status === 'LIVE' || selectedMatch.status === 'FINISHED') && (
                  <>
                    <LiveTelemetry match={selectedMatch} />
                    <H2HMatrix match={selectedMatch} />
                  </>
                )}
              </>
            ) : (
              <div className="text-center mt-20 text-slate-500">
                <Globe className="w-16 h-16 text-indigo-500/20 mx-auto mb-4 animate-[spin_10s_linear_infinite]" />
                <h2 className="text-3xl font-black text-white mb-2">FIFA World Cup 2026™</h2>
                <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full uppercase tracking-widest border border-indigo-500/20 mb-6 inline-block">System Info: {userLocation} ({sportName})</span>
              </div>
            )}

            {/* Global Fan Poll Section with ID for smooth scrolling */}
            <div id="fan-poll" className="mt-8 scroll-mt-24">
              <FanPoll />
            </div>
          </div>
        </main>
      )}

      <footer className="w-full bg-[#030712] border-t border-slate-800 py-6 mt-auto text-center text-sm text-slate-500">
        <p>© 2026 E2match.ai. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="/privacy-policy" className="hover:text-blue-400">Privacy Policy</a>
          <a href="/terms-of-service" className="hover:text-blue-400">Terms of Service</a>
        </div>
      </footer>

      {/* TOASTS */}
      <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-3 pointer-events-none">
        {alerts.map(alert => (
          <div key={alert.id} className="bg-[#0B1121] border border-emerald-500/50 p-4 rounded-2xl shadow-[0_10px_40px_rgba(16,185,129,0.3)] flex gap-4 items-center animate-slide-in pointer-events-auto">
            <div className="bg-emerald-500/20 p-2.5 rounded-full border border-emerald-500/30"><Target className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest block mb-0.5">{alert.matchName} • {alert.minute}'</span>
              <span className="text-sm font-black text-white tracking-wide">{alert.message}</span>
            </div>
          </div>
        ))}
      </div>

      {showProps && <PlayerProps onClose={() => setShowProps(false)} />}
      {showQuiz && <TriviaQuiz onClose={() => setShowQuiz(false)} />}

    </div>
  );
}

export default App;