import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ofxxrgtzlxkxrsglibqk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHhyZ3R6bHhreHJzZ2xpYnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTY5MzYsImV4cCI6MjEwMDk5MjkzNn0.kVD_knCypKiT6p4jMIdA1vkegtmRS5XPH6axG6-asqw';

/**
 * Browser Client - For Client Components
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Server Client - For Next.js Route Handlers / Server Components
 */
export function createServerSupabaseClient(req: NextRequest, res?: NextResponse) {
  const response = res || NextResponse.next();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Middleware Client - For Next.js middleware.ts cookie refresh & authentication check
 */
export function createMiddlewareSupabaseClient(req: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, response };
}
