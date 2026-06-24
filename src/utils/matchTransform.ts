import { Match, MatchStats } from '../types/match.js';

export function calculateMatchPrediction(match: Match): {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
} {
    // Calculate based on team form and head-to-head
    const homeFormScore = match.homeTeam.form.filter(r => r === 'W').length / match.homeTeam.form.length;
    const awayFormScore = match.awayTeam.form.filter(r => r === 'W').length / match.awayTeam.form.length;

    const homeH2HScore = match.h2h.homeWins / (match.h2h.matchesPlayed || 1);
    const awayH2HScore = match.h2h.awayWins / (match.h2h.matchesPlayed || 1);

    // Weighted calculation
    const homeStrength = (homeFormScore * 0.6 + homeH2HScore * 0.4) * 100;
    const awayStrength = (awayFormScore * 0.6 + awayH2HScore * 0.4) * 100;

    // Normalize to probability
    const total = homeStrength + awayStrength + 30; // 30 for draw probability

    return {
        homeWinProb: Math.round((homeStrength / total) * 100),
        drawProb: Math.round((30 / total) * 100),
        awayWinProb: Math.round((awayStrength / total) * 100)
    };
}

export function getMatchBet(probs: { homeWinProb: number; drawProb: number; awayWinProb: number }): string {
    const max = Math.max(probs.homeWinProb, probs.drawProb, probs.awayWinProb);
    if (max === probs.homeWinProb && probs.homeWinProb > 45) return `Home Win (${probs.homeWinProb}%)`;
    if (max === probs.awayWinProb && probs.awayWinProb > 45) return `Away Win (${probs.awayWinProb}%)`;
    if (max === probs.drawProb && probs.drawProb > 30) return `Draw (${probs.drawProb}%)`;
    return 'Under Over 2.5 Goals';
}

export function normalizeTeamName(name: string): string {
    if (!name) return '';
    const aliases: { [key: string]: string } = {
        'dr congo': 'congo dr',
        "côte d'ivoire": 'ivory coast',
        'usa': 'united states',
        'eng': 'england',
        'ksa': 'saudi arabia',
        'uae': 'united arab emirates',
        'south korea': 'korea republic',
        'korea': 'korea republic',
        'ir iran': 'iran',
    };

    let normalized = name.toLowerCase().trim();
    if (aliases[normalized]) {
        normalized = aliases[normalized];
    }
    return normalized.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function transformMatchRow(row: any): Partial<Match> {
    const homeTeamName = typeof row.home_team === 'string' ? row.home_team : row.home_team?.name || 'Home';
    const awayTeamName = typeof row.away_team === 'string' ? row.away_team : row.away_team?.name || 'Away';

    const rawMatchTime = typeof row.match_time === 'string' ? row.match_time.toUpperCase() : '';
    const isFinished = rawMatchTime.includes('FT') || row.db_status === 'FINISHED' || row.dbStatus === 'FINISHED' || row.match_status === 'FINISHED';

    let displayTime = row.match_time;
    if (typeof displayTime === 'string' && displayTime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
        displayTime = displayTime.substring(0, 5);
    }

    return {
        id: row.id,
        competition: row.competition || 'FIFA World Cup 2026',
        dbStatus: isFinished ? 'FINISHED' : 'SCHEDULED',
        time: displayTime || 'TBD',
        date: new Date(row.match_date).toISOString().split('T')[0],
        youtubeHighlightId: row.youtube_highlight_id || null,
        homeTeam: {
            id: row.home_team_id || homeTeamName.toLowerCase().replace(/\s/g, '-'),
            name: homeTeamName,
            code: row.home_team_code || homeTeamName.substring(0, 3).toUpperCase(),
            logo: row.home_team_logo || '⚽',
            form: row.home_team_form ? JSON.parse(row.home_team_form) : ['W', 'D', 'W', 'L', 'W']
        },
        awayTeam: {
            id: row.away_team_id || awayTeamName.toLowerCase().replace(/\s/g, '-'),
            name: awayTeamName,
            code: row.away_team_code || awayTeamName.substring(0, 3).toUpperCase(),
            logo: row.away_team_logo || '⚽',
            form: row.away_team_form ? JSON.parse(row.away_team_form) : ['D', 'W', 'L', 'W', 'D']
        },
        homeScore: row.home_score ?? 0,
        awayScore: row.away_score ?? 0,
        stats: {
            possession: { home: 50, away: 50 },
            shots: { home: 10, away: 8 },
            shotsOnTarget: { home: 4, away: 3 },
            fouls: { home: 10, away: 12 },
            yellowCards: { home: 1, away: 2 },
            redCards: { home: 0, away: 0 },
            corners: { home: 5, away: 4 }
        },
        events: [],
        h2h: { matchesPlayed: 5, homeWins: 2, awayWins: 1, draws: 2, lastResults: ['W', 'D', 'L', 'W', 'D'] }
    };
}
