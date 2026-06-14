import React from 'react';
import { Match } from '../types';
import { BrainCircuit } from 'lucide-react';

interface MatchCardProps {
  match: Match;
  isSelected: boolean;
  onSelect: () => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, isSelected, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer transition-all duration-200 rounded-xl border p-3.5 relative overflow-hidden ${isSelected
          ? 'bg-gradient-to-r from-indigo-950/40 to-[#0B1121] border-indigo-500/50 shadow-lg shadow-indigo-900/20'
          : 'bg-[#0B1121] border-white/5 hover:border-indigo-500/30'
        }`}
    >
      {/* AI Indicator Tab */}
      {isSelected && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
      )}

      <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <BrainCircuit className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-slate-600'}`} />
          <span className="text-[10px] font-mono text-slate-400 uppercase">{match.competition}</span>
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider ${match.status === 'LIVE' ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>
          {match.status === 'LIVE' ? `${match.minute}'` : match.date}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {/* Home Team Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{match.homeTeam?.logo || '⚽'}</span>
            <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{match.homeTeam?.name || 'Home'}</span>
          </div>
          <span className="text-base font-black text-white font-mono">{match.homeScore ?? '-'}</span>
        </div>

        {/* Away Team Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{match.awayTeam?.logo || '⚽'}</span>
            <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{match.awayTeam?.name || 'Away'}</span>
          </div>
          <span className="text-base font-black text-white font-mono">{match.awayScore ?? '-'}</span>
        </div>
      </div>
    </div>
  );
};