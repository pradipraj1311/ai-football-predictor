import React from 'react';
import { Match } from '../types';
import { Swords, Clock, ChevronRight } from 'lucide-react';

export const H2HMatrix: React.FC<{ match: Match }> = ({ match }) => {
  // Simulated Head-to-Head Data
  const h2hStats = {
    total: 12,
    homeWins: 5,
    draws: 3,
    awayWins: 4,
    recentMeetings: ['W', 'D', 'L', 'W', 'W'] // From Home Team's perspective
  };

  // Simulated Match Timeline Events
  const events = [
    { minute: 12, type: 'yellow', player: 'Defensive Midfielder', team: 'away' },
    { minute: 34, type: 'goal', player: 'Star Striker', team: 'home' },
    { minute: 45, type: 'half-time', player: '', team: 'none' },
    { minute: 62, type: 'sub', player: 'Winger IN / Fullback OUT', team: 'home' },
    { minute: 78, type: 'goal', player: 'Attacking Midfielder', team: 'away' },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
      
      {/* Left Panel: Match Timeline */}
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-slate-800/40 to-transparent p-4 border-b border-white/5 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Match Timeline</h3>
        </div>
        <div className="p-6 relative">
           {/* Vertical Line */}
           <div className="absolute left-1/2 top-6 bottom-6 w-px bg-white/5 -translate-x-1/2"></div>
           
           <div className="space-y-4">
             {events.map((ev, idx) => (
               <div key={idx} className={`flex items-center w-full ${ev.team === 'home' ? 'justify-start' : ev.team === 'away' ? 'justify-end' : 'justify-center'}`}>
                  {ev.team === 'home' && (
                     <div className="w-1/2 pr-6 text-right">
                       <span className="text-xs font-bold text-white block">{ev.player}</span>
                     </div>
                  )}
                  
                  <div className="relative z-10 flex flex-col items-center justify-center w-8 h-8 rounded-full bg-[#0f172a] border border-white/10 shrink-0">
                     <span className="text-[9px] font-black text-slate-400">{ev.minute}'</span>
                     {ev.type === 'goal' && <span className="absolute -top-1 -right-1 text-xs">⚽</span>}
                     {ev.type === 'yellow' && <div className="absolute -top-1 -right-1 w-2.5 h-3 bg-yellow-400 rounded-sm shadow-sm transform rotate-12"></div>}
                     {ev.type === 'sub' && <span className="absolute -top-1 -right-1 text-[10px]">🔄</span>}
                  </div>

                  {ev.team === 'away' && (
                     <div className="w-1/2 pl-6 text-left">
                       <span className="text-xs font-bold text-white block">{ev.player}</span>
                     </div>
                  )}

                  {ev.team === 'none' && (
                    <div className="absolute w-full flex justify-center mt-8">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-[#0B1121] px-3 py-1 rounded-full border border-white/5">Half Time</span>
                    </div>
                  )}
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* Right Panel: Head-to-Head (H2H) */}
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-red-900/20 to-transparent p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Head-to-Head Matrix</h3>
          </div>
        </div>
        <div className="p-6">
           <div className="flex justify-between items-end mb-4">
              <div className="flex items-center gap-3">
                 <span className="text-3xl">{match.homeTeam.logo}</span>
                 <span className="text-2xl font-black text-slate-600">VS</span>
                 <span className="text-3xl">{match.awayTeam.logo}</span>
              </div>
              <div className="text-right">
                 <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Total Meetings</span>
                 <span className="text-2xl font-mono font-black text-white">{h2hStats.total}</span>
              </div>
           </div>

           {/* H2H Win Probability Bar */}
           <div className="mb-6">
             <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase font-mono tracking-widest">
               <span>{match.homeTeam.code} ({h2hStats.homeWins})</span>
               <span>Draw ({h2hStats.draws})</span>
               <span>{match.awayTeam.code} ({h2hStats.awayWins})</span>
             </div>
             <div className="h-2 flex rounded-full overflow-hidden bg-slate-800">
               <div style={{ width: `${(h2hStats.homeWins / h2hStats.total) * 100}%` }} className="bg-emerald-500"></div>
               <div style={{ width: `${(h2hStats.draws / h2hStats.total) * 100}%` }} className="bg-slate-500"></div>
               <div style={{ width: `${(h2hStats.awayWins / h2hStats.total) * 100}%` }} className="bg-blue-500"></div>
             </div>
           </div>

           {/* Recent Encounters */}
           <div>
              <h4 className="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-3">Recent Encounters (Last 5)</h4>
              <div className="flex justify-between items-center bg-[#0f172a] border border-white/5 rounded-xl p-3">
                 <div className="flex gap-1.5">
                   {h2hStats.recentMeetings.map((res, i) => (
                      <span key={i} className={`w-6 h-6 rounded text-[10px] font-black flex items-center justify-center font-mono ${res === 'W' ? 'bg-emerald-500/20 text-emerald-400' : res === 'D' ? 'bg-slate-500/20 text-slate-400' : 'bg-red-500/20 text-red-400'}`}>{res}</span>
                   ))}
                 </div>
                 <button className="text-[10px] font-bold text-indigo-400 flex items-center gap-1 hover:text-indigo-300 transition-colors uppercase tracking-wider">
                   Full History <ChevronRight className="w-3 h-3" />
                 </button>
              </div>
           </div>
        </div>
      </div>
      
    </div>
  );
};