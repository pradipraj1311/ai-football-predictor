import { Match } from './types';

export interface FootballTeamProfile {
  id: string;
  name: string;
  code: string;
  logo: string;
  country: string;
  founded: number;
  stadium: string;
  form: string[];
}

export const GLOBAL_TEAMS_DIRECTORY: FootballTeamProfile[] = [
  { id: 'rma', name: 'Real Madrid', code: 'RMA', logo: '👑', country: 'Spain', founded: 1902, stadium: 'Santiago Bernabéu', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'mci', name: 'Manchester City', code: 'MCI', logo: '🔵', country: 'England', founded: 1880, stadium: 'Etihad Stadium', form: ['W', 'W', 'W', 'L', 'D'] },
  { id: 'ars', name: 'Arsenal', code: 'ARS', logo: '🔴', country: 'England', founded: 1886, stadium: 'Emirates Stadium', form: ['W', 'D', 'W', 'W', 'L'] },
  { id: 'liv', name: 'Liverpool', code: 'LIV', logo: '🦅', country: 'England', founded: 1892, stadium: 'Anfield', form: ['L', 'W', 'W', 'D', 'W'] },
  { id: 'bar', name: 'Barcelona', code: 'BAR', logo: '🔮', country: 'Spain', founded: 1899, stadium: 'Camp Nou', form: ['W', 'W', 'W', 'W', 'D'] },
  { id: 'atm', name: 'Atletico Madrid', code: 'ATM', logo: '🔱', country: 'Spain', founded: 1903, stadium: 'Metropolitano', form: ['D', 'W', 'L', 'W', 'W'] }
];

export const INITIAL_MATCHES: Match[] = [
  // LIVE MATCHES
  {
    id: 'live-1', competition: 'UEFA Champions League', status: 'LIVE', minute: 72, time: '20:00', date: '2026-06-07',
    homeScore: 2, awayScore: 2,
    homeTeam: { id: 'rma', name: 'Real Madrid', code: 'RMA', logo: '👑', form: ['W', 'W', 'D'] },
    awayTeam: { id: 'mci', name: 'Manchester City', code: 'MCI', logo: '🔵', form: ['W', 'W', 'W'] }
  },
  {
    id: 'live-2', competition: 'Premier League', status: 'LIVE', minute: 18, time: '15:00', date: '2026-06-07',
    homeScore: 1, awayScore: 0,
    homeTeam: { id: 'ars', name: 'Arsenal', code: 'ARS', logo: '🔴', form: ['W', 'D', 'W'] },
    awayTeam: { id: 'liv', name: 'Liverpool', code: 'LIV', logo: '🦅', form: ['L', 'W', 'W'] }
  },
  // PREVIOUS MATCHES (FT - Full Time)
  {
    id: 'past-1', competition: 'La Liga', status: 'FT', time: 'FT', date: '2026-06-06',
    homeScore: 3, awayScore: 1,
    homeTeam: { id: 'bar', name: 'Barcelona', code: 'BAR', logo: '🔮', form: ['W', 'W'] },
    awayTeam: { id: 'atm', name: 'Atletico Madrid', code: 'ATM', logo: '🔱', form: ['L', 'W'] }
  },
  {
    id: 'past-2', competition: 'Premier League', status: 'FT', time: 'FT', date: '2026-06-05',
    homeScore: 0, awayScore: 2,
    homeTeam: { id: 'liv', name: 'Liverpool', code: 'LIV', logo: '🦅', form: ['W', 'D'] },
    awayTeam: { id: 'mci', name: 'Manchester City', code: 'MCI', logo: '🔵', form: ['W', 'W'] }
  },
  // UPCOMING MATCHES
  {
    id: 'up-1', competition: 'UEFA Champions League', status: 'UPCOMING', time: '21:00', date: '2026-06-09',
    homeTeam: { id: 'bar', name: 'Barcelona', code: 'BAR', logo: '🔮', form: ['W', 'W'] },
    awayTeam: { id: 'rma', name: 'Real Madrid', code: 'RMA', logo: '👑', form: ['W', 'D'] }
  },
  {
    id: 'up-2', competition: 'La Liga', status: 'UPCOMING', time: '18:45', date: '2026-06-10',
    homeTeam: { id: 'atm', name: 'Atletico Madrid', code: 'ATM', logo: '🔱', form: ['D', 'W'] },
    awayTeam: { id: 'ars', name: 'Arsenal', code: 'ARS', logo: '🔴', form: ['W', 'W'] }
  }
];

export const WORLD_CUP_STANDINGS = [];
export const TRANSLATIONS = { en: {} };