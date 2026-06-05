import React, { useState } from 'react';
import { TRIVIA_QUESTIONS } from '../data';
import { HelpCircle, Star } from 'lucide-react';

export const TriviaQuiz: React.FC = () => {
  const [idx, setIdx] = useState<number>(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  const active = TRIVIA_QUESTIONS[idx];

  const handleSelect = (optionIdx: number) => {
    if (submitted) return;
    setSelectedOpt(optionIdx);
  };

  const handleSubmit = () => {
    if (selectedOpt === null || submitted) return;
    setSubmitted(true);
    if (selectedOpt === active.answer) setScore((s) => s + 1);
  };

  const handleNext = () => {
    setIdx((prev) => (prev + 1) % TRIVIA_QUESTIONS.length);
    setSelectedOpt(null);
    setSubmitted(false);
  };

  return (
    <div className="bg-[#0B0F19] border border-white/5 p-6 rounded-2xl relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5 text-xs text-slate-400">
        <span className="font-bold flex items-center gap-1"><HelpCircle className="w-4 h-4 text-indigo-400" /> Trivia Quiz</span>
        <span className="flex items-center gap-1 text-emerald-400 font-mono font-bold"><Star className="w-3 h-3 fill-emerald-500 text-emerald-500" /> Score: {score}</span>
      </div>

      <div className="my-4 bg-slate-950/40 p-4 border border-white/5 rounded-lg text-white font-bold text-xs leading-relaxed">
        {active.question}
      </div>

      <div className="space-y-2">
        {active.options.map((opt, oIdx) => {
          let style = 'bg-white/5 border-white/5 text-slate-300';
          if (submitted) {
            if (oIdx === active.answer) style = 'bg-green-500/15 border-green-500/30 text-green-400';
            else if (selectedOpt === oIdx) style = 'bg-red-500/15 border-red-500/30 text-red-400';
          } else if (selectedOpt === oIdx) {
            style = 'bg-blue-600/20 border-blue-500 text-blue-400';
          }

          return (
            <button key={oIdx} onClick={() => handleSelect(oIdx)} className={`w-full text-left p-3 text-xs font-semibold rounded-lg border transition ${style}`}>
              {opt}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {!submitted ? (
          <button onClick={handleSubmit} disabled={selectedOpt === null} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white font-bold py-2.5 rounded-lg text-xs tracking-wider uppercase cursor-pointer">
            Submit Answer
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-400 text-xs italic leading-relaxed">{active.explanation}</p>
            <button onClick={handleNext} className="w-full bg-white/10 hover:bg-white/15 text-white py-2.5 rounded-lg text-xs tracking-wider uppercase font-extrabold cursor-pointer">
              Next Question
            </button>
          </div>
        )}
      </div>
    </div>
  );
};