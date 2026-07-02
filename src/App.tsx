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
import { LoginPage } from './components/LoginPage';
import { MaintenancePage } from './components/MaintenancePage';
import { TermsOfService } from './components/TermsOfService';
import { WORLD_CUP_STANDINGS, FootballTeamProfile } from './data';
import { BrainCircuit, Shield, Calendar, History, Globe, Coins, Thermometer, BellRing, Target, ListOrdered, Activity, Trophy, Play, Youtube, Swords, LogOut } from 'lucide-react';

// Enhanced data consistency aliases for API responses
const teamNameAliases: { [key: string]: string } = {
  'dr congo': 'congo dr',
  "côte d'ivoire": 'ivory coast',
  "cote d'ivoire": 'ivory coast',
  'usa': 'united states',
  'eng': 'england',
  'ksa': 'saudi arabia',
  'uae': 'united arab emirates',
  'south korea': 'korea republic',
  'korea': 'korea republic',
  'ir iran': 'iran',
  'basake holy stars fc': 'basake holy stars',
  'aduana stars fc': 'aduana stars'
};

function normalizeTeamName(name: string): string {
  if (!name) return '';
  let normalized = name.toLowerCase().trim();
  if (teamNameAliases[normalized]) {
    normalized = teamNameAliases[normalized];
  }
  return normalized.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Define major tournaments with their API IDs for fetching dynamic standings
const majorTournaments: Record<string, { tournamentId: string; seasonId: string } | null> = {
  'Premier League': { tournamentId: '47', seasonId: '0' }, // Mapped to new API's leagueid
  'FIFA World Cup': { tournamentId: '1', seasonId: '0' }, // Mapped to new API's leagueid
  'La Liga': { tournamentId: '148', seasonId: '0' }, // Mapped to new API's leagueid
  'Champions League': { tournamentId: '7', seasonId: '0' }, // Mapped to new API's leagueid
};

/**
 * Processes a flat list of teams from the API into groups for the UI.
 * @param standingsData - The flat array of team standings.
 * @returns An array of group objects, structured for the StandingsGrid component.
 */
const processFetchedStandings = (standingsData: any[]) => {
  if (!standingsData || standingsData.length === 0) return [];

  const groups: Record<string, { groupName: string, entries: any[] }> = {};
  standingsData.forEach(team => {
    const groupName = team.group || 'League Table';
    if (!groups[groupName]) {
      groups[groupName] = { groupName, entries: [] };
    }
    groups[groupName].entries.push(team);
  });

  return Object.values(groups);
};

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  // Start with an empty array for teams, we will fetch it from the backend
  const [teams, setTeams] = useState<FootballTeamProfile[]>([]);

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [dynamicStandings, setDynamicStandings] = useState<Record<string, any>>({});
  const [selectedTournament, setSelectedTournament] = useState<string>('Premier League');
  const [selectedTeam, setSelectedTeam] = useState<FootballTeamProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'UPCOMING' | 'FINISHED' | 'TEAMS' | 'STANDINGS' | 'POLL'>('LIVE');
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'ANALYSIS' | 'TELEMETRY' | 'H2H' | 'HIGHLIGHTS'>('ANALYSIS');
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [showProps, setShowProps] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [resultFilter, setResultFilter] = useState('');
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userLocation, setUserLocation] = useState('Global');
  const [sportName, setSportName] = useState('Football');
  const [alerts, setAlerts] = useState<any[]>([]);

  const [showAll, setShowAll] = useState({
    LIVE: false,
    UPCOMING: false,
    FINISHED: false,
  });
  const INITIAL_MATCH_DISPLAY_LIMIT = 10;

  const previousMatchesRef = useRef<Match[]>([]);
  const lastFetchTimeRef = useRef(0);
  const lastDbFetchTimeRef = useRef(0);
  const dbMatchesRef = useRef<Match[]>([]);
  const combinedMatchesRef = useRef<Match[]>([]);
  const highlightMatchIdsRef = useRef<Set<string>>(new Set());
  const upcomingMatchesApiRef = useRef<Match[]>([]);
  const lastUpcomingFetchTimeRef = useRef(0);
  const initialLoadCompleteRef = useRef<boolean>(false);
  const standingsLoadedRef = useRef<boolean>(false);

  const initialFinishedMatches = () => {
    try {
      const stored = localStorage.getItem('e2match_finished');
      const now = Date.now();
      if (stored) return JSON.parse(stored).filter((m: Match) => m.id !== 'dummy-live-test' && (now - new Date(m.date).getTime()) < 48 * 3600 * 1000);
    } catch (e) { }
    return [];
  };

  const finishedMatchesRef = useRef<Match[]>(initialFinishedMatches());

  // Fetch teams from backend API when component mounts
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const response = await fetch('/api/teams');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            setTeams(data);
          }
        } else {
          console.warn("Could not fetch teams from backend.");
        }
      } catch (error) {
        console.error("Error fetching teams data:", error);
      }
    };
    loadTeams();
  }, []);

  useEffect(() => {
    if (!matches.length) return;
    const selectedCurrent = selectedMatch && matches.find((m) => m.id === selectedMatch.id);

    if (activeAnalysisTab === 'TELEMETRY' && selectedCurrent && selectedCurrent.status !== 'LIVE') {
      setActiveAnalysisTab('H2H');
    }
    // const selectedIsFinished = selectedCurrent && ['FINISHED', 'FT', 'ENDED', 'CLOSED'].includes(selectedCurrent.status);
    // if (selectedIsFinished && activeTab !== 'FINISHED') {
    //   setActiveTab('FINISHED');
    // }
  }, [matches, selectedMatch, activeTab, activeAnalysisTab]);

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

  useEffect(() => {
    const checkInitialStatus = async () => {
      const isAuthenticated = sessionStorage.getItem('is_admin_auth') === 'true';
      setIsAdmin(isAuthenticated);

      try {
        const res = await fetch('/api/maintenance');
        if (res.ok) {
          const data = await res.json();
          setIsMaintenance(data.maintenance);
          localStorage.setItem('maintenance_mode', String(data.maintenance));
        } else {
          const localStatus = localStorage.getItem('maintenance_mode') === 'true';
          setIsMaintenance(localStatus);
        }
      } catch (e) {
        const localStatus = localStorage.getItem('maintenance_mode') === 'true';
        setIsMaintenance(localStatus);
      }
    };

    checkInitialStatus();
  }, []);

  // Fetch standings from the backend when the Standings tab is active
  useEffect(() => {
    const fetchAllStandings = async () => {
      // Only fetch when the standings tab is active AND they haven't been loaded yet.
      if (activeTab !== 'STANDINGS' || standingsLoadedRef.current) return;

      const standingsPromises = Object.entries(majorTournaments)
        .filter(([, ids]) => ids !== null) // Exclude tournaments without API IDs
        .map(async ([name, ids]) => {
          try {
            const res = await fetch(`/api/standings?leagueid=${ids!.tournamentId}`);
            if (!res.ok) return [name, []];
            const data = await res.json();
            return [name, processFetchedStandings(data.standings)];
          } catch (error) {
            console.error(`Failed to fetch standings for ${name}:`, error);
            return [name, []];
          }
        });

      const results = await Promise.all(standingsPromises);
      const newStandings: Record<string, any> = {};

      results.forEach(([name, data]) => {
        if (data && (data as any[]).length > 0) {
          newStandings[name as string] = data;
        }
      });

      setDynamicStandings(newStandings);
      standingsLoadedRef.current = true; // Mark as loaded to prevent re-fetching
    };

    fetchAllStandings();
  }, [activeTab]); // Reruns only when user navigates to the standings tab

  const setMaintenanceMode = async (enabled: boolean) => {
    const password = prompt('Please enter the admin password to change maintenance mode:');
    if (!password) {
      alert('Action cancelled. Password is required.');
      return;
    }

    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, enabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setIsMaintenance(data.maintenance);
        localStorage.setItem('maintenance_mode', String(data.maintenance));
        alert(`Success! Maintenance mode is now ${data.maintenance ? 'ON' : 'OFF'}.`);
      } else {
        throw new Error(data.message || 'An unknown error occurred.');
      }
    } catch (err: any) {
      alert(`Failed to update maintenance mode: ${err.message}`);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('is_admin_auth');
    setIsAdmin(false);
    window.location.href = '/';
  };

  useEffect(() => {
    const fetchAllMatches = async () => {
      // Prevent fetching data entirely if maintenance is ON and user is not admin
      const maintenanceModeActive = localStorage.getItem('maintenance_mode') === 'true';
      const isUserAdmin = sessionStorage.getItem('is_admin_auth') === 'true';

      if (maintenanceModeActive && !isUserAdmin) {
        return;
      }

      const now = Date.now();
      let requiredCooldown = 0;
      const allMatches = combinedMatchesRef.current;

      if (allMatches.length > 0) {
        const hasLive = allMatches.some((m) => m.status === 'LIVE');
        if (hasLive) {
          requiredCooldown = 60 * 1000;
        } else {
          const upcomingMatches = allMatches.filter((m) => m.status === 'UPCOMING');
          if (upcomingMatches.length > 0) {
            let minTimeUntilMatchMs = Infinity;

            upcomingMatches.forEach((m) => {
              try {
                if (m.date && m.time && m.time.includes(':')) {
                  const [hours, minutes] = m.time.split(':').map(Number);
                  const matchDateObj = new Date(m.date);
                  const istOffsetMinutes = 330;
                  const localOffsetMinutes = -matchDateObj.getTimezoneOffset();
                  matchDateObj.setHours(hours, minutes + (localOffsetMinutes - istOffsetMinutes), 0, 0);

                  const timeUntil = matchDateObj.getTime() - now;
                  if (timeUntil < minTimeUntilMatchMs) {
                    minTimeUntilMatchMs = timeUntil;
                  }
                }
              } catch (e) { }
            });

            if (minTimeUntilMatchMs !== Infinity) {
              if (minTimeUntilMatchMs > 3 * 60 * 60 * 1000) {
                requiredCooldown = 60 * 60 * 1000;
              } else if (minTimeUntilMatchMs > 60 * 60 * 1000) {
                requiredCooldown = 15 * 60 * 1000;
              } else if (minTimeUntilMatchMs > 15 * 60 * 1000) {
                requiredCooldown = 5 * 60 * 1000;
              } else {
                requiredCooldown = 2 * 60 * 1000;
              }
            } else {
              requiredCooldown = 10 * 60 * 1000;
            }
          } else {
            requiredCooldown = 60 * 60 * 1000;
          }
        }
      }

      if (now - lastFetchTimeRef.current < requiredCooldown) {
        return;
      }
      lastFetchTimeRef.current = now;

      try {
        const DB_COOLDOWN = 10 * 60 * 1000;
        if (now - lastDbFetchTimeRef.current > DB_COOLDOWN) {
          try {
            const dbRes = await fetch(`/api/db-matches`);
            if (dbRes.ok) {
              const dbData = await dbRes.json();
              dbMatchesRef.current = dbData.matches || [];
              lastDbFetchTimeRef.current = now;
            }
          } catch (e) {
            console.warn("DB Fetch network error:", e);
          }
        }

        // Fetch upcoming matches from the new dedicated API
        const UPCOMING_API_COOLDOWN = 6 * 60 * 60 * 1000; // 6 hours
        if (now - lastUpcomingFetchTimeRef.current > UPCOMING_API_COOLDOWN) {
          try {
            const upcomingRes = await fetch('/api/upcoming-matches');
            if (upcomingRes.ok) {
              const upcomingData = await upcomingRes.json();
              upcomingMatchesApiRef.current = upcomingData.matches || [];
              lastUpcomingFetchTimeRef.current = now;
            }
          } catch (e) { console.warn("Upcoming Matches API Fetch network error:", e); }
        }

        const liveRes = await fetch(`/api/live-matches`);
        let liveMatches: any[] = [];
        let isLiveFetchSuccess = false;

        if (liveRes.ok) {
          const liveData = await liveRes.json();
          liveMatches = liveData.matches || [];
          isLiveFetchSuccess = !liveData.warning;

          try {
            const BACKOFF_CLIENT_EXTEND = 3 * 60 * 1000;
            const CACHED_EXTEND = 60 * 1000;
            if (liveData.backoff) {
              lastFetchTimeRef.current = Date.now() + BACKOFF_CLIENT_EXTEND;
            } else if (liveData.cached) {
              lastFetchTimeRef.current = Date.now() + CACHED_EXTEND;
            }
          } catch (e) { }
        }

        const dbMatchById = new Map((dbMatchesRef.current as any[]).map((m: any) => [m.id, m]));
        liveMatches = liveMatches.map((liveMatch: any) => {
          const dbMatch = dbMatchById.get(liveMatch.id);
          if (dbMatch?.youtubeHighlightId) {
            return { ...liveMatch, youtubeHighlightId: dbMatch.youtubeHighlightId };
          }
          return liveMatch;
        });

        let finishedUpdated = false;
        liveMatches.forEach((m: Match) => {
          if (m.status === 'FINISHED') {
            const existingIdx = finishedMatchesRef.current.findIndex(fm => fm.id === m.id);
            if (existingIdx >= 0) {
              finishedMatchesRef.current[existingIdx] = m;
            } else {
              finishedMatchesRef.current.push(m);
            }
            finishedUpdated = true;
          }
        });

        if (isLiveFetchSuccess) {
          const currentLiveIds = new Set(liveMatches.map((m: Match) => m.id));
          previousMatchesRef.current.forEach((prevMatch: Match) => {
            if (!currentLiveIds.has(prevMatch.id) && prevMatch.status === 'LIVE' && prevMatch.id !== 'dummy-live-test') {
              const existingIdx = finishedMatchesRef.current.findIndex(fm => fm.id === prevMatch.id);
              const finishedMatch: Match = { ...prevMatch, status: 'FINISHED', time: 'FT' };
              if (existingIdx >= 0) {
                finishedMatchesRef.current[existingIdx] = finishedMatch;
              } else {
                finishedMatchesRef.current.push(finishedMatch);
              }
              finishedUpdated = true;
            }
          });
        }

        if (finishedUpdated) {
          try {
            const now = Date.now();
            const recent = finishedMatchesRef.current.filter(m => (now - new Date(m.date).getTime()) < 48 * 3600 * 1000);
            finishedMatchesRef.current = recent;
            localStorage.setItem('e2match_finished', JSON.stringify(recent));
          } catch (e) { }
        }

        const liveIds = liveMatches.map((m: Match) => String(m.id));
        const finishedLiveIds = finishedMatchesRef.current.map((m: Match) => String(m.id));

        // The DB only contains finished matches. Filter out any that are already accounted for.
        const uniqueFinishedDbMatches = dbMatchesRef.current.filter((m: Match) => !liveIds.includes(String(m.id)) && !finishedLiveIds.includes(String(m.id)));
        const persistentFinishedMatches = finishedMatchesRef.current.filter((m: Match) => !liveIds.includes(String(m.id)));
        const upcomingApiMatches = upcomingMatchesApiRef.current.filter((m: Match) => !liveIds.includes(String(m.id)));

        const combinedMatches = [...liveMatches, ...persistentFinishedMatches, ...uniqueFinishedDbMatches, ...upcomingApiMatches];

        combinedMatchesRef.current = combinedMatches;
        setMatches(combinedMatches);

        const newHighlightMatches = combinedMatches.filter((m: Match) =>
          m.status === 'FINISHED' &&
          m.youtubeHighlightId &&
          !highlightMatchIdsRef.current.has(m.id)
        );

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

        newHighlightMatches.forEach(m => highlightMatchIdsRef.current.add(m.id));
        initialLoadCompleteRef.current = true;

        const newAlerts: any[] = [];
        liveMatches.forEach((newMatch: any) => {
          const oldMatch = previousMatchesRef.current.find(m => m.id === newMatch.id);
          if (oldMatch) {
            if (typeof newMatch.homeScore === 'number' && typeof oldMatch.homeScore === 'number') {
              if (newMatch.homeScore > oldMatch.homeScore) {
                newAlerts.push({ id: Date.now(), matchName: `${newMatch.homeTeam.code} v ${newMatch.awayTeam.code}`, message: `GOAL! ${newMatch.homeTeam.name} [${newMatch.homeScore}] - ${newMatch.awayScore}`, minute: newMatch.minute });
              }
            }
          }
        });

        if (newAlerts.length > 0) {
          setAlerts(prev => [...prev, ...newAlerts]);
          setTimeout(() => setAlerts(prev => prev.filter(a => !newAlerts.map(n => n.id).includes(a.id))), 4000);
        }

        previousMatchesRef.current = liveMatches;

        setSelectedMatch(prev => {
          if (!prev) {
            return combinedMatches.find((m: Match) => m.status === 'LIVE') ||
              combinedMatches.find((m: Match) => m.status === 'UPCOMING') ||
              combinedMatches[0];
          }
          const updatedMatch = combinedMatches.find((m: Match) => m.id === prev.id);
          if (!updatedMatch) return prev;

          if (
            prev.status !== updatedMatch.status ||
            prev.homeScore !== updatedMatch.homeScore ||
            prev.awayScore !== updatedMatch.awayScore ||
            prev.time !== updatedMatch.time
          ) {
            return updatedMatch;
          }
          return prev;
        });

      } catch (err) {
        console.error("Pipeline Error:", err);
      }
    };

    fetchAllMatches();
    const interval = setInterval(fetchAllMatches, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchAllMatches();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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

  const filteredMatches = matches.filter((m) => {
    if (!m) return false;
    const isFinishedStatus = ['FINISHED', 'FT', 'ENDED', 'CLOSED'].includes(String(m.status));
    if (activeTab === 'LIVE') return m.status === 'LIVE';
    if (activeTab === 'UPCOMING') return m.status === 'UPCOMING';
    if (activeTab === 'FINISHED') {
      if (!isFinishedStatus) return false;
      if (resultFilter) {
        const search = resultFilter.toLowerCase();
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

  const sortedFilteredMatches = activeTab === 'FINISHED' ?
    [...filteredMatches].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }) : filteredMatches;

  const path = window.location.pathname;

  const isExpandableTab = activeTab === 'LIVE' || activeTab === 'UPCOMING' || activeTab === 'FINISHED';
  const canShowMore = isExpandableTab && sortedFilteredMatches.length > INITIAL_MATCH_DISPLAY_LIMIT;
  const shouldShowMoreButton = canShowMore && !showAll[activeTab as 'LIVE' | 'UPCOMING' | 'FINISHED'];

  const matchesToDisplay = shouldShowMoreButton
    ? sortedFilteredMatches.slice(0, INITIAL_MATCH_DISPLAY_LIMIT)
    : sortedFilteredMatches;


  if (path === '/login') {
    return <LoginPage />;
  }

  if (isMaintenance && !isAdmin) {
    return <MaintenancePage />;
  }

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

          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/10 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
            <div className="relative">
              <button onClick={handleGlobalHighlightsClick} className="text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5" /> Highlights</button>
              {highlightMatches.length > 0 && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-slate-900"></span></span>}
            </div>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={triggerTestGoal} className="text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg uppercase tracking-widest transition-all flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5" /> Alerts</button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button onClick={() => document.getElementById('fan-poll')?.scrollIntoView({ behavior: 'smooth' })} className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Fan Poll</button>
            <button onClick={() => setShowQuiz(true)} className="relative text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-indigo-500/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" /> Trivia Quiz <span className="absolute -top-1.5 -right-1.5 text-[7px] font-bold bg-indigo-500 text-white px-1.5 py-0.5 rounded-full">NEW</span></button>
            <button onClick={() => setShowProps(true)} className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg uppercase tracking-widest hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Player Props</button>
          </div>
        </div>

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
            <div className="bg-[#0B1121] border border-white/5 p-1.5 rounded-xl grid grid-cols-6 gap-1 text-center">
              <button onClick={() => { setActiveTab('LIVE'); setSelectedTeam(null); setSelectedMatch(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'LIVE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Live</button>
              <button onClick={() => { setActiveTab('UPCOMING'); setSelectedTeam(null); setSelectedMatch(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'UPCOMING' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><Calendar className="w-3 h-3" /> Upcoming</button>
              <button onClick={() => { setActiveTab('FINISHED'); setSelectedTeam(null); setSelectedMatch(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'FINISHED' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><History className="w-3 h-3" /> Results</button>
              <button onClick={() => { setActiveTab('STANDINGS'); setSelectedTeam(null); setSelectedMatch(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'STANDINGS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><ListOrdered className="w-3 h-3" /> Table</button>

              <button onClick={() => { setActiveTab('TEAMS'); setSelectedTeam(teams[0] || null); setSelectedMatch(null); }} className={`relative py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'TEAMS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <Shield className="w-3 h-3" /> Teams <span className="absolute top-0 right-1 text-[7px] font-bold bg-indigo-500 text-white px-1 rounded-full">NEW</span>
              </button>

              <button onClick={() => { setActiveTab('POLL'); setSelectedTeam(null); setSelectedMatch(null); }} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${activeTab === 'POLL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><Trophy className="w-3 h-3" /> Poll</button>
            </div>

            <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
              {activeTab === 'FINISHED' && (
                <div className="mb-4 shrink-0 animate-fade-in-up flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="Search results (New Feature)"
                    value={resultFilter}
                    onChange={(e) => setResultFilter(e.target.value)}
                    className="w-full bg-[#0B1121] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner"
                  />

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
                            if (m.homeTeam && (m.homeTeam.name || typeof m.homeTeam === 'string')) {
                              const name = typeof m.homeTeam === 'object' ? m.homeTeam.name : m.homeTeam;
                              validTeams.push([name, m.homeTeam]);
                            }
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

                  {matchesToDisplay.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center p-8 bg-[#0B1121] rounded-xl border border-white/5 flex flex-col items-center gap-2">
                      <span className="text-2xl">⚽</span><span className="font-bold">No matches here yet.</span>
                    </div>
                  ) : (
                    matchesToDisplay.map((match, index) => (
                      <div key={match.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                        <MatchCard
                          match={match}
                          isSelected={selectedMatch?.id === match.id && !selectedTeam}
                          onSelect={() => {
                            setSelectedMatch(match);
                            if (match.status === 'LIVE') {
                              setActiveAnalysisTab('TELEMETRY');
                            } else {
                              setActiveAnalysisTab('ANALYSIS');
                            }
                            setSelectedTeam(null);
                            setTimeout(() => {
                              document.getElementById('ai-analysis-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 100);
                          }}
                        />
                      </div>
                    ))
                  )}
                  {shouldShowMoreButton && (
                    <div className="mt-2 animate-fade-in-up">
                      <button
                        onClick={() => setShowAll(prev => ({ ...prev, [activeTab]: true }))}
                        className="w-full text-center py-3 bg-indigo-600/20 text-indigo-300 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-indigo-600/40 transition-colors"
                      >
                        Show More ({sortedFilteredMatches.length - INITIAL_MATCH_DISPLAY_LIMIT} more)
                      </button>
                    </div>
                  )}

                </>
              ) : (
                // Safe mapping using the dynamic `teams` state
                (teams && teams.length > 0) ? teams.map((team, index) => (
                  <div key={team.id} onClick={() => setSelectedTeam(team)} className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all animate-fade-in-up ${selectedTeam?.id === team.id ? 'bg-gradient-to-r from-indigo-950/40 to-[#0B1121] border-indigo-500/50' : 'bg-[#0B1121] border-white/5 hover:border-indigo-500/30'}`} style={{ animationDelay: `${index * 30}ms` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{team.logo || '⚽'}</span>
                      <span className="text-xs font-bold text-white">{team.name}</span>
                    </div>
                    <span className="text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded">{team.code}</span>
                  </div>
                )) : (
                  <div className="text-xs text-slate-500 text-center p-8">Loading teams...</div>
                )
              )}
            </div>
          </div>

          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6" id="ai-analysis-section">
            {activeTab === 'STANDINGS' ? (
              <div className="flex flex-col gap-4">
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
            ) : activeTab === 'POLL' ? (
              <div id="fan-poll" className="scroll-mt-24 animate-fade-in-up">
                <FanPoll />
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
                      {selectedTeam.form && selectedTeam.form.length > 0 ? (
                        selectedTeam.form.map((f, i) => (
                          <span key={i} className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center font-mono ${f === 'W' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : f === 'D' ? 'bg-slate-500/20 text-slate-400 border border-white/10' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>{f}</span>
                        ))
                      ) : (
                        <span className="text-slate-500 text-xs">No recent form data available.</span>
                      )}
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

                <div className="bg-[#0B1121] border border-white/5 p-1.5 rounded-xl grid grid-cols-4 gap-1 text-center">
                  <button onClick={() => setActiveAnalysisTab('ANALYSIS')} className={`relative py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeAnalysisTab === 'ANALYSIS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                    <BrainCircuit className="w-3.5 h-3.5" /> Analysis
                    <span className="absolute top-0.5 right-1 text-[7px] font-bold bg-indigo-500 text-white px-1.5 py-0.5 rounded-full">NEW</span>
                  </button>
                  <button onClick={() => setActiveAnalysisTab('TELEMETRY')} disabled={selectedMatch.status !== 'LIVE'} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeAnalysisTab === 'TELEMETRY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'} disabled:opacity-30 disabled:cursor-not-allowed`}><Activity className="w-3.5 h-3.5" /> Telemetry</button>
                  <button onClick={() => setActiveAnalysisTab('H2H')} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeAnalysisTab === 'H2H' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><Swords className="w-3.5 h-3.5" /> H2H</button>
                  <button onClick={() => setActiveAnalysisTab('HIGHLIGHTS')} disabled={!selectedMatch.youtubeHighlightId} className={`relative py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeAnalysisTab === 'HIGHLIGHTS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'} disabled:opacity-30 disabled:cursor-not-allowed`}>
                    <Youtube className="w-3.5 h-3.5" /> Highlights
                    {selectedMatch.youtubeHighlightId && <span className="absolute top-0.5 right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
                  </button>
                </div>

                <div className="animate-fade-in-up">
                  {activeAnalysisTab === 'ANALYSIS' && <AIPredictor match={selectedMatch} />}

                  {activeAnalysisTab === 'TELEMETRY' && selectedMatch.status === 'LIVE' && <LiveTelemetry match={selectedMatch} />}

                  {activeAnalysisTab === 'H2H' && <H2HMatrix match={selectedMatch} />}

                  {activeAnalysisTab === 'HIGHLIGHTS' && selectedMatch.youtubeHighlightId && (
                    <div id="match-highlights" className="bg-[#0B1121] border border-white/5 rounded-3xl overflow-hidden shadow-2xl mt-4">
                      <div className="md:flex md:items-center md:justify-between bg-gradient-to-r from-red-900/20 via-[#0B1121] to-[#0B1121] p-5 border-b border-white/5 gap-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5" /> Match highlights</p>
                          <h3 className="mt-2 text-lg font-black text-white">Official YouTube highlight</h3>
                        </div>
                        <a
                          href={`https://www.youtube.com/watch?v=${selectedMatch.youtubeHighlightId}`}
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
                          href={`https://www.youtube.com/watch?v=${selectedMatch.youtubeHighlightId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-lg relative bg-black/50 group block cursor-pointer"
                        >
                          <img
                            src={`https://img.youtube.com/vi/${selectedMatch.youtubeHighlightId}/maxresdefault.jpg`}
                            alt="Match Highlight Thumbnail"
                            className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-300"
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${selectedMatch.youtubeHighlightId}/hqdefault.jpg`; }}
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
                </div>

                {selectedMatch.status === 'FINISHED' && !selectedMatch.youtubeHighlightId && activeAnalysisTab === 'HIGHLIGHTS' && (
                  <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-4 text-slate-300 text-sm mt-6 animate-fade-in-up">
                    We’re still checking for match highlights. If the game just finished, please refresh in a moment while we find the latest YouTube clip.
                  </div>
                )}
              </>
            ) : (
              <div className="text-center mt-20 text-slate-500">
                <Globe className="w-16 h-16 text-indigo-500/20 mx-auto mb-4 animate-[spin_10s_linear_infinite]" />
                <h2 className="text-3xl font-black text-white mb-2">FIFA World Cup 2026™</h2>
                <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full uppercase tracking-widest border border-indigo-500/20 mb-6 inline-block">Watching from {userLocation} ({sportName})</span>
              </div>
            )}
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

      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-indigo-500/30 p-3 z-[120] flex items-center justify-center gap-6 text-xs shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 font-bold text-indigo-400">
            <Shield className="w-4 h-4" />
            <span>ADMIN MODE</span>
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-bold">Maintenance Mode:</span>
            <button onClick={() => setMaintenanceMode(!isMaintenance)} className={`px-3 py-1 rounded-full font-bold uppercase tracking-wider border ${isMaintenance ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
              {isMaintenance ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-white font-bold">
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default App;