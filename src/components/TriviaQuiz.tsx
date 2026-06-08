import React, { useState } from 'react';
import { Brain, Trophy, CheckCircle2, XCircle, ChevronRight, X } from 'lucide-react';

export const TriviaQuiz: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAns, setSelectedAns] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const questions = [
    {
      question: "Which country has won the most FIFA World Cup titles?",
      options: ["Germany", "Italy", "Argentina", "Brazil"],
      answer: "Brazil"
    },
    {
      question: "Who holds the record for the most goals scored in World Cup history?",
      options: ["Pelé", "Miroslav Klose", "Ronaldo Nazário", "Lionel Messi"],
      answer: "Miroslav Klose"
    },
    {
      question: "Which host nation was the first to be eliminated in the group stage?",
      options: ["South Africa (2010)", "Qatar (2022)", "Japan (2002)", "USA (1994)"],
      answer: "South Africa (2010)"
    }
  ];

  const handleAnswer = (opt: string) => {
    if (selectedAns) return;
    setSelectedAns(opt);
    if (opt === questions[currentQ].answer) setScore(score + 1);
  };

  const nextQuestion = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setSelectedAns(null);
    } else {
      setShowResult(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0B1121]/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.1)] relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-lg transition-colors z-10">
          <X className="w-5 h-5" />
        </button>

        {!showResult ? (
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                <Brain className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Intelligence Trivia</h3>
                <p className="text-xs text-slate-400 font-mono">Question {currentQ + 1} of {questions.length}</p>
              </div>
            </div>

            <h4 className="text-lg font-bold text-slate-200 mb-6 leading-snug">{questions[currentQ].question}</h4>

            <div className="space-y-3">
              {questions[currentQ].options.map((opt, idx) => {
                const isCorrect = opt === questions[currentQ].answer;
                const isSelected = selectedAns === opt;
                let btnClass = "bg-[#0B1121] border-white/10 text-slate-300 hover:border-indigo-500/50 hover:bg-indigo-500/5";

                if (selectedAns) {
                  if (isCorrect) btnClass = "bg-emerald-500/20 border-emerald-500/50 text-emerald-400";
                  else if (isSelected) btnClass = "bg-red-500/20 border-red-500/50 text-red-400";
                  else btnClass = "bg-[#0B1121] border-white/5 text-slate-600 opacity-50";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(opt)}
                    disabled={!!selectedAns}
                    className={`w-full text-left px-5 py-4 rounded-xl border font-bold transition-all flex justify-between items-center ${btnClass}`}
                  >
                    <span>{opt}</span>
                    {selectedAns && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                    {selectedAns && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-400" />}
                  </button>
                );
              })}
            </div>

            {selectedAns && (
              <button onClick={nextQuestion} className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                {currentQ < questions.length - 1 ? "Next Question" : "View Final Score"} <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <div className="p-10 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30 mb-6 relative">
              <div className="absolute inset-0 rounded-full animate-ping bg-amber-500/20"></div>
              <Trophy className="w-12 h-12 text-amber-400 relative z-10" />
            </div>
            <h3 className="text-3xl font-black text-white mb-2">Quiz Completed</h3>
            <p className="text-slate-400 mb-8 font-mono">Your Intelligence Score: <span className="text-white font-black">{score} / {questions.length}</span></p>
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-colors">
              Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};