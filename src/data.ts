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
  { id: 'arg', name: 'Argentina', code: 'ARG', logo: '🇦🇷', country: 'South America', founded: 1893, stadium: 'Estadio Monumental', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'fra', name: 'France', code: 'FRA', logo: '🇫🇷', country: 'Europe', founded: 1919, stadium: 'Stade de France', form: ['W', 'D', 'W', 'W', 'L'] },
  { id: 'bra', name: 'Brazil', code: 'BRA', logo: '🇧🇷', country: 'South America', founded: 1914, stadium: 'Maracanã', form: ['L', 'W', 'W', 'D', 'W'] },
  { id: 'eng', name: 'England', code: 'ENG', logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'Europe', founded: 1863, stadium: 'Wembley Stadium', form: ['W', 'W', 'D', 'W', 'L'] },
  { id: 'usa', name: 'United States', code: 'USA', logo: '🇺🇸', country: 'North America', founded: 1913, stadium: 'MetLife Stadium', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'mex', name: 'Mexico', code: 'MEX', logo: '🇲🇽', country: 'North America', founded: 1927, stadium: 'Estadio Azteca', form: ['D', 'W', 'L', 'W', 'W'] }
];

export const INITIAL_MATCHES: Match[] = [
  // UPCOMING WORLD CUP OPENING MATCHES
  {
    id: 'wc-up-1', competition: 'World Cup 2026 - Group A', status: 'UPCOMING', time: '12:30', date: '2026-06-11',
    homeTeam: { id: 'mex', name: 'Mexico', code: 'MEX', logo: '🇲🇽', form: ['D', 'W', 'L'] },
    awayTeam: { id: 'rsa', name: 'South Africa', code: 'RSA', logo: '🇿🇦', form: ['W', 'D', 'W'] }
  },
  {
    id: 'wc-up-2', competition: 'World Cup 2026 - Group D', status: 'UPCOMING', time: '15:00', date: '2026-06-12',
    homeTeam: { id: 'usa', name: 'United States', code: 'USA', logo: '🇺🇸', form: ['W', 'W', 'L'] },
    awayTeam: { id: 'par', name: 'Paraguay', code: 'PAR', logo: '🇵🇾', form: ['D', 'D', 'W'] }
  },
  {
    id: 'wc-up-3', competition: 'World Cup 2026 - Group C', status: 'UPCOMING', time: '18:00', date: '2026-06-13',
    homeTeam: { id: 'bra', name: 'Brazil', code: 'BRA', logo: '🇧🇷', form: ['W', 'W', 'W'] },
    awayTeam: { id: 'mor', name: 'Morocco', code: 'MAR', logo: '🇲🇦', form: ['W', 'D', 'W'] }
  },
  // SIMULATED PAST MATCHES (Friendlies leading up to WC)
  {
    id: 'wc-past-1', competition: 'International Friendly', status: 'FT', time: 'FT', date: '2026-06-05',
    homeScore: 2, awayScore: 1,
    homeTeam: { id: 'arg', name: 'Argentina', code: 'ARG', logo: '🇦🇷', form: ['W', 'W'] },
    awayTeam: { id: 'fra', name: 'France', code: 'FRA', logo: '🇫🇷', form: ['L', 'W'] }
  }
];

export const WORLD_CUP_STANDINGS = [];
export const TRANSLATIONS = { en: {} };