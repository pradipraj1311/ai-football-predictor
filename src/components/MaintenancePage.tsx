import React from 'react';
import { BrainCircuit, Wrench } from 'lucide-react';

export const MaintenancePage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 font-sans">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
          <BrainCircuit className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">E2match<span className="text-indigo-400">.ai</span></h1>
      </div>
      <div className="text-center p-8 bg-[#0B1121] rounded-2xl border border-white/10 max-w-md shadow-2xl">
        <Wrench className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Under Maintenance</h2>
        <p className="text-slate-400">We are currently performing scheduled maintenance to improve our AI and services. We'll be back online shortly. Thank you for your patience!</p>
      </div>
    </div>
  );
};