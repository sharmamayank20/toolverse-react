// Shared backend base URL for PDF Tools (and any other server-backed tool).
// Single source of truth — import this instead of hardcoding the URL in
// each tool, so switching environments is a one-line change in one place.

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'
//export const API_BASE = 'http://localhost:3000' // <- swap to this for local dev against a locally running server
