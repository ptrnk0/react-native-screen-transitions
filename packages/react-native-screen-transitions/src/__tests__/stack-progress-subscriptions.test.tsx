import { afterEach, expect, it } from "bun:test";
import { memo, useMemo, type ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import createProvider from "../utils/create-provider";
import {
	readStackProgress,
	type StackProgressEntry,
} from "../providers/screen/orchestrator/helpers/stack-progress";

type Value = {
	state: { visualProgress: SharedValue<number>; ignored?: number };
	ready: boolean;
};
const { StoreProvider, useDepthMotionStore } = createProvider("DepthMotion", {
	global: true,
})<{ children?: ReactNode }, Value>(() => {
	throw new Error("Use adapted stores");
});
function progress(initial: number): SharedValue<number> {
	let value = initial;
	return {
		get: () => value,
		set: (next: number) => {
			value = next;
		},
	} as SharedValue<number>;
}
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
	act(() => renderer?.unmount());
	renderer = undefined;
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("selects live handles through real global multi-key subscriptions", () => {
	const a = progress(1),
		b = progress(0.4),
		c = progress(0.2);
	let keys = ["depth-A", "depth-B", "depth-C"];
	let stores: Record<string, Value> = {
		"depth-A": { state: { visualProgress: a }, ready: false },
		"depth-B": { state: { visualProgress: b }, ready: false },
	};
	let renders = 0;
	let entries: StackProgressEntry[] = [];
	const Reader = memo(function Reader({ routeKeys }: { routeKeys: string[] }) {
		renders++;
		const values = useDepthMotionStore(
			routeKeys,
			(store) => store.state.visualProgress,
		);
		entries = useMemo(
			() =>
				routeKeys.flatMap((routeKey, index) =>
					values[index] ? [{ routeKey, visualProgress: values[index]! }] : [],
				),
			[routeKeys, values],
		);
		return null;
	});
	const update = () =>
		act(() => {
			const tree = (
				<>
					{Object.entries(stores).map(([key, value]) => (
						<StoreProvider key={key} storeKey={key} value={value} />
					))}
					<Reader routeKeys={keys} />
				</>
			);
			if (renderer) renderer.update(tree);
			else renderer = create(tree);
		});
	update();
	expect(entries.map((entry) => entry.routeKey)).toEqual([
		"depth-A",
		"depth-B",
	]);
	expect(readStackProgress(entries, "depth-A", 99)).toBe(1.4);
	const baseline = renders,
		original = entries;
	stores = {
		...stores,
		"depth-A": { state: { visualProgress: a, ignored: 1 }, ready: true },
		"depth-B": { state: { visualProgress: b, ignored: 2 }, ready: true },
	};
	update();
	expect(renders).toBe(baseline);
	expect(entries).toBe(original);
	stores = {
		...stores,
		"depth-C": { state: { visualProgress: c }, ready: true },
	};
	update();
	expect(renders).toBeGreaterThan(baseline);
	expect(entries.map((entry) => entry.routeKey)).toEqual(keys);
	const replacement = progress(0.8);
	stores = {
		...stores,
		"depth-B": { state: { visualProgress: replacement }, ready: true },
	};
	update();
	expect(entries[1].visualProgress).toBe(replacement);
	expect(readStackProgress(entries, "depth-B", 99)).toBe(1);
	keys = ["depth-C", "depth-A", "depth-B"];
	update();
	expect(readStackProgress(entries, "depth-A", 99)).toBe(1.8);
	expect(readStackProgress(entries, "missing", 99)).toBe(99);
	delete stores["depth-A"];
	update();
	expect(entries.map((entry) => entry.routeKey)).toEqual([
		"depth-C",
		"depth-B",
	]);
	expect(readStackProgress(entries, "depth-A", 99)).toBe(99);
	// Hydration writes visualProgress immediately before reading the suffix.
	// Neither selector nor entries cache the numerical value.
	replacement.set(0.25);
	expect(readStackProgress(entries, "depth-C", 99)).toBe(0.45);
	const retained = entries;
	c.set(0);
	expect(entries).toBe(retained);
	expect(readStackProgress(entries, "depth-C", 99)).toBe(0.25);
});

it("includes real hydration writes in the same suffix read", async () => {
	const { mountMotionValues } = await import("./helpers/mount-motion-values");
	const { useInterpolatorState } = await import(
		"../providers/screen/orchestrator/helpers/use-interpolator-state"
	);
	const { hydrateTransitionState } = await import(
		"../providers/screen/motion/animation/helpers/hydrate-transition-state"
	);
	const { DEFAULT_SCREEN_TRANSITION_OPTIONS } = await import("../constants");
	const values = mountMotionValues();
	const motion = {
		...values,
		route: { key: "live", name: "Live" },
		options: DEFAULT_SCREEN_TRANSITION_OPTIONS,
		meta: {},
		hasAutoSnapPoint: false,
		sortedNumericSnapPoints: [],
		scrollMetadata: { get: () => null } as any,
	};
	let built: ReturnType<typeof useInterpolatorState>;
	function Probe() {
		built = useInterpolatorState(motion);
		return null;
	}
	act(() => {
		renderer = create(<Probe />);
	});
	const tail = progress(0.2);
	const entries = [
		{ routeKey: "live", visualProgress: values.visualProgress },
		{ routeKey: "closing", visualProgress: tail },
	];
	values.transitionProgress.set(0.7);
	const frame = hydrateTransitionState(built!, { width: 400, height: 800 });
	expect(values.visualProgress.get()).toBe(frame.progress);
	expect(readStackProgress(entries, "live", 99)).toBeCloseTo(
		frame.progress + 0.2,
	);
	values.transitionProgress.set(0.35);
	hydrateTransitionState(built!, { width: 400, height: 800 });
	expect(readStackProgress(entries, "live", 99)).toBeCloseTo(0.55);
});
