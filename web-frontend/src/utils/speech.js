class SpeechManager {
	constructor() {
		this.audioCtx = null;
		this.audioUnlocked = false;
		this.speechQueue = [];
		this.sirenPlaying = false;
		this.addLog = null;
		this.lastSpokenText = "";
		this.lastSpokenAt = 0;
		this.cachedVoice = null;
		this.voicePromise = null;
		this.isDucking = false;
	}

	setDucking(active) {
		this.isDucking = active;
	}

	setLogger(loggerFn) {
		this.addLog = loggerFn;
	}

	unlockAudio() {
		if (this.audioUnlocked) return;
		this.audioCtx = new (
			window.AudioContext || window.webkitAudioContext
		)();
		const silent = new SpeechSynthesisUtterance("");
		silent.volume = 0;
		window.speechSynthesis.speak(silent);
		this.pickVoice();
		this.audioUnlocked = true;
	}

	async pickVoice() {
		if (this.cachedVoice) return this.cachedVoice;
		if (this.voicePromise) return this.voicePromise;

		this.voicePromise = new Promise((resolve) => {
			const selectVoice = () => {
				const voices = window.speechSynthesis.getVoices();
				if (!voices || voices.length === 0) {
					resolve(null);
					return;
				}

				const preferredVoice =
					voices.find((voice) =>
						/(Google|Microsoft|Samantha|Alex|Daniel|Serena|Kathy|Nicky|Ting-Ting|Moira|Ava)/i.test(
							voice.name,
						),
					) ||
					voices.find((voice) => /en-/i.test(voice.lang)) ||
					voices[0];

				this.cachedVoice = preferredVoice || null;
				resolve(this.cachedVoice);
			};

			selectVoice();
			window.speechSynthesis.onvoiceschanged = () => {
				if (!this.cachedVoice) {
					selectVoice();
				}
			};
		});

		return this.voicePromise;
	}

	formatText(text, tone) {
		if (tone === "briefing") {
			return text.replace(/,\s*/g, ", ").replace(/\s+/g, " ").trim();
		}

		if (tone === "callout") {
			return text
				.replace(/,\s*/g, ". ")
				.replace(/\b(Gear up|Flaps up|Landing gear up)\b/g, "$1.")
				.trim();
		}

		if (tone === "caution") {
			return text.replace(/,\s*/g, ". ").replace(/\s+/g, " ").trim();
		}

		return String(text).trim();
	}

	getVoiceProfile(tone) {
		const profiles = {
			briefing: { rate: 0.93, pitch: 1.02, volume: 1 },
			callout: { rate: 0.9, pitch: 0.98, volume: 1 },
			caution: { rate: 0.86, pitch: 0.94, volume: 1 },
			notice: { rate: 0.95, pitch: 1, volume: 1 },
			default: { rate: 0.93, pitch: 1, volume: 1 },
		};

		const profile = profiles[tone] || profiles.default;
		
		if (this.isDucking) {
			return { ...profile, volume: profile.volume * 0.25 };
		}
		
		return profile;
	}

	speak(text, options = {}) {
		const tone = options.tone || "default";
		const now = Date.now();
		const spokenText = this.formatText(text, tone);

		if (
			spokenText === this.lastSpokenText &&
			now - this.lastSpokenAt < 900
		) {
			return;
		}

		this.lastSpokenText = spokenText;
		this.lastSpokenAt = now;

		if (this.addLog) {
			this.addLog(spokenText);
		}

		if (!this.audioUnlocked) return;

		setTimeout(
			() => {
				const u = new SpeechSynthesisUtterance(spokenText);
				const profile = this.getVoiceProfile(tone);
				u.rate = profile.rate;
				u.pitch = profile.pitch;
				u.volume = profile.volume;
				if (this.cachedVoice) {
					u.voice = this.cachedVoice;
				}
				this.speechQueue.push(u);
				u.onend = () => {
					const index = this.speechQueue.indexOf(u);
					if (index > -1) this.speechQueue.splice(index, 1);
				};
				window.speechSynthesis.speak(u);
			},
			tone === "briefing" ? 220 : 140,
		);
	}

	playSiren() {
		if (!this.audioCtx || this.sirenPlaying) return;
		this.sirenPlaying = true;

		const osc = this.audioCtx.createOscillator();
		const gainNode = this.audioCtx.createGain();
		osc.type = "square";
		osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
		osc.frequency.setValueAtTime(880, this.audioCtx.currentTime + 0.25);
		gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
		osc.connect(gainNode);
		gainNode.connect(this.audioCtx.destination);
		osc.start();
		osc.stop(this.audioCtx.currentTime + 0.5);

		setTimeout(() => {
			this.sirenPlaying = false;
		}, 500);
	}
}

export const speechManager = new SpeechManager();
