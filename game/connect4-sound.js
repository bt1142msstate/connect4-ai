// Small browser-generated sound effects for drops, AI moves, wins, and draws.
(function attachConnect4Sound(root) {
  const VOLUME = 0.045;
  const DROP_DURATION = 0.09;

  function createSoundController(options = {}) {
    let audioContext = null;
    let unlockPrimed = false;
    let unlockBound = false;
    const enabledControlId = options.enabledControlId ?? "soundEnabled";

    function isEnabled() {
      if (typeof document === "undefined") return false;
      const control = document.getElementById(enabledControlId);
      return !control || control.checked;
    }

    function getContext() {
      if (!isEnabled() || typeof window === "undefined") return null;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      return audioContext;
    }

    function unlock() {
      const context = getContext();
      if (!context) return false;

      // Mobile browsers usually require audio to be started from the first tap.
      // A one-sample silent source primes the context without making a sound.
      if (!unlockPrimed || context.state === "suspended") {
        try {
          const source = context.createBufferSource();
          source.buffer = context.createBuffer(1, 1, context.sampleRate);
          source.connect(context.destination);
          source.start(0);
          unlockPrimed = true;
        } catch {
          // Some browsers already consider the context unlocked; tone playback will confirm it.
        }
      }

      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      return context.state === "running";
    }

    function bindUnlockEvents(target) {
      const eventTarget = target ?? (typeof document !== "undefined" ? document : null);
      if (!eventTarget || unlockBound) return;
      unlockBound = true;
      const unlockFromGesture = () => unlock();
      eventTarget.addEventListener("pointerdown", unlockFromGesture, { passive: true });
      eventTarget.addEventListener("touchstart", unlockFromGesture, { passive: true });
      eventTarget.addEventListener("mousedown", unlockFromGesture);
      eventTarget.addEventListener("click", unlockFromGesture);
      eventTarget.addEventListener("keydown", unlockFromGesture);
    }

    function tone(frequency, startOffset, duration, type = "sine", volume = VOLUME) {
      const context = getContext();
      if (!context) return;

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + startOffset;
      const end = start + duration;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }

    function playDrop(player) {
      const base = player === 1 ? 196 : 246.94;
      tone(base, 0, DROP_DURATION, "triangle");
      tone(base * 1.5, 0.035, DROP_DURATION * 0.75, "sine", VOLUME * 0.75);
    }

    function playWin(player) {
      const rootFrequency = player === 1 ? 220 : 261.63;
      tone(rootFrequency, 0, 0.12, "triangle", VOLUME * 0.95);
      tone(rootFrequency * 1.25, 0.09, 0.12, "triangle", VOLUME * 0.9);
      tone(rootFrequency * 1.5, 0.18, 0.18, "triangle", VOLUME * 0.9);
    }

    function playDraw() {
      tone(174.61, 0, 0.12, "sine", VOLUME * 0.8);
      tone(164.81, 0.13, 0.14, "sine", VOLUME * 0.7);
    }

    return {
      isEnabled,
      unlock,
      bindUnlockEvents,
      playDrop,
      playWin,
      playDraw
    };
  }

  const api = { createSoundController };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4Sound = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
