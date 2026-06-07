import React from 'react';
import { Match } from '../types';
import { Activity, BarChart3, Crosshair, ShieldAlert } from 'lucide-react';

export const LiveTelemetry: React.FC<{ match: Match }> = ({ match }) => {
  // Simulated telemetry data for premium visual effect based on current score
  const homeAdvantage = match.homeScore >= match.awayScore;
  const homePossession = homeAdvantage ? 58 : 42;
  const awayPossession = 100 - homePossession;

  // Generate a random-looking but realistic momentum wave
  const momentumBars = [
    20, 35, 15, -25, -45, -15, 40, 65, 80, 45, 10, -30, -60, -20, 50, 75, 30, -10, -40
  ];

  return (
    <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl mt-6">
      <div className="bg-gradient-to-r from-blue-900/20 to-transparent p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Live Match Telemetry</h3>
        </div>
        <span className="text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded animate-pulse">
          DATA STREAM ACTIVE
        </span>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-10">
        {/* Left: Attack Momentum Graph */}
        <div>
          <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest uppercase mb-6">
            <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> Attack Momentum (Last 15 Mins)
          </h4>
          
          <div className="h-32 flex items-end justify-between gap-1 border-y border-white/5 py-2 relative">
            {/* 0-Line Indicator */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-700/50 border-dashed z-0"></div>
            
            {momentumBars.map((val, i) => (
              <div key={i} className="w-full relative flex flex-col justify-center items-center h-full z-10 group">
                {val > 0 ? (
                  <div 
                    className="w-full bg-emerald-500/80 rounded-t-sm absolute bottom-1/2 group-hover:bg-emerald-400 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.2)]" 
                    style={{ height: `${val / 2}%` }}
                  ></div>
                ) : (
                  <div 
                    className="w-full bg-blue-500/80 rounded-b-sm absolute top-1/2 group-hover:bg-blue-400 transition-colors shadow-[0_0_8px_rgba(59,130,246,0.2)]" 
                    style={{ height: `${Math.abs(val) / 2}%` }}
                  ></div>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-between text-[9px] font-mono font-bold text-slate-500 mt-3 uppercase tracking-wider">
            <span className="text-emerald-500/70">{match.homeTeam.name} Pressure</span>
            <span className="text-blue-500/70">{match.awayTeam.name} Pressure</span>
          </div>
        </div>

        {/* Right: Key Stats Matrix */}
        <div className="flex flex-col justify-center gap-6">
          {/* Possession */}
          <div>
            <div className="flex justify-between text-xs font-black text-white mb-2">
              <span className="font-mono">{homePossession}%</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Ball Possession</span>
              <span className="font-mono">{awayPossession}%</span>
            </div>
            <div className="h-2 flex rounded-full overflow-hidden bg-[#0f172a] shadow-inner">
              <div style={{ width: `${homePossession}%` }} className="bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
              <div style={{ width: `${awayPossession}%` }} className="bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]"></div>
            </div>
          </div>

          {/* Dangerous Attacks */}
          <div>
            <div className="flex justify-between text-xs font-black text-white mb-2">
              <span className="font-mono">{match.homeScore * 14 + 21}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-red-400" /> Dangerous Attacks
              </span>
              <span className="font-mono">{match.awayScore * 12 + 18}</span>
            </div>
            <div className="h-2 flex rounded-full overflow-hidden bg-[#0f172a] shadow-inner">
              <div style={{ width: `${homeAdvantage ? 65 : 40}%` }} className="bg-emerald-500"></div>
              <div style={{ width: `${homeAdvantage ? 35 : 60}%` }} className="bg-blue-500"></div>
            </div>
          </div>

          {/* Shots on Target */}
          <div>
            <div className="flex justify-between text-xs font-black text-white mb-2">
              <span className="font-mono">{match.homeScore + 3}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Crosshair className="w-3 h-3 text-indigo-400" /> Shots on Target
              </span>
              <span className="font-mono">{match.awayScore + 2}</span>
            </div>
            <div className="h-2 flex rounded-full overflow-hidden bg-[#0f172a] shadow-inner">
              <div style={{ width: `${homeAdvantage ? 70 : 30}%` }} className="bg-emerald-500"></div>
              <div style={{ width: `${homeAdvantage ? 30 : 70}%` }} className="bg-blue-500"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};