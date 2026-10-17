export const EDGE_PALM_REJECTION_DP = 16;

export interface TouchPoint {
  x: number;
  y: number;
}

export interface TouchEventData {
  touchCount: number;
  x: number;
  y: number;
  timestamp: number;
  pointers?: TouchPoint[];
  touches?: TouchPoint[];
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface GestureCallbacks {
  onSingleTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onTwoFingerDoubleTap?: () => void;
}

export interface GestureRecognizerConfig {
  doubleTapThresholdMs?: number; // max time between taps for double tap (default 350ms)
  longPressThresholdMs?: number; // min hold time for long press (default 1000ms)
  maxMoveDistance?: number; // max movement before cancelling tap/long press (default 40px)
  twoFingerTapWindowMs?: number; // window for 2-finger double tap (default 500ms)
  maxTapDurationMs?: number; // max contact duration to be considered a tap (default 500ms)
  edgeMarginPx?: number; // edge palm-rejection margin in px/dp (default 16)
  edgeSafeMarginDp?: number; // alias for edgeMarginPx
  viewportWidth?: number; // viewport width for edge palm-rejection (default 0 = disabled)
  viewportHeight?: number; // viewport height for edge palm-rejection (default 0 = disabled)
}

/**
 * Checks if a single touch coordinate lies strictly inside the safe interior zone
 * (away from the 16dp edge palm-rejection border).
 */
export function isPointInsideSafeZone(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  edgeMarginPx: number = EDGE_PALM_REJECTION_DP
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  if (
    viewportWidth <= edgeMarginPx * 2 ||
    viewportHeight <= edgeMarginPx * 2
  ) {
    return true;
  }
  return (
    x >= edgeMarginPx &&
    x <= viewportWidth - edgeMarginPx &&
    y >= edgeMarginPx &&
    y <= viewportHeight - edgeMarginPx
  );
}

/**
 * Filters a multi-touch pointer array to keep only pointers inside the safe interior zone.
 * Prevents gripping fingers/palm on the 16dp screen edge from contaminating interior taps.
 */
export function filterInteriorTouchPoints(
  pointers: readonly TouchPoint[],
  viewportWidth: number,
  viewportHeight: number,
  edgeMarginPx: number = EDGE_PALM_REJECTION_DP
): TouchPoint[] {
  if (!pointers || pointers.length === 0) return [];
  if (
    viewportWidth <= edgeMarginPx * 2 ||
    viewportHeight <= edgeMarginPx * 2
  ) {
    return pointers.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  return pointers.filter(p =>
    isPointInsideSafeZone(
      p.x,
      p.y,
      viewportWidth,
      viewportHeight,
      edgeMarginPx
    )
  );
}

/**
 * GestureRecognizer
 * Robust state machine for tactile multi-touch gestures on fullscreen canvas:
 * 1. Single Tap (1 chạm): Re-read detection / status (fires after double-tap window)
 * 2. Double Tap (2 chạm): Toggle flashlight (immediate on 2nd tap, cancels single tap)
 * 3. Long Press (giữ >= 1000ms): Read accumulated session wallet (suppresses taps)
 * 4. Two-Finger Double Tap (2 ngón chạm đúp): Reset session wallet to 0
 * 5. Per-Pointer 16dp Edge Palm-Rejection: Ignores edge palm touches and filters multi-touch pointers
 */
export class GestureRecognizer {
  private config: Required<Omit<GestureRecognizerConfig, 'edgeSafeMarginDp'>>;
  private callbacks: GestureCallbacks;

  // Single-finger timers
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  // Multi-finger timers
  private twoFingerTapTimer: ReturnType<typeof setTimeout> | null = null;

  // Active touch session tracking
  private activeTouches: number = 0;
  private maxTouchesInSession: number = 0;
  private sessionStartTime: number = 0;
  private sessionStartPoint: TouchPoint = { x: 0, y: 0 };
  private sessionMaxDisplacement: number = 0;
  private isLongPressTriggered: boolean = false;
  private palmRejectedCount: number = 0;

  // History tracking between taps
  private lastSingleTapReleaseTime: number = 0;
  private lastTwoFingerReleaseTime: number = 0;

  constructor(
    callbacks: GestureCallbacks,
    config: GestureRecognizerConfig = {}
  ) {
    this.callbacks = callbacks;
    this.config = {
      doubleTapThresholdMs: config.doubleTapThresholdMs ?? 350,
      longPressThresholdMs: config.longPressThresholdMs ?? 1000,
      maxMoveDistance: config.maxMoveDistance ?? 40,
      twoFingerTapWindowMs: config.twoFingerTapWindowMs ?? 500,
      maxTapDurationMs: config.maxTapDurationMs ?? 500,
      edgeMarginPx:
        config.edgeMarginPx ?? config.edgeSafeMarginDp ?? EDGE_PALM_REJECTION_DP,
      viewportWidth: config.viewportWidth ?? 0,
      viewportHeight: config.viewportHeight ?? 0,
    };
  }

  public updateCallbacks(callbacks: GestureCallbacks): void {
    this.callbacks = callbacks;
  }

  public setViewportSize(width: number, height: number): void {
    this.config.viewportWidth = width;
    this.config.viewportHeight = height;
  }

  public getViewportSize(): { width: number; height: number } {
    return {
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
    };
  }

  public getPalmRejectedCount(): number {
    return this.palmRejectedCount;
  }

  /**
   * Called on touch start or when additional fingers touch down
   */
  public handleTouchStart(event: TouchEventData): void {
    const { timestamp } = event;
    const vw = event.viewportWidth ?? this.config.viewportWidth;
    const vh = event.viewportHeight ?? this.config.viewportHeight;
    const pts = event.pointers ?? event.touches;

    let touchCount = event.touchCount;
    let x = event.x;
    let y = event.y;

    if (vw > 0 && vh > 0) {
      if (pts && pts.length > 0) {
        const interiorPointers = filterInteriorTouchPoints(
          pts,
          vw,
          vh,
          this.config.edgeMarginPx
        );
        const rejectedInEvent = pts.length - interiorPointers.length;
        if (rejectedInEvent > 0) {
          this.palmRejectedCount += rejectedInEvent;
        }
        if (interiorPointers.length === 0) {
          return;
        }
        touchCount = interiorPointers.length;
        x = interiorPointers[0].x;
        y = interiorPointers[0].y;
      } else if (
        !isPointInsideSafeZone(x, y, vw, vh, this.config.edgeMarginPx)
      ) {
        this.palmRejectedCount++;
        return;
      }
    }

    const wasSessionIdle = this.sessionStartTime === 0;
    this.activeTouches = touchCount;
    this.maxTouchesInSession = Math.max(this.maxTouchesInSession, touchCount);

    // Initialize session start time and point when touch session starts
    if (wasSessionIdle) {
      this.sessionStartTime = timestamp;
      this.sessionStartPoint = { x, y };
      this.sessionMaxDisplacement = 0;
      this.isLongPressTriggered = false;
    }

    if (this.maxTouchesInSession >= 2) {
      // Multi-touch detected: cancel any pending single-finger timers immediately
      this.cancelSingleFingerTimers();
      return;
    }

    // If a session was already active with 1 interior finger (e.g. a secondary touch landed in the 16dp edge zone and was filtered out),
    // preserve the ongoing single-finger session and its longPressTimer without resetting it.
    if (!wasSessionIdle) {
      return;
    }

    // If a single tap was waiting for double-tap window, cancel it since another touch started
    if (this.singleTapTimer) {
      clearTimeout(this.singleTapTimer);
      this.singleTapTimer = null;
    }

    // Start 1000ms Long Press timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    this.longPressTimer = setTimeout(() => {
      if (
        !this.isLongPressTriggered &&
        this.maxTouchesInSession === 1 &&
        this.sessionMaxDisplacement <= this.config.maxMoveDistance
      ) {
        this.isLongPressTriggered = true;
        if (this.twoFingerTapTimer) {
          clearTimeout(this.twoFingerTapTimer);
          this.twoFingerTapTimer = null;
        }
        this.lastTwoFingerReleaseTime = 0;
        this.callbacks.onLongPress?.();
      }
    }, this.config.longPressThresholdMs);
  }

