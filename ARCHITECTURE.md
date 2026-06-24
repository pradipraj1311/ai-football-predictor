# AI Football Predictor - API Structure

## Overview
This project has been restructured with a modular, scalable architecture. The mapping problem has been solved by organizing routes into separate modules.

## Project Structure

```
ai-football-predictor/
├── index.ts                    # Main entry point (was empty, now properly mapped)
├── server.ts                   # Original server (can be deprecated)
├── src/
│   ├── types/
│   │   └── match.ts           # Type definitions for Match, Team, Prediction, etc.
│   ├── utils/
│   │   └── matchTransform.ts  # Data transformation and prediction logic
│   └── routes/
│       ├── matchRoutes.ts     # Match and prediction endpoints
│       ├── adminRoutes.ts     # Admin and maintenance endpoints
│       └── liveRoutes.ts      # Live matches and events endpoints
├── middleware.ts              # Next.js middleware
├── redisCache.ts              # Redis caching utilities
└── [other config files]
```

## New Features Added

### 1. **Advanced Match Prediction** (`/api/predictions`)
- AI-powered predictions based on team form and H2H records
- Confidence scores
- Suggested bets
- Probability calculations (Home Win, Draw, Away Win)

### 2. **Team Statistics** (`/api/team-stats/:teamId`)
- Historical match data
- Win/Draw/Loss records
- Goals for/against
- Recent form tracking
- Redis-cached for performance

### 3. **Advanced Search** (`/api/search`)
- Search by team name
- Search by competition
- Fuzzy matching
- Type-specific filtering (team, competition, etc.)

### 4. **Live Match Tracking** (`/api/live-matches`)
- Real-time match status
- Demo data with fallbacks
- Possession, shots, fouls statistics
- Event timeline

### 5. **Match Events** (`/api/match/:matchId/events`)
- Goals, cards, substitutions
- Time-indexed events
- Cached for fast retrieval

### 6. **Organized Admin Tools** 
- Maintenance mode management
- Health checks
- Cache info
- System status

## API Endpoints

### Match Data
- `GET /api/db-matches` - All matches from database
- `GET /api/live-matches` - Currently live matches
- `GET /api/upcoming-matches` - Matches scheduled for future
- `GET /api/completed-matches` - Finished matches

### Intelligence & Analytics
- `GET /api/predictions` - AI match predictions
- `GET /api/team-stats/:teamId` - Team statistics
- `GET /api/search?q=query&type=team` - Search matches

### Match Details
- `GET /api/match/:matchId/events` - Match timeline

### Admin
- `GET /api/maintenance/status` - Check maintenance mode
- `POST /api/maintenance/enable` - Enable maintenance (requires password)
- `POST /api/maintenance/disable` - Disable maintenance (requires password)
- `GET /api/health` - Health check
- `GET /api/admin/cache-info` - Cache statistics

### System
- `GET /api/status` - API status
- `GET /` - API documentation

## Key Improvements

✅ **Modular Routes** - Each feature set in its own file
✅ **Type Safety** - Full TypeScript type definitions
✅ **Reusable Utilities** - Match transformation logic centralized
✅ **Caching Strategy** - Redis + memory hybrid caching
✅ **Error Handling** - Graceful fallbacks and error responses
✅ **CORS Support** - All endpoints accessible from frontend
✅ **Maintenance Mode** - Global service control
✅ **Demo Data** - Fallback data for development

## How to Use

### Start the server:
```bash
npm install
npm run dev  # or ts-node index.ts
```

### Test endpoints:
```bash
# Get all predictions
curl http://localhost:3000/api/predictions

# Get team stats
curl http://localhost:3000/api/team-stats/argentina

# Search for matches
curl "http://localhost:3000/api/search?q=france&type=team"

# Check system health
curl http://localhost:3000/api/health
```

## Caching
- **Redis**: Primary cache (if available)
- **Memory Fallback**: Used when Redis unavailable
- **Cache Durations**:
  - Live matches: 60 seconds
  - Predictions: 30 minutes
  - Team stats: 1 hour

## Environment Variables
```
DB_URL=postgresql://...
YOUTUBE_API_KEY=...
GEMINI_API_KEY=...
ADMIN_PASSWORD=...
REDIS_URL=... (optional)
PORT=3000
```

## Migration from Old Structure
The original `server.ts` contains duplicated logic. After verification, you can:
1. Point to `index.ts` as your main entry point
2. Keep `server.ts` as reference only
3. All functionality has been migrated and organized

## Next Steps
1. Test each endpoint
2. Verify database connectivity
3. Enable Redis for production caching
4. Customize AI prediction algorithm
5. Add more sophisticated match analysis
