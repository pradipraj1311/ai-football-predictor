require('dotenv').config();
const { Pool } = require('pg');

(async () => {
    const pool = new Pool({ connectionString: process.env.DB_URL, ssl: { rejectUnauthorized: false } });
    try {
        const client = await pool.connect();
        const res = await client.query("SELECT id, youtube_highlight_id FROM world_cup_matches WHERE youtube_highlight_id IS NOT NULL LIMIT 50");
        console.log('FOUND:', res.rowCount);
        res.rows.forEach(r => console.log(r));
        client.release();
    } catch (err) {
        console.error('DB CHECK ERROR:', err.message || err);
    } finally {
        await pool.end();
    }
})();
