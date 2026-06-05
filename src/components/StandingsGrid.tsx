import React from 'react';
import { Award } from 'lucide-react';
import { WORLD_CUP_STANDINGS } from '../data';

export const StandingsGrid: React.FC = () => {
  return (
    <div className="bg-[#0B1121] border border-white/5 p-6 rounded-2xl">
      <h3 className="text-white font-extrabold flex items-center gap-2 mb-6">
        <Award className="text-indigo-400" /> Group A Standings
      </h3>
      <table className="w-full text-left text-xs text-slate-300">
        <thead>
          <tr className="border-b border-white/5 text-slate-500 uppercase tracking-wider">
            <th className="py-2">Team</th>
            <th className="py-2 text-center">Played</th>
            <th className="py-2 text-center text-indigo-400">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {WORLD_CUP_STANDINGS.map((entry, idx) => (
            <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
              <td className="py-3 text-white font-bold">{entry.teamName}</td>
              <td className="py-3 text-center">{entry.played}</td>
              <td className="py-3 text-center text-indigo-400 font-black">{entry.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};