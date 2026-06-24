export interface Team {
    id: string;
    name: string;
    code: string;
    logo: string;
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

export interface H2H {
    matchesPlayed: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    lastResults: string[];
}

export interface Match {
    id: string;
    competition: string;
    dbStatus: 'FINISHED' | 'SCHEDULED' | 'LIVE';
    time: string;
    date: string;
    youtubeHighlightId: string | null;
    homeTeam: Team;
    awayTeam: Team;
    homeScore: number;
    awayScore: number;
    stats: MatchStats;
    events: Event[];
    h2h: H2H;
}

export interface Event {
    minute: number;
    type: 'goal' | 'card' | 'substitution';
    team: 'home' | 'away';
    player: string;
    description: string;
}

export interface Prediction {
    matchId: string;
    confidence: number;
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    suggestedBet: string;
    reasoning: string;
}
