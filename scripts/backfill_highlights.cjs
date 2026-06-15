require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DB_URL, ssl: { rejectUnauthorized: false } });

async function searchYouTube(home, away) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return null;
    const q1 = `FIFA official highlights ${home} vs ${away} World Cup 2026`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(q1)}&type=video&key=${key}`;
    try {
        const r = await fetch(url);
        const j = await r.json();
        const items = Array.isArray(j.items) ? j.items.filter(it => it.id?.videoId) : [];
        if (items.length) return items[0].id.videoId;
        const q2 = `FIFA TV highlights ${home} vs ${away} 2026`;
        const r2 = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(q2)}&type=video&key=${key}&videoDuration=short`);
        const j2 = await r2.json();
        const items2 = Array.isArray(j2.items) ? j2.items.filter(it => it.id?.videoId) : [];
        if (items2.length) return items2[0].id.videoId;
    } catch (e) {
        console.error('YT search error', e.message || e);
    }
    return null;
}

(async () => {
    let client;
    try {
        client = await pool.connect();
        const res = await client.query(
            `SELECT id, home_team, away_team, match_date, match_time, home_score, away_score, youtube_highlight_id
           FROM world_cup_matches
           WHERE (youtube_highlight_id IS NULL OR youtube_highlight_id = '')
             AND (
               (home_score IS NOT NULL AND away_score IS NOT NULL)
               OR (match_date < CURRENT_DATE)
             )
           LIMIT 200`
        );
        console.log('Rows to process:', res.rowCount);
        for (const row of res.rows) {
            const home = typeof row.home_team === 'string' ? row.home_team : (row.home_team?.name || 'Home');
            const away = typeof row.away_team === 'string' ? row.away_team : (row.away_team?.name || 'Away');
            console.log(`Searching highlight for ${row.id}: ${home} vs ${away}`);
            const vid = await searchYouTube(home, away);
            if (vid) {
                try {
                    await client.query('UPDATE world_cup_matches SET youtube_highlight_id = $1 WHERE id = $2', [vid, row.id]);
                    console.log(`Saved ${vid} for ${row.id}`);
                } catch (e) {
                    console.warn('DB update failed for', row.id, e.message || e);
                }
            } else {
                console.log('No video found for', row.id);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        client.release();
    } catch (err) {
        console.error('Backfill error:', err.message || err);
        try { if (client) client.release(); } catch (e) { }
    } finally {
        await pool.end();
    }
})();
