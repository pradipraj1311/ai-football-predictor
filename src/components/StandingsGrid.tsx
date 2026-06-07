import React from 'react';
import { Trophy } from 'lucide-react';

export const StandingsGrid: React.FC<{ standings: any[] }> = ({ standings }) => {
  if (!standings || standings.length === 0) return null;

  const group = standings[0]; // Displaying Group A for the sidebar

  return (
    <div className="bg-[#0B1121] border border-white/5 rounded-xl flex flex-col overflow-hidden shadow-lg mt-4 shrink-0">
      <div className="bg-gradient-to-r from-indigo-900/20 to-transparent p-3 border-b border-white/5 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-indigo-400" />
        <h3 className="text-xs font-black text-white uppercase tracking-wider">{group.groupName} Standings</h3>
      </div>
      
      <div className="p-0">
        <div className="grid grid-cols-12 gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest p-2 border-b border-white/5 bg-slate-900/50">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-5">Team</div>
          <div className="col-span-2 text-center">P</div>
          <div className="col-span-2 text-center">GD</div>
          <div className="col-span-2 text-center text-indigo-400">PTS</div>
        </div>

        <div className="flex flex-col">
          {group.entries.map((team: any, index: number) => (
            <div 
              key={team.code} 
              className={`grid grid-cols-12 gap-2 items-center p-2 text-xs border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors ${index < 2 ? 'border-l-2 border-l-emerald-500 bg-emerald-500/5' : ''}`}
            >
              <div className="col-span-1 text-center font-mono text-slate-500">{team.rank}</div>
              <div className="col-span-5 flex items-center gap-2 font-bold text-slate-200">
                <span className="text-sm">{team.logo}</span>
                <span className="truncate">{team.code}</span>
              </div>
              <div className="col-span-2 text-center font-mono text-slate-400">{team.played}</div>
              <div className="col-span-2 text-center font-mono text-slate-400">{team.gd}</div>
              <div className="col-span-2 text-center font-mono font-black text-indigo-400 bg-indigo-500/10 rounded py-0.5">{team.points}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 bg-slate-900/30 text-[9px] text-slate-500 flex justify-between font-mono uppercase border-t border-white/5">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Qualify</span>
        <span>World Cup 2026</span>
      </div>
    </div>
  );
};