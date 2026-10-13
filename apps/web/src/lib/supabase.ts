// UniVote uses Supabase as the Postgres host only. Application auth is the
// Express API (bcrypt credentials in tenant schemas + HS256 session JWTs).
// Do not add Supabase Auth sign-in here — those tokens are rejected by the API.
export {};
