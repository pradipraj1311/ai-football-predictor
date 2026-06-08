import React from 'react';
import { Flame, Megaphone } from 'lucide-react';

export const NewsTicker: React.FC = () => {
    const news = [
        "BREAKING: Real Madrid finalize terms for blockbuster summer signing.",
        "AI INSIGHT: Argentina's probability of winning the World Cup jumps to 24%.",
        "TRANSFER ALERT: Arsenal preparing €80M bid for elite defensive midfielder.",
        "WORLD CUP 2026: MetLife Stadium confirmed for the highly anticipated Final.",
        "INJURY UPDATE: Key Barcelona playmaker ruled out for 3 weeks due to hamstring tear.",
    ];

    return (
        <>
            <style>
                {`
          @keyframes marquee {
            0% { transform: translateX(100vw); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee {
            display: inline-flex;
            animation: marquee 90s linear infinite;
          }
          .animate-marquee:hover {
            animation-play-state: paused;
          }
        `}
            </style>
            <div className="bg-indigo-600/10 border-b border-indigo-500/20 overflow-hidden relative flex items-center h-10 z-50 backdrop-blur-md">

                {/* Fix 1: Made the label a bit wider (w-48) and gave it a z-index (z-20) */}
                <div className="bg-indigo-600 px-4 h-full flex items-center gap-2 absolute left-0 z-20 shadow-[15px_0_20px_rgba(11,17,33,0.9)] w-24 md:w-48 justify-center md:justify-start">
                    <Megaphone className="w-4 h-4 text-white animate-pulse shrink-0" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest hidden md:inline-block truncate">Live Matrix News</span>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest md:hidden">News</span>
                </div>

                {/* Fix 2: Added left margin so the text appears to come out from under the label */}
                <div className="animate-marquee pl-24 md:pl-56 cursor-pointer flex items-center h-full">
                    {news.map((item, idx) => (
                        <span key={idx} className="mx-8 text-xs font-bold text-slate-200 flex items-center gap-2 uppercase tracking-wide whitespace-nowrap">
                            <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" /> {item}
                        </span>
                    ))}
                </div>
            </div>
        </>
    );
};