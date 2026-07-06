class SpeechManager {
  constructor() {
    this.audioCtx = null;
    this.audioUnlocked = false;
    this.speechQueue = [];
    this.sirenPlaying = false;
    this.addLog = null;
  }

  setLogger(loggerFn) {
    this.addLog = loggerFn;
  }

  unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
    this.audioUnlocked = true;
  }

  speak(text) {
    if (this.addLog) {
      this.addLog(text);
    }
    
    if (!this.audioUnlocked) return;

    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.25;
      this.speechQueue.push(u);
      u.onend = () => {
        const index = this.speechQueue.indexOf(u);
        if (index > -1) this.speechQueue.splice(index, 1);
      };
      window.speechSynthesis.speak(u);
    }, 150);
  }

  playSiren() {
    if (!this.audioCtx || this.sirenPlaying) return;
    this.sirenPlaying = true;

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, this.audioCtx.currentTime + 0.25);
    gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.5);

    setTimeout(() => { this.sirenPlaying = false; }, 500);
  }
}

export const speechManager = new SpeechManager();
