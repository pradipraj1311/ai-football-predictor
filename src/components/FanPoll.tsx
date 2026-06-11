import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

interface PollData {
    team_id: string;
    team_name: string;
    flag: string;
    votes: number;
}

export default function FanPoll() {
    const [pollData, setPollData] = useState<PollData[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [hasVoted, setHasVoted] = useState<boolean>(false);
    const [totalVotes, setTotalVotes] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        // Safely check local storage (prevents crashes in strict WebViews)
        try {
            if (localStorage.getItem('e2match_voted')) {
                setHasVoted(true);
            }
        } catch (error) {
            console.warn("Local storage is blocked by this browser environment.");
        }

        fetchPollData();
    }, []);

    const fetchPollData = async () => {
        try {
            const res = await fetch('/api/poll');
            const data = await res.json();
            setPollData(data);
            setTotalVotes(data.reduce((acc: number, curr: PollData) => acc + curr.votes, 0));
            setLoading(false);
        } catch (err) {
            console.error("Poll fetch error", err);
            setLoading(false);
        }
    };

    const handleVote = async (team_id: string) => {
        if (hasVoted) return;

        setHasVoted(true);

        // Safely set local storage
        try {
            localStorage.setItem('e2match_voted', 'true');
        } catch (error) {
            console.warn("Could not save vote state to local storage.");
        }

        try {
            const res = await fetch('/api/poll/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_id })
            });
            const updatedData = await res.json();
            setPollData(updatedData);
            setTotalVotes(updatedData.reduce((acc: number, curr: PollData) => acc + curr.votes, 0));
        } catch (err) {
            console.error("Vote submission error", err);
        }
    };

    const filteredTeams = pollData.filter(team =>
        team.team_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return null;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full">
            <h3 className="text-white font-bold text-lg mb-1">Whose Fan Are You? 🏆</h3>
            <p className="text-slate-400 text-sm mb-4">Search and vote for your World Cup 2026 favorite team!</p>

            <div className="relative mb-4">
                <input
                    type="text"
                    placeholder="Search country..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 text-white placeholder-slate-400 text-sm rounded-lg pl-10 pr-4 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>

            {/* Teams List (With Scroll) */}
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredTeams.map((team) => {
                    const percentage = totalVotes === 0 ? 0 : Math.round((team.votes / totalVotes) * 100);

                    return (
                        <div
                            key={team.team_id}
                            onClick={() => handleVote(team.team_id)}
                            className={`relative overflow-hidden rounded-lg border ${hasVoted ? 'border-slate-800 bg-slate-800/50' : 'border-slate-700 hover:border-indigo-500 cursor-pointer transition-all'
                                } p-3 flex items-center justify-between z-10`}
                        >
                            {/* Progress Bar Background */}
                            {hasVoted && (
                                <div
                                    className="absolute top-0 left-0 h-full bg-indigo-600/30 -z-10 transition-all duration-1000 ease-out"
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            )}

                            <div className="flex items-center space-x-3">
                                <span className="text-xl">{team.flag}</span>
                                <span className="text-white font-medium">{team.team_name}</span>
                            </div>

                            {hasVoted && (
                                <div className="flex flex-col items-end relative z-10 bg-slate-900/60 px-2 py-1 rounded-md border border-white/5 backdrop-blur-sm shadow-sm">
                                    <span className="text-white font-black drop-shadow-md">{percentage}%</span>
                                    <span className="text-slate-300 font-medium text-[10px] drop-shadow-md">{team.votes} fans</span>
                                </div>
                            )}
                        </div>
                    );
                })}
                {filteredTeams.length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-4">No teams found.</p>
                )}
            </div>

            {hasVoted && (
                <div className="mt-4 text-center text-slate-400 text-xs">
                    Total Fan Votes: <span className="font-bold text-white">{totalVotes}</span>
                </div>
            )}
        </div>
    );
}