export interface FrequencyBands {
	low: number; // 0-300 Hz (voiced sounds) - normalized 0-1
	mid: number; // 300-2000 Hz (vowels)
	high: number; // 2000-8000 Hz (sibilants)
	energy: number; // Overall RMS energy
}

export interface FrequencyAnalyzerConfig {
	fftSize?: number; // Default: 256
	smoothing?: number; // Default: 0.8
	lowFreqEnd?: number; // Default: 300 Hz
	midFreqEnd?: number; // Default: 2000 Hz
	highFreqEnd?: number; // Default: 8000 Hz
}

export interface FrequencyAnalyzer {
	/** Attach to audio node chain */
	connectSource(source: AudioNode): void;
	/** Disconnect from chain */
	disconnect(): void;
	/** Get current frequency bands (call during animation frame) */
	analyze(): FrequencyBands;
	/** Get the underlying AnalyserNode for manual connection */
	getNode(): AnalyserNode;
	/** Cleanup */
	dispose(): void;
}

export function createFrequencyAnalyzer(
	audioContext: AudioContext,
	config?: FrequencyAnalyzerConfig,
): FrequencyAnalyzer {
	const fftSize = config?.fftSize ?? 256;
	const smoothing = config?.smoothing ?? 0.8;
	const lowEnd = config?.lowFreqEnd ?? 300;
	const midEnd = config?.midFreqEnd ?? 2000;
	const highEnd = config?.highFreqEnd ?? 8000;

	const analyser = audioContext.createAnalyser();
	analyser.fftSize = fftSize;
	analyser.smoothingTimeConstant = smoothing;

	const bufferLength = analyser.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);
	const nyquist = audioContext.sampleRate / 2;

	function freqToIndex(freq: number): number {
		return Math.min(
			Math.round((freq / nyquist) * bufferLength),
			bufferLength - 1,
		);
	}

	const lowIdx = freqToIndex(lowEnd);
	const midIdx = freqToIndex(midEnd);
	const highIdx = freqToIndex(highEnd);

	return {
		connectSource(source: AudioNode): void {
			source.connect(analyser);
		},

		disconnect(): void {
			analyser.disconnect();
		},

		analyze(): FrequencyBands {
			analyser.getByteFrequencyData(dataArray);

			let lowSum = 0;
			let midSum = 0;
			let highSum = 0;
			let total = 0;

			for (let i = 0; i < lowIdx; i++) {
				lowSum += dataArray[i];
				total += dataArray[i];
			}
			for (let i = lowIdx; i < midIdx; i++) {
				midSum += dataArray[i];
				total += dataArray[i];
			}
			for (let i = midIdx; i < highIdx; i++) {
				highSum += dataArray[i];
				total += dataArray[i];
			}

			return {
				low: lowSum / (lowIdx * 255) || 0,
				mid: midSum / ((midIdx - lowIdx) * 255) || 0,
				high: highSum / ((highIdx - midIdx) * 255) || 0,
				energy: total / (highIdx * 255) || 0,
			};
		},

		getNode(): AnalyserNode {
			return analyser;
		},

		dispose(): void {
			analyser.disconnect();
		},
	};
}
