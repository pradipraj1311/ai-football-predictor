export interface Team {
  id: string;
  name: string;
  logo: string;
  code: string;
  form: string[];
}

export interface MatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  fouls: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
  corners: { home: number; away: number };
}

export interface MatchEvent {
  time: number;
  team: 'home' | 'away';
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution';
  detail: string;
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  status: 'LIVE' | 'POSTPONED' | 'FINISHED' | 'UPCOMING';
  minute?: number;
  time: string;
  date: string;
  homeScore?: number;
  awayScore?: number;
  youtubeHighlightId?: string | null;
  stats?: MatchStats;
  events?: MatchEvent[];
  competition: string;
  h2h: {
    matchesPlayed: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    lastResults: string[];
  };
}

export interface StandingsEntry {
  rank: number;
  teamName: string;
  code: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface GroupStandings {
  groupName: string;
  entries: StandingsEntry[];
}

export interface PredictionResult {
  matchId: string;
  winProbability: { home: number; draw: number; away: number };
  suggestedScore: string;
  analysis: string;
  keyMatchups: string[];
  tacticalInsight: string;
  sources?: Array<{ title: string; uri: string }>;
}

export interface FantasyAdvisorResult {
  matchId: string;
  bestXI: Array<{
    name: string;
    position: 'GK' | 'DEF' | 'MID' | 'FWD';
    team: string;
    role: string;
    rating: number;
    reason: string;
  }>;
  tacticalSetup: string;
  captain: string;
  viceCaptain: string;
}

export interface TriviaQuestion {
  id: number;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}