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
  { id: 'arg', name: 'Argentina', code: 'ARG', logo: '🇦🇷', country: 'South America', founded: 1893, stadium: 'Estadio Monumental', form: ['W', 'W', 'W', 'D', 'W'] },
  { id: 'bra', name: 'Brazil', code: 'BRA', logo: '🇧🇷', country: 'South America', founded: 1914, stadium: 'Maracanã', form: ['L', 'W', 'W', 'D', 'W'] },
  { id: 'fra', name: 'France', code: 'FRA', logo: '🇫🇷', country: 'Europe', founded: 1919, stadium: 'Stade de France', form: ['W', 'D', 'W', 'W', 'L'] },
  { id: 'eng', name: 'England', code: 'ENG', logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'Europe', founded: 1863, stadium: 'Wembley', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'usa', name: 'United States', code: 'USA', logo: '🇺🇸', country: 'North America', founded: 1913, stadium: 'MetLife Stadium', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'mex', name: 'Mexico', code: 'MEX', logo: '🇲🇽', country: 'North America', founded: 1927, stadium: 'Estadio Azteca', form: ['D', 'W', 'L', 'W', 'W'] },
  { id: 'can', name: 'Canada', code: 'CAN', logo: '🇨🇦', country: 'North America', founded: 1912, stadium: 'BMO Field', form: ['W', 'L', 'W', 'D', 'L'] },
  { id: 'esp', name: 'Spain', code: 'ESP', logo: '🇪🇸', country: 'Europe', founded: 1909, stadium: 'Santiago Bernabéu', form: ['W', 'W', 'W', 'W', 'D'] },
  { id: 'ger', name: 'Germany', code: 'GER', logo: '🇩🇪', country: 'Europe', founded: 1900, stadium: 'Allianz Arena', form: ['D', 'W', 'W', 'L', 'W'] },
  { id: 'jpn', name: 'Japan', code: 'JPN', logo: '🇯🇵', country: 'Asia', founded: 1921, stadium: 'National Stadium', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'sen', name: 'Senegal', code: 'SEN', logo: '🇸🇳', country: 'Africa', founded: 1960, stadium: 'Diamniadio', form: ['W', 'D', 'W', 'L', 'W'] },
  { id: 'aus', name: 'Australia', code: 'AUS', logo: '🇦🇺', country: 'Asia', founded: 1961, stadium: 'Stadium Australia', form: ['D', 'D', 'W', 'W', 'L'] },
  { id: 'rsa', name: 'South Africa', code: 'RSA', logo: '🇿🇦', country: 'Africa', founded: 1991, stadium: 'FNB Stadium', form: ['W', 'D', 'W', 'L', 'L'] },
  { id: 'kor', name: 'South Korea', code: 'KOR', logo: '🇰🇷', country: 'Asia', founded: 1928, stadium: 'Seoul World Cup Stadium', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'cze', name: 'Czechia', code: 'CZE', logo: '🇨🇿', country: 'Europe', founded: 1901, stadium: 'Fortuna Arena', form: ['W', 'D', 'W', 'L', 'W'] },
  { id: 'par', name: 'Paraguay', code: 'PAR', logo: '🇵🇾', country: 'South America', founded: 1906, stadium: 'Defensores del Chaco', form: ['L', 'D', 'W', 'L', 'D'] },
  { id: 'mar', name: 'Morocco', code: 'MAR', logo: '🇲🇦', country: 'Africa', founded: 1955, stadium: 'Stade Mohammed V', form: ['W', 'W', 'D', 'W', 'W'] }
];

// Corrected and expanded list of plausible 48 teams for the 2026 World Cup, distributed into 12 groups.
// Note: This is a fictional group draw for demonstration purposes.
export const WORLD_CUP_STANDINGS = [
  { groupName: 'Group A', entries: [{ rank: 1, teamName: 'United States', code: 'USA', logo: '🇺🇸', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Mexico', code: 'MEX', logo: '🇲🇽', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Canada', code: 'CAN', logo: '🇨🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Jamaica', code: 'JAM', logo: '🇯🇲', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group B', entries: [{ rank: 1, teamName: 'Argentina', code: 'ARG', logo: '🇦🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Uruguay', code: 'URU', logo: '🇺🇾', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Paraguay', code: 'PAR', logo: '🇵🇾', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Chile', code: 'CHI', logo: '🇨🇱', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group C', entries: [{ rank: 1, teamName: 'Brazil', code: 'BRA', logo: '🇧🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Colombia', code: 'COL', logo: '🇨🇴', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Ecuador', code: 'ECU', logo: '🇪🇨', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Peru', code: 'PER', logo: '🇵🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group D', entries: [{ rank: 1, teamName: 'England', code: 'ENG', logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Netherlands', code: 'NED', logo: '🇳🇱', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Denmark', code: 'DEN', logo: '🇩🇰', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Sweden', code: 'SWE', logo: '🇸🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group E', entries: [{ rank: 1, teamName: 'France', code: 'FRA', logo: '🇫🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Belgium', code: 'BEL', logo: '🇧🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Switzerland', code: 'SUI', logo: '🇨🇭', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Poland', code: 'POL', logo: '🇵🇱', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group F', entries: [{ rank: 1, teamName: 'Spain', code: 'ESP', logo: '🇪🇸', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Portugal', code: 'POR', logo: '🇵🇹', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Croatia', code: 'CRO', logo: '🇭🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Serbia', code: 'SRB', logo: '🇷🇸', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group G', entries: [{ rank: 1, teamName: 'Germany', code: 'GER', logo: '🇩🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Italy', code: 'ITA', logo: '🇮🇹', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Ukraine', code: 'UKR', logo: '🇺🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Turkey', code: 'TUR', logo: '🇹🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group H', entries: [{ rank: 1, teamName: 'Morocco', code: 'MAR', logo: '🇲🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Senegal', code: 'SEN', logo: '🇸🇳', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Nigeria', code: 'NGA', logo: '🇳🇬', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Ghana', code: 'GHA', logo: '🇬🇭', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group I', entries: [{ rank: 1, teamName: 'Japan', code: 'JPN', logo: '🇯🇵', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'South Korea', code: 'KOR', logo: '🇰🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Australia', code: 'AUS', logo: '🇦🇺', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Iran', code: 'IRN', logo: '🇮🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group J', entries: [{ rank: 1, teamName: 'Cameroon', code: 'CMR', logo: '🇨🇲', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Egypt', code: 'EGY', logo: '🇪🇬', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Algeria', code: 'ALG', logo: '🇩🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Tunisia', code: 'TUN', logo: '🇹🇳', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group K', entries: [{ rank: 1, teamName: 'Costa Rica', code: 'CRC', logo: '🇨🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Panama', code: 'PAN', logo: '🇵🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'South Africa', code: 'RSA', logo: '🇿🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'New Zealand', code: 'NZL', logo: '🇳🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group L', entries: [{ rank: 1, teamName: 'Saudi Arabia', code: 'KSA', logo: '🇸🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Qatar', code: 'QAT', logo: '🇶🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Czechia', code: 'CZE', logo: '🇨🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Norway', code: 'NOR', logo: '🇳🇴', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] }
];

export const TRANSLATIONS = { en: {} };