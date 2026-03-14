import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const BACKEND_URL = Deno.env.get('BACKEND_URL') ?? ''
const API_KEY = Deno.env.get('API_KEY') ?? ''

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const url = new URL(req.url)
    const username = url.searchParams.get('username')

    if (!username) {
      return Response.json({ error: 'username is required' }, { status: 400 })
    }

    const res = await fetch(
      `${BACKEND_URL}/profiles/search?username=${encodeURIComponent(username)}`,
      {
        headers: { 'x-api-key': API_KEY },
      }
    )

    const data = await res.json()

    return Response.json(data, {
      status: res.status,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (_err) {
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
})
