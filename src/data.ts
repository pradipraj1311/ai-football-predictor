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
  { id: 'mar', name: 'Morocco', code: 'MAR', logo: '🇲🇦', country: 'Africa', founded: 1955, stadium: 'Stade Mohammed V', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'bih', name: 'Bosnia and Herzegovina', code: 'BIH', logo: '🇧🇦', country: 'Europe', founded: 1992, stadium: 'Bilino Polje', form: ['L', 'L', 'L', 'W', 'L'] },
  { id: 'qat', name: 'Qatar', code: 'QAT', logo: '🇶🇦', country: 'Asia', founded: 1960, stadium: 'Khalifa International Stadium', form: ['W', 'D', 'W', 'L', 'W'] },
  { id: 'sui', name: 'Switzerland', code: 'SUI', logo: '🇨🇭', country: 'Europe', founded: 1895, stadium: 'St. Jakob-Park', form: ['D', 'W', 'D', 'W', 'D'] },
  { id: 'hai', name: 'Haiti', code: 'HAI', logo: '🇭🇹', country: 'North America', founded: 1904, stadium: 'Stade Sylvio Cator', form: ['D', 'L', 'D', 'L', 'W'] },
  { id: 'sco', name: 'Scotland', code: 'SCO', logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', country: 'Europe', founded: 1873, stadium: 'Hampden Park', form: ['L', 'D', 'L', 'L', 'D'] },
  { id: 'tur', name: 'Türkiye', code: 'TUR', logo: '🇹🇷', country: 'Europe', founded: 1923, stadium: 'Atatürk Olympic Stadium', form: ['L', 'D', 'L', 'W', 'D'] },
  { id: 'cuw', name: 'Curaçao', code: 'CUW', logo: '🇨🇼', country: 'North America', founded: 1921, stadium: 'Ergilio Hato Stadium', form: ['W', 'D', 'L', 'L', 'W'] },
  { id: 'civ', name: 'Ivory Coast', code: 'CIV', logo: '🇨🇮', country: 'Africa', founded: 1960, stadium: 'Stade Alassane Ouattara', form: ['W', 'D', 'W', 'W', 'D'] },
  { id: 'ecu', name: 'Ecuador', code: 'ECU', logo: '🇪🇨', country: 'South America', founded: 1925, stadium: 'Estadio Rodrigo Paz Delgado', form: ['W', 'L', 'W', 'L', 'W'] },
  { id: 'ned', name: 'Netherlands', code: 'NED', logo: '🇳🇱', country: 'Europe', founded: 1889, stadium: 'Johan Cruyff Arena', form: ['W', 'W', 'L', 'W', 'W'] },
  { id: 'swe', name: 'Sweden', code: 'SWE', logo: '🇸🇪', country: 'Europe', founded: 1904, stadium: 'Friends Arena', form: ['L', 'W', 'L', 'W', 'W'] },
  { id: 'tun', name: 'Tunisia', code: 'TUN', logo: '🇹🇳', country: 'Africa', founded: 1957, stadium: 'Stade Hammadi Agrebi', form: ['D', 'D', 'L', 'D', 'W'] },
  { id: 'bel', name: 'Belgium', code: 'BEL', logo: '🇧🇪', country: 'Europe', founded: 1895, stadium: 'King Baudouin Stadium', form: ['W', 'D', 'D', 'W', 'D'] },
  { id: 'egy', name: 'Egypt', code: 'EGY', logo: '🇪🇬', country: 'Africa', founded: 1921, stadium: 'Cairo International Stadium', form: ['D', 'W', 'W', 'D', 'W'] },
  { id: 'irn', name: 'IR Iran', code: 'IRN', logo: '🇮🇷', country: 'Asia', founded: 1920, stadium: 'Azadi Stadium', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'nzl', name: 'New Zealand', code: 'NZL', logo: '🇳🇿', country: 'Oceania', founded: 1891, stadium: 'Sky Stadium', form: ['L', 'D', 'L', 'W', 'L'] },
  { id: 'cpv', name: 'Cabo Verde', code: 'CPV', logo: '🇨🇻', country: 'Africa', founded: 1982, stadium: 'Estádio Nacional de Cabo Verde', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'ksa', name: 'Saudi Arabia', code: 'KSA', logo: '🇸🇦', country: 'Asia', founded: 1956, stadium: 'King Fahd International Stadium', form: ['D', 'W', 'D', 'W', 'L'] },
  { id: 'uru', name: 'Uruguay', code: 'URU', logo: '🇺🇾', country: 'South America', founded: 1900, stadium: 'Estadio Centenario', form: ['D', 'L', 'D', 'W', 'W'] },
  { id: 'irq', name: 'Iraq', code: 'IRQ', logo: '🇮🇶', country: 'Asia', founded: 1948, stadium: 'Basra International Stadium', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'nor', name: 'Norway', code: 'NOR', logo: '🇳🇴', country: 'Europe', founded: 1902, stadium: 'Ullevaal Stadion', form: ['D', 'L', 'D', 'D', 'L'] },
  { id: 'alg', name: 'Algeria', code: 'ALG', logo: '🇩🇿', country: 'Africa', founded: 1962, stadium: 'Stade du 5 Juillet 1962', form: ['W', 'D', 'W', 'D', 'W'] },
  { id: 'aut', name: 'Austria', code: 'AUT', logo: '🇦🇹', country: 'Europe', founded: 1904, stadium: 'Ernst-Happel-Stadion', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'jor', name: 'Jordan', code: 'JOR', logo: '🇯🇴', country: 'Asia', founded: 1949, stadium: 'Amman International Stadium', form: ['W', 'W', 'L', 'W', 'W'] },
  { id: 'por', name: 'Portugal', code: 'POR', logo: '🇵🇹', country: 'Europe', founded: 1914, stadium: 'Estádio Nacional', form: ['W', 'L', 'W', 'W', 'W'] },
  { id: 'cod', name: 'Congo DR', code: 'COD', logo: '🇨🇩', country: 'Africa', founded: 1919, stadium: 'Stade des Martyrs', form: ['D', 'W', 'D', 'D', 'L'] },
  { id: 'uzb', name: 'Uzbekistan', code: 'UZB', logo: '🇺🇿', country: 'Asia', founded: 1946, stadium: 'Milliy Stadium', form: ['D', 'W', 'W', 'D', 'W'] },
  { id: 'col', name: 'Colombia', code: 'COL', logo: '🇨🇴', country: 'South America', founded: 1924, stadium: 'Estadio Metropolitano', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'cro', name: 'Croatia', code: 'CRO', logo: '🇭🇷', country: 'Europe', founded: 1912, stadium: 'Stadion Maksimir', form: ['W', 'W', 'W', 'D', 'W'] },
  { id: 'gha', name: 'Ghana', code: 'GHA', logo: '🇬🇭', country: 'Africa', founded: 1957, stadium: 'Baba Yara Stadium', form: ['W', 'L', 'D', 'L', 'D'] },
  { id: 'pan', name: 'Panama', code: 'PAN', logo: '🇵🇦', country: 'North America', founded: 1937, stadium: 'Estadio Rommel Fernández', form: ['W', 'L', 'L', 'W', 'L'] }
];