  /**
   * Called on touch move
   */
  public handleTouchMove(event: {
    touchCount: number;
    dx: number;
    dy: number;
    pointers?: TouchPoint[];
    touches?: TouchPoint[];
    viewportWidth?: number;
    viewportHeight?: number;
  }): void {
    if (this.sessionStartTime === 0) {
      return;
    }

    const vw = event.viewportWidth ?? this.config.viewportWidth;
    const vh = event.viewportHeight ?? this.config.viewportHeight;
    const pts = event.pointers ?? event.touches;

    let touchCount = event.touchCount;
    let dx = event.dx;
    let dy = event.dy;

    if (vw > 0 && vh > 0 && pts && pts.length > 0) {
      const interiorPointers = filterInteriorTouchPoints(
        pts,
        vw,
        vh,
        this.config.edgeMarginPx
      );
      if (interiorPointers.length === 0) {
        // Active interior touch moved out into the 16dp edge palm-rejection zone -> cancel tap/long-press
        const p0 = pts[0];
        const moveDx = p0.x - this.sessionStartPoint.x;
        const moveDy = p0.y - this.sessionStartPoint.y;
        const edgeDist = Math.max(
          Math.sqrt(moveDx * moveDx + moveDy * moveDy),
          this.config.maxMoveDistance + 1
        );
        this.sessionMaxDisplacement = Math.max(
          this.sessionMaxDisplacement,
          edgeDist
        );
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        return;
      }
      touchCount = interiorPointers.length;
      if ((dx === 0 && dy === 0) || pts.length !== interiorPointers.length) {
        dx = interiorPointers[0].x - this.sessionStartPoint.x;
        dy = interiorPointers[0].y - this.sessionStartPoint.y;
      }
    }

    this.activeTouches = touchCount;
    this.maxTouchesInSession = Math.max(this.maxTouchesInSession, touchCount);

    if (this.maxTouchesInSession >= 2) {
      this.cancelSingleFingerTimers();
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    this.sessionMaxDisplacement = Math.max(this.sessionMaxDisplacement, dist);

    // If finger moves beyond threshold, cancel long press
    if (this.sessionMaxDisplacement > this.config.maxMoveDistance) {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
  }

  /**
   * Called on touch release
   */
  public handleTouchEnd(event: {
    touchCount?: number;
    x: number;
    y: number;
    timestamp: number;
    pointers?: TouchPoint[];
    touches?: TouchPoint[];
    viewportWidth?: number;
    viewportHeight?: number;
  }): void {
    const { timestamp } = event;
    const vw = event.viewportWidth ?? this.config.viewportWidth;
    const vh = event.viewportHeight ?? this.config.viewportHeight;
    const pts = event.pointers ?? event.touches;

    let remainingTouches = event.touchCount;
    if (vw > 0 && vh > 0 && pts !== undefined) {
      const interiorPointers = filterInteriorTouchPoints(
        pts,
        vw,
        vh,
        this.config.edgeMarginPx
      );
      remainingTouches = interiorPointers.length;
    }

    // If some interior touches still remain on the screen, wait for all interior touches to release
    if (remainingTouches !== undefined && remainingTouches > 0) {
      this.activeTouches = remainingTouches;
      return;
    }

    // Clean up long press timer on release
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // If long press was already executed during this press, consume release cleanly
    if (this.isLongPressTriggered) {
      this.isLongPressTriggered = false;
      this.resetSession();
      return;
    }

    if (this.sessionStartTime === 0) {
      this.resetSession();
      return;
    }

    const sessionDuration = timestamp - this.sessionStartTime;

    // Check if movement exceeded threshold (drag/swipe, not tap)
    if (this.sessionMaxDisplacement > this.config.maxMoveDistance) {
      this.resetSession();
      return;
    }

    // Contact duration should be relatively brief for a tap
    if (sessionDuration > this.config.maxTapDurationMs) {
      this.resetSession();
      return;
    }

    // --- CASE 1: Multi-Finger Gesture (2+ fingers) ---
    if (this.maxTouchesInSession >= 2) {
      const timeSinceLastTwoFinger =
        timestamp - this.lastTwoFingerReleaseTime;

      if (
        this.lastTwoFingerReleaseTime > 0 &&
        timeSinceLastTwoFinger <= this.config.twoFingerTapWindowMs
      ) {
        // Two-Finger Double Tap completed!
        if (this.twoFingerTapTimer) {
          clearTimeout(this.twoFingerTapTimer);
          this.twoFingerTapTimer = null;
        }
        this.lastTwoFingerReleaseTime = 0;
        this.callbacks.onTwoFingerDoubleTap?.();
      } else {
        // First two-finger tap registered
        this.lastTwoFingerReleaseTime = timestamp;
        if (this.twoFingerTapTimer) {
          clearTimeout(this.twoFingerTapTimer);
        }
        this.twoFingerTapTimer = setTimeout(() => {
          this.lastTwoFingerReleaseTime = 0;
          this.twoFingerTapTimer = null;
        }, this.config.twoFingerTapWindowMs);
      }

      this.resetSession();
      return;
    }

    // --- CASE 2: Single-Finger Gesture (Double Tap vs Single Tap) ---
    // A single-finger tap breaks/clears any pending two-finger tap sequence
    if (this.twoFingerTapTimer) {
      clearTimeout(this.twoFingerTapTimer);
      this.twoFingerTapTimer = null;
    }
    this.lastTwoFingerReleaseTime = 0;

    const timeSinceLastTap = timestamp - this.lastSingleTapReleaseTime;

    if (
      this.lastSingleTapReleaseTime > 0 &&
      timeSinceLastTap <= this.config.doubleTapThresholdMs
    ) {
      // Second tap arrived within window -> Cancel pending single tap and trigger Double Tap
      if (this.singleTapTimer) {
        clearTimeout(this.singleTapTimer);
        this.singleTapTimer = null;
      }
      this.lastSingleTapReleaseTime = 0;
      this.callbacks.onDoubleTap?.();
      this.resetSession();
      return;
    }

    // First tap of potential double tap sequence
    this.lastSingleTapReleaseTime = timestamp;

    // Wait for double tap window before committing to single tap
    if (this.singleTapTimer) {
      clearTimeout(this.singleTapTimer);
    }
    this.singleTapTimer = setTimeout(() => {
      this.callbacks.onSingleTap?.();
      this.singleTapTimer = null;
      this.lastSingleTapReleaseTime = 0;
    }, this.config.doubleTapThresholdMs);

    this.resetSession();
  }

  /**
   * Cancel all pending timers and clear history
   */
  public destroy(): void {
    this.cancelSingleFingerTimers();
    if (this.twoFingerTapTimer) {
      clearTimeout(this.twoFingerTapTimer);
      this.twoFingerTapTimer = null;
    }
    this.lastTwoFingerReleaseTime = 0;
    this.resetSession();
  }

  private resetSession(): void {
    this.activeTouches = 0;
    this.maxTouchesInSession = 0;
    this.sessionStartTime = 0;
    this.sessionStartPoint = { x: 0, y: 0 };
    this.sessionMaxDisplacement = 0;
    this.isLongPressTriggered = false;
  }

  private cancelSingleFingerTimers(): void {
    if (this.singleTapTimer) {
      clearTimeout(this.singleTapTimer);
      this.singleTapTimer = null;
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.lastSingleTapReleaseTime = 0;
  }
}
