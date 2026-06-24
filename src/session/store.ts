/**
 * D1-backed session store. State and transcript are persisted as JSON on the
 * session row so the chat loop genuinely carries state across turns (and across
 * Worker invocations, which are stateless).
 */
import type { SessionState, ChatMessage } from '../types';

export interface LoadedSession {
  state: SessionState;
  messages: ChatMessage[];
  turn: number;
}

export function newState(sessionId: string): SessionState {
  const now = Date.now();
  return {
    sessionId,
    stage: 'greeting',
    questionsAsked: 0,
    w2: {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadSession(db: D1Database, sessionId: string): Promise<LoadedSession> {
  const row = await db
    .prepare('SELECT state_json, messages_json, turn FROM sessions WHERE session_id = ?')
    .bind(sessionId)
    .first<{ state_json: string; messages_json: string; turn: number }>();

  if (!row) {
    return { state: newState(sessionId), messages: [], turn: 0 };
  }
  return {
    state: JSON.parse(row.state_json) as SessionState,
    messages: JSON.parse(row.messages_json) as ChatMessage[],
    turn: row.turn,
  };
}

export async function saveSession(
  db: D1Database,
  state: SessionState,
  messages: ChatMessage[],
  turn: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (session_id, state_json, messages_json, turn, created_at, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         state_json = excluded.state_json,
         messages_json = excluded.messages_json,
         turn = excluded.turn,
         updated_at = excluded.updated_at`
    )
    .bind(state.sessionId, JSON.stringify(state), JSON.stringify(messages), turn, state.createdAt, Date.now())
    .run();
}
