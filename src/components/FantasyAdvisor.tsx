import React, { useState, useEffect } from 'react';
import { Match, FantasyAdvisorResult } from '../types';
import { Sparkles, Star } from 'lucide-react';

interface FantasyAdvisorProps {
  match: Match;
  lang: string;
  labels: Record<string, string>;
  hasApiKey: boolean;
}

export const FantasyAdvisor: React.FC<FantasyAdvisorProps> = ({ match }) => {
  const [advisor, setAdvisor] = useState<FantasyAdvisorResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchAdvisor = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/fantasy-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match }),
      });
      const data = await response.json();
      setAdvisor(data.advisor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvisor();
  }, [match.id]);

  if (loading) return <div className="text-center p-8 text-slate-400 text-xs">Formulating Fantasy XI...</div>;

  return (
    <div className="bg-[#0B0F19] border border-white/5 p-6 rounded-2xl space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-white/5">
        <h4 className="text-white font-extrabold flex items-center gap-2"><Sparkles className="text-emerald-400" /> Best XI Picks</h4>
        <span className="text-[10px] font-mono text-slate-500 uppercase">Composite Advisor</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-950/40 p-4 border border-white/5 rounded-lg">
          <span className="text-[10px] text-slate-500 block">CAPTAIN PICK</span>
          <strong className="text-emerald-400 text-sm font-black">{advisor?.captain || 'N/A'}</strong>
        </div>
        <div className="bg-slate-950/40 p-4 border border-white/5 rounded-lg">
          <span className="text-[10px] text-slate-500 block">VICE-CAPTAIN</span>
          <strong className="text-blue-400 text-sm font-black">{advisor?.viceCaptain || 'N/A'}</strong>
        </div>
      </div>

      <div className="space-y-3">
        {advisor?.bestXI.map((player, idx) => (
          <div key={idx} className="bg-white/5 p-3.5 rounded-lg border border-white/5 flex justify-between items-start text-xs">
            <div>
              <div className="flex gap-2 items-center">
                <span className="font-extrabold text-white text-sm">{player.name}</span>
                <span className="text-[10px] bg-white/5 border border-white/15 px-1.5 py-0.2 rounded text-slate-400 uppercase font-mono">{player.team}</span>
              </div>
              <p className="text-slate-400 mt-1">{player.reason}</p>
            </div>
            <div className="flex gap-1 items-center bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">
              <Star className="w-3 h-3 fill-emerald-500 text-emerald-500" /> {player.rating.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};