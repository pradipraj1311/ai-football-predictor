import React, { useState, useEffect } from 'react';
import { Target, Zap, TrendingUp, AlertCircle, Coins, Activity, Loader2 } from 'lucide-react';

const teamLogoMap: Record<string, string> = {
    'ARG': '🇦🇷', 'FRA': '🇫🇷', 'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'BRA': '🇧🇷', 'POR': '🇵🇹', 'ESP': '🇪🇸', 'GER': '🇩🇪', 'ITA': '🇮🇹', 'NOR': '🇳🇴'
};

export const PlayerProps: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [propsData, setPropsData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('https://e2match.vercel.app/api/player-props')
            .then(res => res.json())
            .then(data => {
                setPropsData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Props error", err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="fixed inset-0 z-[100] bg-[#0B1121]/98 backdrop-blur-2xl overflow-y-auto pt-24 pb-12 px-4 md:px-8 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-[1200px] mx-auto">
                <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white flex items-center gap-3">
                            <Coins className="w-8 h-8 text-amber-400" /> AI Player Props
                        </h2>
                        <p className="text-sm text-slate-400 font-mono mt-2">Deep-learning generated micro-betting probabilities.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
                    >
                        Close
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-12 h-12 text-amber-400 animate-spin mb-4" />
                        <p className="text-slate-400 font-mono uppercase tracking-widest text-sm">Synthesizing AI Projections...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {propsData.map((prop, idx) => (
                            <div
                                key={idx}
                                className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-white/10 transition-colors shadow-xl animate-fade-in-up"
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                {/* Premium Glow Effect */}
                                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none ${prop.color === 'emerald' ? 'bg-emerald-500/10' : prop.color === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10'
                                    }`}></div>

                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div>
                                        <h3 className="text-xl font-black text-white">{prop.player}</h3>
                                        <span className="text-[10px] font-mono font-bold bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded mt-1 inline-flex items-center gap-1.5">
                                            {teamLogoMap[prop.team] || '⚽'} {prop.team}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Odds</span>
                                        <span className="text-xl font-mono font-black text-amber-400">{prop.odds}</span>
                                    </div>
                                </div>

                                <div className="bg-[#0B1121] border border-white/5 rounded-xl p-4 mb-4 relative z-10">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{prop.type}</span>
                                        <span className="text-xs font-black text-white bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/30">{prop.line}</span>
                                    </div>

                                    <div className="mt-4">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1.5">
                                            <span className="text-slate-500 flex items-center gap-1"><Activity className="w-3 h-3" /> AI Confidence</span>
                                            <span className={prop.color === 'emerald' ? 'text-emerald-400' : prop.color === 'blue' ? 'text-blue-400' : 'text-red-400'}>
                                                {prop.probability}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${prop.color === 'emerald' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : prop.color === 'blue' ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}
                                                style={{ width: `${prop.probability}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative z-10">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        <Zap className="w-3 h-3 text-amber-400" /> Tactical Justification
                                    </h4>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-4">{prop.analysis}</p>

                                    <div className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded border ${prop.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        prop.color === 'blue' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                            'bg-red-500/10 text-red-400 border-red-500/20'
                                        }`}>
                                        <AlertCircle className="w-3 h-3" /> AI Edge: {prop.edge}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};