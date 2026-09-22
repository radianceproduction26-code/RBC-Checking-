/**
 * Frame Voting Logic for Temporal Stability
 * Rule: A sleeve is considered missing only if detected missing in 3 consecutive frames.
 * This prevents false alarms caused by motion blur, lighting flicker, or transient hand occlusion.
 */

export class FrameVotingTracker {
  constructor(windowSize = 3) {
    this.windowSize = windowSize;
    // History stores arrays of booleans [true, false, ...] where true = missing, false = present
    this.history = {
      1: [],
      2: [],
      3: [],
    };
  }

  reset() {
    this.history = {
      1: [],
      2: [],
      3: [],
    };
  }

  /**
   * Updates state with raw per-frame classification and returns debounced verdict
   * @param {Array<{id: number, rawPresent: boolean}>} rawSleeves
   * @returns {Array<{id: number, votedPresent: boolean, consecutiveMissingCount: number}>}
   */
  update(rawSleeves) {
    return rawSleeves.map((sleeve) => {
      const id = sleeve.id;
      if (!this.history[id]) {
        this.history[id] = [];
      }

      const isRawMissing = !sleeve.rawPresent;
      this.history[id].push(isRawMissing);

      // Keep only last N frames
      if (this.history[id].length > this.windowSize) {
        this.history[id].shift();
      }

      // Count consecutive missing frames from the end
      let consecutiveMissing = 0;
      for (let i = this.history[id].length - 1; i >= 0; i--) {
        if (this.history[id][i] === true) {
          consecutiveMissing++;
        } else {
          break;
        }
      }

      // Confirmed missing ONLY if detected missing in `windowSize` consecutive frames (3 frames)
      const confirmedMissing = consecutiveMissing >= this.windowSize;
      const votedPresent = !confirmedMissing;

      return {
        id,
        votedPresent,
        consecutiveMissingCount: consecutiveMissing,
        historyLength: this.history[id].length,
      };
    });
  }
}
