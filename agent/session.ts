import type { CanvasState, QuizState } from "../lib/types.js";

const sessions = new Map<string, RoomSession>();

export type RoomSession = {
  roomName: string;
  currentCanvasState: CanvasState | null;
  currentQuiz: QuizState | null;
};

export function getRoomSession(roomName: string): RoomSession {
  let session = sessions.get(roomName);
  if (!session) {
    session = { roomName, currentCanvasState: null, currentQuiz: null };
    sessions.set(roomName, session);
  }
  return session;
}

export function setCanvasState(roomName: string, state: CanvasState): void {
  const session = getRoomSession(roomName);
  session.currentCanvasState = state;
}

export function getCanvasState(roomName: string): CanvasState | null {
  return getRoomSession(roomName).currentCanvasState ?? null;
}

export function setQuizState(roomName: string, state: QuizState): void {
  const session = getRoomSession(roomName);
  session.currentQuiz = state;
}

export function getQuizState(roomName: string): QuizState | null {
  return getRoomSession(roomName).currentQuiz ?? null;
}

export function clearRoomSession(roomName: string): void {
  sessions.delete(roomName);
}
