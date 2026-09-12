import type { View } from "react-native";
import {
	cancelAnimation,
	type MeasuredDimensions,
	measure,
	useAnimatedReaction,
	useAnimatedRef,
	useDerivedValue,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";

import type { BoundaryLocalMeasurementValue } from "../../types";

const HOST_MEASUREMENT_RETRY_DELAY_MS = 16;
const MAX_HOST_MEASUREMENT_ATTEMPTS = 20;

type UseHostMeasurementParams = {
	measurementKey: string | null;
	boundaryMeasurements: BoundaryLocalMeasurementValue[];
};

export const useHostMeasurement = ({
	measurementKey,
	boundaryMeasurements,
}: UseHostMeasurementParams) => {
	const hostRef = useAnimatedRef<View>();
	const measurement = useSharedValue<{
		key: string;
		bounds: MeasuredDimensions;
	} | null>(null);
	const hostBounds = useDerivedValue(() => {
		const captured = measurement.get();
		return captured?.key === measurementKey ? captured.bounds : null;
	});
	const retryToken = useSharedValue(0);
	const attempts = useSharedValue({ key: measurementKey, count: 0 });

	useAnimatedReaction(
		() => {
			"worklet";
			if (!measurementKey) {
				return null;
			}

			// Hosts mount before their screen is visible. Wait for source capture
			// rather than caching the screen's initial offscreen position.
			let hasSource = false;
			for (const measurement of boundaryMeasurements) {
				if (measurement.get()) {
					hasSource = true;
					break;
				}
			}
			if (!hasSource) return null;
			return [
				measurementKey,
				measurement.get()?.key ?? null,
				retryToken.get(),
			] as const;
		},
		(state) => {
			"worklet";
			if (!state) {
				cancelAnimation(retryToken);
				return;
			}

			const [requestedKey, completedKey] = state;
			if (requestedKey === completedKey) {
				return;
			}

			cancelAnimation(retryToken);
			const count =
				attempts.get().key === requestedKey ? attempts.get().count : 0;
			if (count >= MAX_HOST_MEASUREMENT_ATTEMPTS) return;
			attempts.set({ key: requestedKey, count: count + 1 });

			const measured = measure(hostRef);
			if (!measured || measured.width <= 0 || measured.height <= 0) {
				if (count + 1 < MAX_HOST_MEASUREMENT_ATTEMPTS) {
					retryToken.set(
						withDelay(
							HOST_MEASUREMENT_RETRY_DELAY_MS,
							withTiming(retryToken.get() + 1, { duration: 0 }),
						),
					);
				}
				return;
			}

			measurement.set({ key: requestedKey, bounds: { ...measured } });
		},
	);
	return {
		hostBounds,
		hostRef,
	};
};
