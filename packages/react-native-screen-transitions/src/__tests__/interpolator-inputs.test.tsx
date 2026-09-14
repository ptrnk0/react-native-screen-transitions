import { afterEach, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
	createScreenTransitionState,
	DEFAULT_SCREEN_TRANSITION_OPTIONS,
} from "../constants";
import { hydrateTransitionState } from "../providers/screen/motion/animation/helpers/hydrate-transition-state";
import type {
	BuiltState,
	MotionAnimationState,
} from "../providers/screen/motion/animation/helpers/hydrate-transition-state/types";
import { useInterpolatorState } from "../providers/screen/orchestrator/helpers/use-interpolator-state";
import { mountMotionValues } from "./helpers/mount-motion-values";
import type { SharedValue } from "react-native-reanimated";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
	act(() => renderer?.unmount());
	renderer = undefined;
});
function shared<T>(value: T) {
	return {
		get: () => value,
		set: (next: T) => {
			value = next;
		},
	} as SharedValue<T>;
}
function motion(): MotionAnimationState {
	return {
		...mountMotionValues(),
		route: { key: "A", name: "Detail", params: { version: 1 } },
		meta: { example: true },
		options: {
			...DEFAULT_SCREEN_TRANSITION_OPTIONS,
			gestureEnabled: true,
			gestureDirection: "bidirectional",
		},
		hasAutoSnapPoint: true,
		sortedNumericSnapPoints: [0.25, 0.75, 1],
		scrollMetadata: shared(null),
	};
}
function legacy(state: MotionAnimationState): BuiltState {
	return {
		...state,
		gesture: state,
		optionsSlot: {},
		contentLayoutSlot: { width: 0, height: 0 },
		unwrapped: createScreenTransitionState(state.route),
	};
}
const dimensions = { width: 400, height: 800 };

it("keeps live hydration equivalent while excluding unused lifecycle inputs", () => {
	let state = motion();
	let actual: BuiltState | undefined;
	function Probe({ value }: { value: MotionAnimationState }) {
		actual = useInterpolatorState(value);
		return null;
	}
	act(() => {
		renderer = create(<Probe value={state} />);
	});
	const expected = legacy(state);
	for (const key of [
		"animationProgress",
		"pendingLifecycleRequestKind",
		"pendingLifecycleRequestTarget",
		"pendingLifecycleStartBlockCount",
		"actions",
	]) {
		expect(key in actual!).toBe(false);
		expect(key in actual!.gesture).toBe(false);
	}
	expect("progressBaseline" in actual!.gesture.internal).toBe(false);
	expect("lockedSnapPoint" in actual!.gesture.internal).toBe(false);
	expect(actual!.transitionProgress).toBe(state.transitionProgress);
	expect(actual!.gesture.internal.snapshot).toBe(state.internal.snapshot);
	const assertSame = () =>
		expect(hydrateTransitionState(actual!, dimensions)).toEqual(
			hydrateTransitionState(expected, dimensions),
		);
	assertSame();
	state.transitionProgress.set(0.65);
	state.targetProgress.set(0.75);
	state.resolvedAutoSnapPoint.set(0.6);
	state.measuredContentLayout.set({ width: 320, height: 480 });
	state.x.set(32);
	state.y.set(80);
	state.normX.set(0.08);
	state.normY.set(0.1);
	state.dragging.set(1);
	state.initiator.set("vertical");
	state.internal.progressDeltaX.set(0.08);
	state.internal.progressDeltaY.set(0.1);
	state.scale.set(0.8);
	state.normScale.set(-0.2);
	state.rotation.set(0.4);
	assertSame();
	state.dismissing.set(1);
	state.closing.set(1);
	state.internal.snapshot.normY.set(0.22);
	state.internal.snapshot.velocity.set(0.8);
	state.internal.snapshot.raw.rotation.set(0.33);
	state.internal.snapshot.active.set("pinch-in");
	assertSame();
	const output = actual!.unwrapped;
	state = {
		...state,
		route: { ...state.route, params: { version: 2 } },
		options: {
			...state.options,
			gestureDirection: "horizontal",
			gestureEnabled: false,
		},
		meta: { example: false },
		sortedNumericSnapPoints: [0.5, 1],
	};
	Object.assign(expected, {
		route: state.route,
		options: state.options,
		meta: state.meta,
		sortedNumericSnapPoints: state.sortedNumericSnapPoints,
	});
	act(() => renderer!.update(<Probe value={state} />));
	expect(actual!.unwrapped).toBe(output);
	assertSame();
	state.closing.set(0);
	state.dismissing.set(0);
	state.dragging.set(0);
	assertSame();
	expect(actual!.unwrapped.route.params).toEqual({ version: 2 });
});

it("preserves isolated output slots for multiple readers of shared motion", () => {
	const state = motion();
	let first: BuiltState | undefined, second: BuiltState | undefined;
	function Probe() {
		first = useInterpolatorState(state);
		second = useInterpolatorState(state);
		return null;
	}
	act(() => {
		renderer = create(<Probe />);
	});
	expect(first!.gesture.x).toBe(second!.gesture.x);
	expect(first!.unwrapped).not.toBe(second!.unwrapped);
	hydrateTransitionState(first!, dimensions, { gestureEnabled: false });
	hydrateTransitionState(second!, dimensions, { gestureEnabled: true });
	expect(first!.unwrapped.options.gestureEnabled).toBe(false);
	expect(second!.unwrapped.options.gestureEnabled).toBe(true);
});
