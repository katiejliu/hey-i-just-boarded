// Cloudflare Worker: OpenSky API Proxy
// Forwards requests to OpenSky and returns the response
// Deployed at: https://<your-worker>.workers.dev/api/states/all?...

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Only allow /api/ paths
    if (!url.pathname.startsWith('/api/')) {
      return new Response('OpenSky Proxy', { status: 200 });
    }
    
    // Build OpenSky URL
    const openskyUrl = `https://opensky-network.org${url.pathname}${url.search}`;
    
    // Forward auth header if present
    const headers = {};
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    try {
      const response = await fetch(openskyUrl, { headers });
      const body = await response.text();
      
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
