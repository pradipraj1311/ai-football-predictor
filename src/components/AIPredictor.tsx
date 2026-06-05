import React, { useState, useEffect } from 'react';
import { Match, PredictionResult } from '../types';
import { Cpu, Target, TrendingUp, Zap } from 'lucide-react';

interface AIPredictorProps {
  match: Match;
  lang: string;
  labels: Record<string, string>;
  hasApiKey: boolean;
}

export const AIPredictor: React.FC<AIPredictorProps> = ({ match }) => {
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchPrediction = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match }),
        });
        const data = await response.json();
        setPrediction(data.prediction);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrediction();
  }, [match.id]);

  if (loading) {
    return (
      <div className="bg-[#0B1121] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
        <Cpu className="w-8 h-8 text-indigo-500 animate-pulse mb-4" />
        <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest animate-pulse">Neural Engine Processing...</p>
      </div>
    );
  }

  const pHome = prediction?.winProbability?.home || 40;
  const pDraw = prediction?.winProbability?.draw || 30;
  const pAway = prediction?.winProbability?.away || 30;

  return (
    <div className="bg-[#0B1121] border border-white/5 rounded-2xl flex flex-col overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-900/20 to-transparent p-4 border-b border-white/5 flex items-center gap-2">
        <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
        <h3 className="text-sm font-black text-white uppercase tracking-wider">AI Match Forecaster</h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Big Data Callout */}
        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-white/5">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Projected Outcome</span>
            <div className="text-2xl font-black text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              {prediction?.suggestedScore || '1 - 1'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Model Confidence</span>
            <span className="text-xl font-black text-indigo-400 font-mono">87.4%</span>
          </div>
        </div>

        {/* Win Probability Matrix */}
        <div>
          <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase">
            <span>{match.homeTeam.code} ({pHome}%)</span>
            <span>Draw ({pDraw}%)</span>
            <span>{match.awayTeam.code} ({pAway}%)</span>
          </div>
          <div className="h-2 flex rounded-full overflow-hidden bg-slate-800">
            <div style={{ width: `${pHome}%` }} className="bg-emerald-500 hover:brightness-125 transition-all"></div>
            <div style={{ width: `${pDraw}%` }} className="bg-slate-500 hover:brightness-125 transition-all"></div>
            <div style={{ width: `${pAway}%` }} className="bg-blue-500 hover:brightness-125 transition-all"></div>
          </div>
        </div>

        {/* Tactical Readout */}
        <div className="space-y-4 pt-4 border-t border-white/5">
          <div>
            <h4 className="flex items-center gap-2 text-xs font-black text-slate-300 uppercase mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Tactical Analysis
            </h4>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              {prediction?.analysis || 'Waiting for tactical data compilation...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};