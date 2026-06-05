import { Match, GroupStandings, TriviaQuestion } from './types';

export const INITIAL_MATCHES: Match[] = [
  {
    id: 'wc-1',
    competition: 'World Cup 2026 - Group A',
    status: 'LIVE',
    minute: 68,
    time: '14:00',
    date: '2026-06-11',
    homeScore: 2,
    awayScore: 1,
    homeTeam: {
      id: 'usa',
      name: 'United States',
      code: 'US',
      logo: '🇺🇸',
      form: ['W', 'D', 'W', 'W', 'L']
    },
    awayTeam: {
      id: 'colombia',
      name: 'Colombia',
      code: 'CO',
      logo: '🇨🇴',
      form: ['D', 'W', 'W', 'L', 'W']
    },
    stats: {
      possession: { home: 54, away: 46 },
      shots: { home: 11, away: 8 },
      shotsOnTarget: { home: 5, away: 3 },
      fouls: { home: 9, away: 12 },
      yellowCards: { home: 1, away: 2 },
      redCards: { home: 0, away: 0 },
      corners: { home: 6, away: 4 }
    },
    events: [
      { time: 14, team: 'away', type: 'goal', detail: 'Luis Díaz (Assist: James Rodríguez)' },
      { time: 32, team: 'home', type: 'yellow_card', detail: 'Tyler Adams (Tactical Foul)' },
      { time: 41, team: 'home', type: 'goal', detail: 'Christian Pulisic (Penalty)' },
      { time: 45, team: 'away', type: 'yellow_card', detail: 'Davinson Sánchez' },
      { time: 58, team: 'home', type: 'goal', detail: 'Folarin Balogun (Assist: Weston McKennie)' },
      { time: 62, team: 'away', type: 'substitution', detail: 'Jhon Durán on for Rafael Borré' }
    ],
    h2h: {
      matchesPlayed: 8,
      homeWins: 3,
      awayWins: 4,
      draws: 1,
      lastResults: ['0-0', '1-2', '2-0', '1-1']
    }
  },
  {
    id: 'wc-2',
    competition: 'World Cup 2026 - Group B',
    status: 'LIVE',
    minute: 14,
    time: '17:00',
    date: '2026-06-11',
    homeScore: 0,
    awayScore: 0,
    homeTeam: {
      id: 'england',
      name: 'England',
      code: 'GB',
      logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      form: ['W', 'W', 'W', 'D', 'W']
    },
    awayTeam: {
      id: 'japan',
      name: 'Japan',
      code: 'JP',
      logo: '🇯🇵',
      form: ['W', 'W', 'L', 'W', 'W']
    },
    stats: {
      possession: { home: 61, away: 39 },
      shots: { home: 3, away: 1 },
      shotsOnTarget: { home: 1, away: 0 },
      fouls: { home: 2, away: 4 },
      yellowCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
      corners: { home: 2, away: 0 }
    },
    events: [
      { time: 8, team: 'away', type: 'yellow_card', detail: 'Wataru Endo' }
    ],
    h2h: {
      matchesPlayed: 4,
      homeWins: 2,
      awayWins: 1,
      draws: 1,
      lastResults: ['1-0', '2-2', '1-2']
    }
  },
  {
    id: 'wc-3',
    competition: 'World Cup 2026 - Group C',
    status: 'UPCOMING',
    time: '20:00',
    date: '2026-06-12',
    homeTeam: {
      id: 'argentina',
      name: 'Argentina',
      code: 'AR',
      logo: '🇦🇷',
      form: ['W', 'W', 'D', 'W', 'W']
    },
    awayTeam: {
      id: 'canada',
      name: 'Canada',
      code: 'CA',
      logo: '🇨🇦',
      form: ['D', 'L', 'W', 'W', 'D']
    },
    h2h: {
      matchesPlayed: 3,
      homeWins: 2,
      awayWins: 0,
      draws: 1,
      lastResults: ['2-0', '2-0', '1-1']
    }
  }
];

export const WORLD_CUP_STANDINGS: GroupStandings[] = [
  {
    groupName: 'Group A',
    entries: [
      { rank: 1, teamName: 'United States', code: 'US', played: 1, win: 1, draw: 0, lose: 0, goalsFor: 2, goalsAgainst: 1, points: 3 },
      { rank: 2, teamName: 'Switzerland', code: 'CH', played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
      { rank: 3, teamName: 'New Zealand', code: 'NZ', played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
      { rank: 4, teamName: 'Colombia', code: 'CO', played: 1, win: 0, draw: 0, lose: 1, goalsFor: 1, goalsAgainst: 2, points: 0 }
    ]
  }
];

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: 1,
    question: 'Which nation has won the most FIFA World Cup titles in history?',
    options: ['Germany', 'Brazil', 'Italy', 'Argentina'],
    answer: 1,
    explanation: 'Brazil has won the FIFA World Cup 5 times (1958, 1962, 1970, 1994, and 2002), more than any other nation.'
  },
  {
    id: 2,
    question: 'Who scored the famous "Hand of God" goal in the 1986 World Cup?',
    options: ['Pelé', 'Lionel Messi', 'Diego Maradona', 'Zinedine Zidane'],
    answer: 2,
    explanation: 'Diego Maradona scored the "Hand of God" goal against England in the 1986 quarter-finals, followed shortly by the renowned "Goal of the Century".'
  }
];

export const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    title: 'AI Football Predictor',
    subtitle: '2026 World Cup Analytical Edition',
    liveMatches: 'Live Matches',
    upcomingMatches: 'Upcoming Fixtures',
    results: 'Results',
    predictMatch: 'Get AI Prediction',
    analyzing: 'Analyzing live stats & tactics...',
    predictorHeader: 'AI Match Predictor',
    predictionProb: 'Winning Probabilities',
    forecastScore: 'Score Forecast',
    tacticalInsight: 'Tactical Insight',
    keyMatchups: 'Key Matchups',
    standings: 'World Cup Standings',
    trivia: 'Trivia Challenge',
    triviaCorrect: 'Correct!',
    triviaIncorrect: 'Incorrect!',
    nextQuestion: 'Next Question',
    bestXI: 'AI Fantasy Advisor (Best XI)',
    fantasyRole: 'Tactical Role',
    captainBtn: 'Captain Selection',
    triviaIntro: 'Test your World Cup knowledge!',
    h2h: 'Head-to-Head Statistics',
    matchesPlayed: 'Matches Played'
  }
};