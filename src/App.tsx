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
import { BrainCircuit, Shield, Calendar, History, Globe, Coins, CloudRain, Thermometer, BellRing, Target, ListOrdered, Activity, Trophy, Play, Youtube } from 'lucide-react';

function App() {

  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [dynamicStandings, setDynamicStandings] = useState<Record<string, any>>({ 'FIFA World Cup 2026': WORLD_CUP_STANDINGS });
  const [selectedTournament, setSelectedTournament] = useState<string>('FIFA World Cup 2026');
  const [selectedTeam, setSelectedTeam] = useState<FootballTeamProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'UPCOMING' | 'FINISHED' | 'TEAMS' | 'STANDINGS'>('LIVE');
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [showProps, setShowProps] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [resultFilter, setResultFilter] = useState('');

  const [userLocation, setUserLocation] = useState('Global');
  const [sportName, setSportName] = useState('Football');
  const [alerts, setAlerts] = useState<any[]>([]);
  const previousMatchesRef = useRef<Match[]>([]);
  const finishedMatchesRef = useRef<Match[]>([]);
  const highlightMatchIdsRef = useRef<Set<string>>(new Set());
  const initialLoadCompleteRef = useRef<boolean>(false);

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
        let dbData = { matches: [] };
        try {
          const dbRes = await fetch(`/api/db-matches?t=${Date.now()}`);
          if (dbRes.ok) {
            dbData = await dbRes.json();
          } else {
            console.warn(`DB Fetch failed with status: ${dbRes.status}`);
          }
        } catch (e) {
          console.warn("DB Fetch network error:", e);
        }

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

        // 2. Fetch from Live API
        const liveRes = await fetch(`/api/live-matches?t=${Date.now()}`);
        let liveMatches: any[] = [];
        let isLiveFetchSuccess = false;
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          liveMatches = liveData.matches || [];
          isLiveFetchSuccess = !liveData.warning;
        }

        // Preserve highlight IDs from the DB for finished matches that also appear in the live feed
        const dbMatchById = new Map((dbMatches as any[]).map((m: any) => [m.id, m]));
        liveMatches = liveMatches.map((liveMatch: any) => {
          const dbMatch = dbMatchById.get(liveMatch.id);
          if (dbMatch?.youtubeHighlightId) {
            return { ...liveMatch, youtubeHighlightId: dbMatch.youtubeHighlightId };
          }
          return liveMatch;
        });

        // --- NEW: Preserve finished matches from live API ---
        liveMatches.forEach((m: Match) => {
          if (m.status === 'FINISHED') {
            const existingIdx = finishedMatchesRef.current.findIndex(fm => fm.id === m.id);
            if (existingIdx >= 0) {
              finishedMatchesRef.current[existingIdx] = m;
            } else {
              finishedMatchesRef.current.push(m);
            }
          }
        });

        // --- NEW: Handle matches that drop off the live feed ---
        // Live APIs often remove matches from the "live" feed immediately after they finish.
        // If a match was LIVE but is now missing (and the API request was successful), assume it has FINISHED.
        if (isLiveFetchSuccess) {
          const currentLiveIds = new Set(liveMatches.map((m: Match) => m.id));
          previousMatchesRef.current.forEach((prevMatch: Match) => {
            if (!currentLiveIds.has(prevMatch.id) && prevMatch.status === 'LIVE') {
              const existingIdx = finishedMatchesRef.current.findIndex(fm => fm.id === prevMatch.id);
              const finishedMatch: Match = { ...prevMatch, status: 'FINISHED', time: 'FT' };
              if (existingIdx >= 0) {
                finishedMatchesRef.current[existingIdx] = finishedMatch;
              } else {
                finishedMatchesRef.current.push(finishedMatch);
              }
            }
          });
        }

        // 3. Combine them intelligently
        const liveIds = liveMatches.map((m: Match) => m.id);
        const finishedLiveIds = finishedMatchesRef.current.map((m: Match) => m.id);

        const nonLiveDbMatches = dbMatches.filter((m: Match) => !liveIds.includes(m.id) && !finishedLiveIds.includes(m.id));
        const persistentFinishedMatches = finishedMatchesRef.current.filter((m: Match) => !liveIds.includes(m.id));

        const combinedMatches = [...liveMatches, ...persistentFinishedMatches, ...nonLiveDbMatches];

        // State Update
        setMatches(combinedMatches);

        // --- FIXED: Highlight discovery alert flood ---
        const newHighlightMatches = combinedMatches.filter((m: Match) =>
          m.status === 'FINISHED' &&
          m.youtubeHighlightId &&
          !highlightMatchIdsRef.current.has(m.id)
        );

        // Only trigger popups for newly discovered highlights AFTER the initial load
        if (initialLoadCompleteRef.current) {
          newHighlightMatches.forEach((m) => {
            const matchName = `${typeof m.homeTeam === 'object' ? m.homeTeam.name : m.homeTeam} vs ${typeof m.awayTeam === 'object' ? m.awayTeam.name : m.awayTeam}`;
            const alertId = Date.now() + Math.random();
            setAlerts(prev => [
              ...prev,
              {
                id: alertId,
                matchName,
                message: 'New match highlight available! Tap to watch.',
                minute: 'HIGHLIGHT',
                onClick: () => {
                  setSelectedMatch(m);
                  setActiveTab('FINISHED');
                  setTimeout(() => document.getElementById('match-highlights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
                }
              }
            ]);
            setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== alertId)), 5000);
          });
        }

        // Always track the IDs so we don't alert them later
        newHighlightMatches.forEach(m => highlightMatchIdsRef.current.add(m.id));
        initialLoadCompleteRef.current = true;


        // --- NEW: FULLY DYNAMIC TOURNAMENT STANDINGS ENGINE ---
        let newDynamicStandings: Record<string, any[]> = {
          'FIFA World Cup 2026': JSON.parse(JSON.stringify(WORLD_CUP_STANDINGS))
        };

        const normalizeCompetitionName = (compName: string) => {
          const name = String(compName || '').trim();
          const lower = name.toLowerCase();
          if (lower.includes('world cup')) return 'FIFA World Cup 2026';
          if (lower.includes('champions league')) return 'UEFA Champions League';
          if (lower.includes('euros') || lower.includes('european championship')) return 'UEFA European Championship';
          return name || 'Other Competitions';
        };

        const validMatchesToCalculate = combinedMatches.filter((m: Match) => {
          const isFinishedMatch = m.status === 'FINISHED' || m.status === 'FT' || m.status === 'ENDED' || m.status === 'CLOSED';
          return (isFinishedMatch || m.status === 'LIVE') &&
            m.homeScore !== undefined &&
            m.awayScore !== undefined;
        });

        // Only track standings for these specific tournaments to prevent random temporary tables
        const TRACKED_TOURNAMENTS = ['FIFA World Cup 2026', 'UEFA Champions League'];

        validMatchesToCalculate.forEach((m: Match) => {
          const comp = normalizeCompetitionName(m.competition || 'Other Competitions');
          
          if (!TRACKED_TOURNAMENTS.includes(comp)) return;

          const homeScore = Number(m.homeScore) || 0;
          const awayScore = Number(m.awayScore) || 0;

          const homeNameStr = typeof m.homeTeam === 'object' ? (m.homeTeam?.name || 'Home') : String(m.homeTeam || 'Home');
          const awayNameStr = typeof m.awayTeam === 'object' ? (m.awayTeam?.name || 'Away') : String(m.awayTeam || 'Away');
          const homeCode = typeof m.homeTeam === 'object' ? m.homeTeam?.code : homeNameStr.substring(0, 3).toUpperCase();
          const awayCode = typeof m.awayTeam === 'object' ? m.awayTeam?.code : awayNameStr.substring(0, 3).toUpperCase();
          const homeLogo = typeof m.homeTeam === 'object' ? m.homeTeam?.logo : '⚽';
          const awayLogo = typeof m.awayTeam === 'object' ? m.awayTeam?.logo : '⚽';

          const findOrCreateTeam = (teamName: string, code: string, logo: string) => {
            let foundTeam: any = null;
            newDynamicStandings[comp].forEach(group => {
              const t = group.entries.find((e: any) =>
                e.teamName.toLowerCase().includes(teamName.toLowerCase()) ||
                teamName.toLowerCase().includes(e.teamName.toLowerCase())
              );
              if (t) foundTeam = t;
            });
            if (!foundTeam) {
              foundTeam = { rank: 0, teamName, code: code || 'UNK', logo: logo || '⚽', played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, gd: 0, points: 0 };
              newDynamicStandings[comp][0].entries.push(foundTeam);
            }
            return foundTeam;
          };

          const hTeam = findOrCreateTeam(homeNameStr, homeCode, homeLogo);
          const aTeam = findOrCreateTeam(awayNameStr, awayCode, awayLogo);

          hTeam.played += 1;
          hTeam.goalsFor += homeScore;
          hTeam.goalsAgainst += awayScore;
          if (homeScore > awayScore) { hTeam.win += 1; hTeam.points += 3; }
          else if (homeScore < awayScore) { hTeam.lose += 1; }
          else { hTeam.draw += 1; hTeam.points += 1; }
          hTeam.gd = hTeam.goalsFor - hTeam.goalsAgainst;

          aTeam.played += 1;
          aTeam.goalsFor += awayScore;
          aTeam.goalsAgainst += homeScore;
          if (awayScore > homeScore) { aTeam.win += 1; aTeam.points += 3; }
          else if (awayScore < homeScore) { aTeam.lose += 1; }
          else { aTeam.draw += 1; aTeam.points += 1; }
          aTeam.gd = aTeam.goalsFor - aTeam.goalsAgainst;
        });

        // 3. Sort and Rank the Groups
        Object.keys(newDynamicStandings).forEach(comp => {
          newDynamicStandings[comp].forEach((group: any) => {
            group.entries.sort((a: any, b: any) => {
              if (b.points !== a.points) return b.points - a.points;
              return Number(b.gd) - Number(a.gd);
            });
            group.entries.forEach((team: any, idx: number) => {
              team.rank = idx + 1;
              const validGd = Number(team.gd) || 0;
              team.gd = validGd > 0 ? `+${validGd}` : `${validGd}`;
            });
          });
        });

        setDynamicStandings(newDynamicStandings);

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
          setTimeout(() => setAlerts(prev => prev.filter(a => !newAlerts.map(n => n.id).includes(a.id))), 4000);
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
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== testAlert.id)), 4000);
  };

  const handleGlobalHighlightsClick = () => {
    const firstHighlightMatch = matches.find((m) => m.status === 'FINISHED' && !!m.youtubeHighlightId);
    if (firstHighlightMatch) {
      setSelectedMatch(firstHighlightMatch);
      setSelectedTeam(null);
      setActiveTab('FINISHED');
      setTimeout(() => document.getElementById('match-highlights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } else {
      setActiveTab('FINISHED');
    }
  };

  // SOFASCORE STYLE TAB FILTERING
  const filteredMatches = matches.filter((m) => {
    if (!m) return false; // Guard against null matches
    const isFinishedStatus = m.status === 'FINISHED' || m.status === 'FT' || m.status === 'ENDED' || m.status === 'CLOSED';
    if (activeTab === 'LIVE') return m.status === 'LIVE';
    if (activeTab === 'UPCOMING') return m.status === 'UPCOMING';
    if (activeTab === 'FINISHED') {
      if (!isFinishedStatus) return false;
      if (resultFilter) {
        const search = resultFilter.toLowerCase();

        // Bulletproof string extraction
        const homeName = typeof m.homeTeam === 'object' ? (m.homeTeam?.name || '') : String(m.homeTeam || '');
        const awayName = typeof m.awayTeam === 'object' ? (m.awayTeam?.name || '') : String(m.awayTeam || '');
        const compName = String(m.competition || '');

        return homeName.toLowerCase().includes(search) ||
          awayName.toLowerCase().includes(search) ||
          compName.toLowerCase().includes(search);
      }
      return true;
    }
    return false;
  });

  const highlightMatches = matches.filter((m) => m.status === 'FINISHED' && !!m.youtubeHighlightId);

  const sortedFilteredMatches = activeTab === 'FINISHED'
    ? [...filteredMatches.filter((m) => !!m.youtubeHighlightId), ...filteredMatches.filter((m) => !m.youtubeHighlightId)]
    : filteredMatches;

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
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-1">Live match insights for every game</p>
            </div>
          </a>

          {/* Premium Navbar Buttons - Top Left */}
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/10 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
            {/* NEW: Global Highlights Button */}
            <button onClick={handleGlobalHighlightsClick} className="text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5" /> Highlights</button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={triggerTestGoal} className="text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg uppercase tracking-widest transition-all flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5" /> Alerts</button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={() => document.getElementById('fan-poll')?.scrollIntoView({ behavior: 'smooth' })} className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Fan Poll</button>
            <button onClick={() => setShowQuiz(true)} className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-indigo-500/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" /> Trivia Quiz</button>
            <button onClick={() => setShowProps(true)} className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Player Props</button>
          </div>
        </div>

        {/* Mobile fallback buttons (Icons only to save space) */}
        <div className="lg:hidden flex items-center gap-1.5">
          <button onClick={handleGlobalHighlightsClick} className="text-red-400 bg-red-500/10 border border-red-500/20 p-1.5 rounded-lg hover:bg-red-500/20 transition-colors" aria-label="Highlights"><Youtube className="w-4 h-4" /></button>
          <button onClick={triggerTestGoal} className="text-slate-400 bg-white/5 border border-white/10 p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors" aria-label="Alerts"><BellRing className="w-4 h-4" /></button>
          <button onClick={() => setShowQuiz(true)} className="text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 p-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors" aria-label="Trivia Quiz"><BrainCircuit className="w-4 h-4" /></button>
          <button onClick={() => setShowProps(true)} className="text-amber-400 bg-amber-500/10 border border-amber-500/20 p-1.5 rounded-lg hover:bg-amber-500/20 transition-colors" aria-label="Player Props"><Coins className="w-4 h-4" /></button>
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
              {activeTab === 'FINISHED' && (
                <div className="mb-4 shrink-0 animate-fade-in-up flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="Search finished matches, teams, or competitions"
                    value={resultFilter}
                    onChange={(e) => setResultFilter(e.target.value)}
                    className="w-full bg-[#0B1121] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner"
                  />

                  {/* --- NEW: Smart Filter Quick Action Pills --- */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <button
                      onClick={() => setResultFilter('')}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${!resultFilter ? 'bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-[#0B1121] text-slate-400 border-white/5 hover:bg-white/5'}`}
                    >
                      All Results
                    </button>
                    {Array.from(
                      new Map(
                        matches
                          .filter((m) => m.status === 'FINISHED')
                          .flatMap((m) => {
                            const validTeams: any[] = [];
                            // Ensure homeTeam exists and has a name
                            if (m.homeTeam && (m.homeTeam.name || typeof m.homeTeam === 'string')) {
                              const name = typeof m.homeTeam === 'object' ? m.homeTeam.name : m.homeTeam;
                              validTeams.push([name, m.homeTeam]);
                            }
                            // Ensure awayTeam exists and has a name
                            if (m.awayTeam && (m.awayTeam.name || typeof m.awayTeam === 'string')) {
                              const name = typeof m.awayTeam === 'object' ? m.awayTeam.name : m.awayTeam;
                              validTeams.push([name, m.awayTeam]);
                            }
                            return validTeams;
                          })
                      ).values()
                    ).map((team: any) => {
                      const teamName = typeof team === 'object' ? team.name : team;
                      const teamCode = typeof team === 'object' ? team.code : team?.substring(0, 3).toUpperCase();
                      const teamLogo = typeof team === 'object' ? team.logo : '⚽';

                      return (
                        <button
                          key={teamName || Math.random().toString()}
                          onClick={() => setResultFilter(teamName || '')}
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${resultFilter.toLowerCase() === (teamName || '').toLowerCase() ? 'bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-[#0B1121] text-slate-400 border-white/5 hover:bg-white/5'}`}
                        >
                          <span className="text-sm">{teamLogo || '⚽'}</span> {teamCode || 'UNK'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeTab === 'STANDINGS' ? (
                <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-6 text-center shadow-inner flex flex-col items-center justify-center min-h-[300px]">
                  <Globe className="w-12 h-12 text-indigo-400 mb-4 animate-[spin_10s_linear_infinite]" />
                  <h4 className="text-sm font-black text-white uppercase tracking-widest mb-2">Global Group Stage</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">The top two teams from each group, along with the eight best third-placed teams, will advance to the Round of 32.</p>
                </div>
              ) : activeTab !== 'TEAMS' ? (
                <>
                  {activeTab === 'FINISHED' && highlightMatches.length > 0 && (
                    <div className="bg-red-500/10 border border-red-400/20 rounded-3xl p-4 mb-4 shadow-inner animate-fade-in-up">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5" /> Featured Results</p>
                          <p className="mt-1 text-xs text-slate-300">Matches with official highlights.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {highlightMatches.slice(0, 3).map((match) => (
                            <button
                              key={match.id}
                              onClick={() => {
                                setSelectedMatch(match);
                                setSelectedTeam(null);
                                setTimeout(() => document.getElementById('match-highlights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
                              }}
                              className="rounded-full bg-red-400/10 border border-red-400/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-200 hover:bg-red-500/20 transition flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" /> {typeof match.homeTeam === 'object' ? match.homeTeam.code : String(match.homeTeam).substring(0, 3)} vs {typeof match.awayTeam === 'object' ? match.awayTeam.code : String(match.awayTeam).substring(0, 3)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {sortedFilteredMatches.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center p-8 bg-[#0B1121] rounded-xl border border-white/5 flex flex-col items-center gap-2">
                      <span className="text-2xl">⚽</span><span className="font-bold">No matches here yet.</span>
                    </div>
                  ) : (
                    sortedFilteredMatches.map((match, index) => (
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
                  )}
                </>
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
              <div className="flex flex-col gap-4">
                {/* Tournament Selector Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {Object.keys(dynamicStandings || {}).map(comp => (
                    <button
                      key={comp}
                      onClick={() => setSelectedTournament(comp)}
                      className={`shrink-0 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${selectedTournament === comp ? 'bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-[#0B1121] text-slate-400 border-white/5 hover:bg-white/5'}`}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
                <StandingsGrid standings={dynamicStandings[selectedTournament] || []} />
              </div>
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

                {/* --- NEW: USER-FRIENDLY YOUTUBE HIGHLIGHTS --- */}
                {(selectedMatch as any).youtubeHighlightId && selectedMatch.status === 'FINISHED' && (
                  <div id="match-highlights" className="bg-[#0B1121] border border-white/5 rounded-3xl overflow-hidden shadow-2xl mt-4 animate-fade-in-up">
                    <div className="md:flex md:items-center md:justify-between bg-gradient-to-r from-red-900/20 via-[#0B1121] to-[#0B1121] p-5 border-b border-white/5 gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5" /> Match highlights</p>
                        <h3 className="mt-2 text-lg font-black text-white">Official YouTube highlight</h3>
                      </div>
                      <a
                        href={`https://www.youtube.com/watch?v=${(selectedMatch as any).youtubeHighlightId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-100 hover:bg-red-500/30 hover:scale-105 transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                      >
                        <Play className="w-4 h-4 text-white fill-white" />
                        Watch on YouTube
                      </a>
                    </div>
                    <div className="p-5 flex justify-center">
                      <a 
                        href={`https://www.youtube.com/watch?v=${(selectedMatch as any).youtubeHighlightId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-lg relative bg-black/50 group block cursor-pointer"
                      >
                        <img 
                          src={`https://img.youtube.com/vi/${(selectedMatch as any).youtubeHighlightId}/maxresdefault.jpg`} 
                          alt="Match Highlight Thumbnail" 
                          className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-300"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${(selectedMatch as any).youtubeHighlightId}/hqdefault.jpg`; }}
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center transition-all duration-300">
                           <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.6)] group-hover:scale-110 transition-transform duration-300">
                             <Play className="w-8 h-8 text-white fill-white ml-1" />
                           </div>
                           <span className="mt-4 bg-black/80 text-white text-xs font-bold px-4 py-1.5 rounded-full border border-white/20 backdrop-blur-md shadow-lg text-center">
                             Official FIFA Highlight • Opens in YouTube
                           </span>
                        </div>
                      </a>
                    </div>
                  </div>
                )}

                {selectedMatch.status === 'FINISHED' && !(selectedMatch as any).youtubeHighlightId && (
                  <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-4 text-slate-300 text-sm mt-6">
                    We’re still checking for match highlights. If the game just finished, please refresh in a moment while we find the latest YouTube clip.
                  </div>
                )}

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
                <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full uppercase tracking-widest border border-indigo-500/20 mb-6 inline-block">Watching from {userLocation} ({sportName})</span>
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
          <div
            key={alert.id}
            onClick={() => alert.onClick?.()}
            className={`bg-[#0B1121] border ${alert.onClick ? 'border-amber-500/50 cursor-pointer hover:bg-white/5' : 'border-emerald-500/50'} p-4 rounded-2xl shadow-[0_10px_40px_rgba(16,185,129,0.3)] flex gap-4 items-center animate-slide-in pointer-events-auto`}
          >
            <div className={`p-2.5 rounded-full ${alert.onClick ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}><Target className={`w-6 h-6 ${alert.onClick ? 'text-amber-400' : 'text-emerald-400'}`} /></div>
            <div>
              <span className={`text-[10px] ${alert.onClick ? 'text-amber-300' : 'text-emerald-400'} font-black uppercase tracking-widest block mb-0.5`}>{alert.matchName} • {alert.minute}</span>
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