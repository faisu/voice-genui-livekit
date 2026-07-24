import type { CanvasState, LearnerProfile, QuizState } from "../lib/types.js";

const sessions = new Map<string, RoomSession>();

export type RoomSession = {
  roomName: string;
  currentCanvasState: CanvasState | null;
  currentQuiz: QuizState | null;
  learnerProfile: LearnerProfile | null;
  /** True once the personalized greeting has been issued. */
  greeted: boolean;
};

export function getRoomSession(roomName: string): RoomSession {
  let session = sessions.get(roomName);
  if (!session) {
    session = {
      roomName,
      currentCanvasState: null,
      currentQuiz: null,
      learnerProfile: null,
      greeted: false,
    };
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

export function setLearnerProfile(
  roomName: string,
  profile: LearnerProfile,
): void {
  const session = getRoomSession(roomName);
  session.learnerProfile = profile;
}

export function getLearnerProfile(roomName: string): LearnerProfile | null {
  return getRoomSession(roomName).learnerProfile ?? null;
}

export function markGreeted(roomName: string): void {
  getRoomSession(roomName).greeted = true;
}

export function hasGreeted(roomName: string): boolean {
  return getRoomSession(roomName).greeted;
}

export function clearRoomSession(roomName: string): void {
  sessions.delete(roomName);
}
