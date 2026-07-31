import type { CanvasState, LearnerProfile } from "../lib/types.js";
import type { SceneOpsDocument } from "../lib/sceneOps.js";
import type { DemoSummary } from "../lib/recipes/types.js";

const sessions = new Map<string, RoomSession>();

type StageReadyWaiter = {
  lessonId: string;
  stageId: string;
  resolve: (result: { timedOut: boolean }) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type RoomSession = {
  roomName: string;
  currentCanvasState: CanvasState | null;
  /** Last applied scene ops (agent-internal; used for patch context). */
  accumulatedSceneOps: SceneOpsDocument | null;
  lastSkillId: string | null;
  lastDemoSummary: DemoSummary | null;
  learnerProfile: LearnerProfile | null;
  /** True once the personalized greeting has been issued. */
  greeted: boolean;
  activeLessonId: string | null;
  stageReadyWaiters: StageReadyWaiter[];
};

export function getRoomSession(roomName: string): RoomSession {
  let session = sessions.get(roomName);
  if (!session) {
    session = {
      roomName,
      currentCanvasState: null,
      accumulatedSceneOps: null,
      lastSkillId: null,
      lastDemoSummary: null,
      learnerProfile: null,
      greeted: false,
      activeLessonId: null,
      stageReadyWaiters: [],
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

export function setLastSkillId(roomName: string, skillId: string | null): void {
  getRoomSession(roomName).lastSkillId = skillId;
}

export function getLastSkillId(roomName: string): string | null {
  return getRoomSession(roomName).lastSkillId;
}

export function setDemoSummary(
  roomName: string,
  summary: DemoSummary | null,
): void {
  getRoomSession(roomName).lastDemoSummary = summary;
}

export function getDemoSummary(roomName: string): DemoSummary | null {
  return getRoomSession(roomName).lastDemoSummary;
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

export function setAccumulatedSceneOps(
  roomName: string,
  lessonId: string,
  doc: SceneOpsDocument | null,
): void {
  const session = getRoomSession(roomName);
  session.activeLessonId = lessonId;
  session.accumulatedSceneOps = doc;
}

export function getAccumulatedSceneOps(
  roomName: string,
): SceneOpsDocument | null {
  return getRoomSession(roomName).accumulatedSceneOps;
}

export function getActiveLessonId(roomName: string): string | null {
  return getRoomSession(roomName).activeLessonId;
}

export function clearStagedLesson(roomName: string): void {
  const session = getRoomSession(roomName);
  session.accumulatedSceneOps = null;
  session.activeLessonId = null;
  for (const waiter of session.stageReadyWaiters) {
    clearTimeout(waiter.timer);
    waiter.resolve({ timedOut: true });
  }
  session.stageReadyWaiters = [];
}

/**
 * Wait until the client reports stage_ready for this lesson/stage,
 * or until timeoutMs elapses (so a missed ACK cannot stall the lesson).
 */
export function waitForStageReady(
  roomName: string,
  lessonId: string,
  stageId: string,
  timeoutMs = 2500,
): Promise<{ timedOut: boolean }> {
  const session = getRoomSession(roomName);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      session.stageReadyWaiters = session.stageReadyWaiters.filter(
        (w) => w.timer !== timer,
      );
      resolve({ timedOut: true });
    }, timeoutMs);
    session.stageReadyWaiters.push({ lessonId, stageId, resolve, timer });
  });
}

export function resolveStageReady(
  roomName: string,
  lessonId: string,
  stageId: string,
): boolean {
  const session = getRoomSession(roomName);
  const idx = session.stageReadyWaiters.findIndex(
    (w) => w.lessonId === lessonId && w.stageId === stageId,
  );
  if (idx === -1) return false;
  const [waiter] = session.stageReadyWaiters.splice(idx, 1);
  if (!waiter) return false;
  clearTimeout(waiter.timer);
  waiter.resolve({ timedOut: false });
  return true;
}

export function clearRoomSession(roomName: string): void {
  const session = sessions.get(roomName);
  if (!session) return;
  for (const waiter of session.stageReadyWaiters) {
    clearTimeout(waiter.timer);
    waiter.resolve({ timedOut: true });
  }
  sessions.delete(roomName);
}
