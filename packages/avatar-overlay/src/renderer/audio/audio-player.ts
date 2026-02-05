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
	 * Cleanup resources.
	 */
	dispose(): void;
}

export function createAudioPlayer(events: AudioPlayerEvents = {}): AudioPlayer {
	let audioContext: AudioContext | null = null;
	let currentSource: AudioBufferSourceNode | null = null;
	let playing = false;
	let disposed = false;

	function getContext(): AudioContext {
		if (!audioContext) {
			audioContext = new AudioContext();
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

			// Create and connect source
			currentSource = ctx.createBufferSource();
			currentSource.buffer = audioBuffer;
			currentSource.connect(ctx.destination);

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

		dispose(): void {
			disposed = true;
			cleanupSource();
			if (audioContext) {
				audioContext.close();
				audioContext = null;
			}
			playing = false;
		},
	};
}
