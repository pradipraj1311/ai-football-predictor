import React from 'react';

type TeamEntry = {
  rank: number;
  teamName: string;
  logo: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  gd: number;
  points: number;
};

type Group = {
  groupName: string;
  entries: TeamEntry[];
};

type StandingsGridProps = {
  standings: Group[];
};

export const StandingsGrid: React.FC<StandingsGridProps> = ({ standings }) => {
  if (!standings || standings.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {standings.map(({ groupName, entries }) => (
        <div key={groupName} className="bg-[#0B1121] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
          <h3 className="text-sm font-black text-white uppercase tracking-widest p-4 bg-gradient-to-r from-indigo-900/30 to-transparent border-b border-white/5">
            {groupName}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 font-mono">
                  <th className="p-3 pl-4 w-8">#</th>
                  <th className="p-3">Team</th>
                  <th className="p-3 text-center">P</th>
                  <th className="p-3 text-center">W</th>
                  <th className="p-3 text-center">D</th>
                  <th className="p-3 text-center">L</th>
                  <th className="p-3 text-center">GD</th>
                  <th className="p-3 pr-4 text-center font-bold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((team) => (
                  <tr key={team.teamName} className="border-t border-white/5">
                    <td className="p-3 pl-4 font-mono text-slate-400">{team.rank}</td>
                    <td className="p-3 font-bold text-white">
                      <div className="flex items-center gap-3">
                        <img src={team.logo} alt={`${team.teamName} logo`} className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span>{team.teamName}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono text-slate-300">{team.played}</td>
                    <td className="p-3 text-center font-mono text-slate-300">{team.win}</td>
                    <td className="p-3 text-center font-mono text-slate-300">{team.draw}</td>
                    <td className="p-3 text-center font-mono text-slate-300">{team.lose}</td>
                    <td className="p-3 text-center font-mono text-slate-300">{team.gd > 0 ? `+${team.gd}` : team.gd}</td>
                    <td className="p-3 pr-4 text-center font-mono font-bold text-white">{team.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};