// Corrected and expanded list of plausible 48 teams for the 2026 World Cup, distributed into 12 groups.
// Note: This is a fictional group draw for demonstration purposes.
export const WORLD_CUP_STANDINGS = [
  { groupName: 'Group A', entries: [{ rank: 1, teamName: 'Mexico', code: 'MEX', logo: '🇲🇽', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'South Africa', code: 'RSA', logo: '🇿🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'South Korea', code: 'KOR', logo: '🇰🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Czechia', code: 'CZE', logo: '🇨🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group B', entries: [{ rank: 1, teamName: 'Canada', code: 'CAN', logo: '🇨🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Bosnia and Herzegovina', code: 'BIH', logo: '🇧🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Qatar', code: 'QAT', logo: '🇶🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Switzerland', code: 'SUI', logo: '🇨🇭', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group C', entries: [{ rank: 1, teamName: 'Brazil', code: 'BRA', logo: '🇧🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Morocco', code: 'MAR', logo: '🇲🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Haiti', code: 'HAI', logo: '🇭🇹', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Scotland', code: 'SCO', logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group D', entries: [{ rank: 1, teamName: 'United States', code: 'USA', logo: '🇺🇸', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Paraguay', code: 'PAR', logo: '🇵🇾', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Australia', code: 'AUS', logo: '🇦🇺', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Türkiye', code: 'TUR', logo: '🇹🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group E', entries: [{ rank: 1, teamName: 'Germany', code: 'GER', logo: '🇩🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Curaçao', code: 'CUW', logo: '🇨🇼', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Ivory Coast', code: 'CIV', logo: '🇨🇮', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Ecuador', code: 'ECU', logo: '🇪🇨', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group F', entries: [{ rank: 1, teamName: 'Netherlands', code: 'NED', logo: '🇳🇱', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Japan', code: 'JPN', logo: '🇯🇵', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Sweden', code: 'SWE', logo: '🇸🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Tunisia', code: 'TUN', logo: '🇹🇳', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group G', entries: [{ rank: 1, teamName: 'Belgium', code: 'BEL', logo: '🇧🇪', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Egypt', code: 'EGY', logo: '🇪🇬', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'IR Iran', code: 'IRN', logo: '🇮🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'New Zealand', code: 'NZL', logo: '🇳🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group H', entries: [{ rank: 1, teamName: 'Spain', code: 'ESP', logo: '🇪🇸', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Cabo Verde', code: 'CPV', logo: '🇨🇻', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Saudi Arabia', code: 'KSA', logo: '🇸🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Uruguay', code: 'URU', logo: '🇺🇾', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group I', entries: [{ rank: 1, teamName: 'France', code: 'FRA', logo: '🇫🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Senegal', code: 'SEN', logo: '🇸🇳', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Iraq', code: 'IRQ', logo: '🇮🇶', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Norway', code: 'NOR', logo: '🇳🇴', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group J', entries: [{ rank: 1, teamName: 'Argentina', code: 'ARG', logo: '🇦🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Algeria', code: 'ALG', logo: '🇩🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Austria', code: 'AUT', logo: '🇦🇹', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Jordan', code: 'JOR', logo: '🇯🇴', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group K', entries: [{ rank: 1, teamName: 'Portugal', code: 'POR', logo: '🇵🇹', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Congo DR', code: 'COD', logo: '🇨🇩', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Uzbekistan', code: 'UZB', logo: '🇺🇿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Colombia', code: 'COL', logo: '🇨🇴', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] },
  { groupName: 'Group L', entries: [{ rank: 1, teamName: 'England', code: 'ENG', logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 2, teamName: 'Croatia', code: 'CRO', logo: '🇭🇷', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 3, teamName: 'Ghana', code: 'GHA', logo: '🇬🇭', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }, { rank: 4, teamName: 'Panama', code: 'PAN', logo: '🇵🇦', played: 0, win: 0, draw: 0, lose: 0, gd: '0', points: 0 }] }
];

export const TRANSLATIONS = { en: {} };