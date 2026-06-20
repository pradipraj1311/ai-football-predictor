import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCache } from './redisCache'; // Assuming redisCache.ts is in the root. Adjust path if needed.

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. ALWAYS allow access to the maintenance toggle API and login
  if (pathname.startsWith('/api/maintenance') || pathname.startsWith('/api/login')) {
    return NextResponse.next();
  }

  // 2. ALWAYS allow static assets (CSS, JS, Images, Favicon)
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/assets') || 
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 3. Check the global maintenance state from Redis
  let isMaintenanceMode = false;
  try {
    const status = await getCache('maintenance_mode');
    isMaintenanceMode = status === true;
  } catch (error) {
    console.error('Middleware Redis check failed:', error);
    // Fail open: If Redis is down, allow traffic rather than taking down the site
    isMaintenanceMode = false; 
  }

  // 4. If Maintenance is ON and it's an API request, block it at the Edge
  if (isMaintenanceMode && pathname.startsWith('/api/')) {
    return new NextResponse(
      JSON.stringify({ 
        error: "Service unavailable due to maintenance.",
        maintenance: true 
      }),
      { 
        status: 503, 
        headers: { 'content-type': 'application/json' } 
      }
    );
  }

  // 5. If Maintenance is ON and it's a page request, rewrite to a static maintenance page
  // Note: Your React App currently handles the UI redirection, so blocking the APIs (step 4) 
  // is usually enough for SPAs (Single Page Applications).
  
  return NextResponse.next();
}

// Ensure middleware only runs on specific paths to save edge function execution time
export const config = {
  matcher: [
    // Match all API routes except maintenance/login
    '/api/((?!maintenance|login).*)',
  ],
};