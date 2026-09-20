import { afterEach, expect, it } from "bun:test";
import { memo, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStackProgressRouteSelector } from "../providers/orchestrator/helpers/use-stack-progress-inputs";
import {
	readStackProgress,
	type StackProgressEntry,
} from "../providers/orchestrator/helpers/stack-progress";
import createProvider from "../utils/create-provider";
import type { SharedValue } from "react-native-reanimated";

const { StoreProvider, useOptionalSuffixStore } = createProvider("Suffix")<
	{ children?: ReactNode },
	{ routeKeys: readonly string[] }
>(() => {
	throw new Error("Adapted only");
});
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
	act(() => renderer?.unmount());
	renderer = undefined;
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("does not rerender a real store subscriber for changes below its suffix", () => {
	const select = createStackProgressRouteSelector("C");
	let renders = 0;
	let selected: readonly string[] = [];
	const Reader = memo(function Reader() {
		renders++;
		selected = useOptionalSuffixStore(select);
		return null;
	});
	const update = (routeKeys: readonly string[]) =>
		act(() => {
			const element = (
				<StoreProvider value={{ routeKeys }}>
					<Reader />
				</StoreProvider>
			);
			if (renderer) renderer.update(element);
			else renderer = create(element);
		});
	update(["A", "B", "C", "D"]);
	const baseline = renders,
		original = selected;
	update(["X", "C", "D"]);
	update(["Z", "Y", "C", "D"]);
	expect(renders).toBe(baseline);
	expect(selected).toBe(original);
	update(["C", "D", "E"]);
	expect(selected).toEqual(["C", "D", "E"]);
	expect(renders).toBeGreaterThan(baseline);
	update(["D", "C", "E"]);
	expect(selected).toEqual(["C", "E"]);
	update(["D", "E"]);
	expect(selected).toEqual([]);
	const removed = selected,
		removedRenders = renders;
	update(["X", "D", "E"]);
	expect(selected).toBe(removed);
	expect(renders).toBe(removedRenders);
});

it("matches full-list suffix values for missing, retained and reordered routes", () => {
	const values = new Map<string, SharedValue<number>>();
	for (const [key, initial] of [
		["A", 1],
		["B", 0.7],
		["C", 0.3],
		["D", 0],
	] as const) {
		let value: number = initial;
		values.set(key, {
			get: () => value,
			set: (next: number) => {
				value = next;
			},
		} as SharedValue<number>);
	}
	const entries = (keys: readonly string[]): StackProgressEntry[] =>
		keys.flatMap((routeKey) =>
			values.has(routeKey)
				? [{ routeKey, visualProgress: values.get(routeKey)! }]
				: [],
		);
	for (const current of ["A", "B", "C", "D", "missing"]) {
		const select = createStackProgressRouteSelector(current);
		for (const routeKeys of [
			["A", "B", "C", "D"],
			["D", "B", "A", "C"],
			["A", "missing", "C"],
			[],
			["A", "B", "B", "C"],
		]) {
			expect(
				readStackProgress(entries(select({ routeKeys })), current, 37),
			).toBe(readStackProgress(entries(routeKeys), current, 37));
		}
	}
	const select = createStackProgressRouteSelector("C");
	expect(select(null)).toEqual([]);
	const keys = select({ routeKeys: ["A", "C", "D"] });
	const liveEntries = entries(keys);
	values.get("C")!.set(0.8);
	expect(readStackProgress(liveEntries, "C", 37)).toBe(0.8);
	values.delete("C");
	expect(readStackProgress(entries(keys), "C", 37)).toBe(37);
	expect(
		createStackProgressRouteSelector("A")({ routeKeys: ["A", "B"] }),
	).toEqual(["A", "B"]);
	expect(select({ routeKeys: ["X", "C", "D"] })).toBe(keys);
});
