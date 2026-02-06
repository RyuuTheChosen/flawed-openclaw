/**
 * Web Audio API wrapper for playing Float32Array audio data.
 * Used by Kokoro TTS service for audio playback.
 */

export interface AudioPlayerEvents {
	onPlaybackStart?: () => void;
	onPlaybackEnd?: () => void;
}

export interface AudioPlayer {
	/**
	 * Play audio data at the specified sample rate.
	 */
	play(audioData: Float32Array, sampleRate: number): void;

	/**
	 * Stop current playback.
	 */
	stop(): void;

	/**
	 * Check if currently playing.
	 */
	isPlaying(): boolean;

	/**
	 * Get the AudioContext for frequency analysis.
	 */
	getAudioContext(): AudioContext | null;

	/**
	 * Get the AnalyserNode for frequency analysis.
	 */
	getAnalyserNode(): AnalyserNode | null;

	/**
	 * Set an analysis node for parallel audio tap (e.g., wLipSync).
	 * Each new source auto-connects to this node alongside the playback chain.
	 */
	setAnalysisNode(node: AudioNode | null): void;

	/**
	 * Cleanup resources.
	 */
	dispose(): void;
}

export function createAudioPlayer(events: AudioPlayerEvents = {}): AudioPlayer {
	let audioContext: AudioContext | null = null;
	let currentSource: AudioBufferSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let analysisNode: AudioNode | null = null;
	let playing = false;
	let disposed = false;

	function getContext(): AudioContext {
		if (!audioContext) {
			audioContext = new AudioContext();
			// Create analyser for frequency analysis
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.8;
		}
		return audioContext;
	}

	function cleanupSource(): void {
		if (currentSource) {
			try {
				currentSource.stop();
			} catch {
				// Already stopped
			}
			currentSource.disconnect();
			currentSource = null;
		}
	}

	return {
		play(audioData: Float32Array, sampleRate: number): void {
			if (disposed) return;

			// Stop any current playback
			cleanupSource();

			const ctx = getContext();

			// Resume context if suspended (browser autoplay policy)
			if (ctx.state === "suspended") {
				ctx.resume();
			}

			// Create audio buffer from Float32Array
			const audioBuffer = ctx.createBuffer(1, audioData.length, sampleRate);
			audioBuffer.getChannelData(0).set(audioData);

			// Create and connect source through analyser
			currentSource = ctx.createBufferSource();
			currentSource.buffer = audioBuffer;
			if (analyser) {
				currentSource.connect(analyser);
				analyser.connect(ctx.destination);
			} else {
				currentSource.connect(ctx.destination);
			}

			// Parallel tap for analysis (e.g., wLipSync)
			if (analysisNode) {
				currentSource.connect(analysisNode);
			}

			currentSource.onended = () => {
				if (disposed) return;
				playing = false;
				currentSource = null;
				events.onPlaybackEnd?.();
			};

			playing = true;
			events.onPlaybackStart?.();
			currentSource.start(0);
		},

		stop(): void {
			cleanupSource();
			playing = false;
		},

		isPlaying(): boolean {
			return playing;
		},

		getAudioContext(): AudioContext | null {
			return audioContext;
		},

		getAnalyserNode(): AnalyserNode | null {
			return analyser;
		},

		setAnalysisNode(node: AudioNode | null): void {
			analysisNode = node;
		},

		dispose(): void {
			disposed = true;
			cleanupSource();
			analysisNode = null; // Don't dispose — owned by caller
			if (analyser) {
				analyser.disconnect();
				analyser = null;
			}
			if (audioContext) {
				audioContext.close();
				audioContext = null;
			}
			playing = false;
		},
	};
}
