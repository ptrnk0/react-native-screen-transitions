import { afterEach, expect, it, mock } from "bun:test";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

let scene: any = {
	descriptor: {},
	previousDescriptor: undefined,
	nextDescriptor: undefined,
};
const routeKeys = ["A"];
let builderValue = 0;
const sceneListeners = new Set<() => void>();
const listeners = new Set<() => void>();
let motionRenders = 0;
let descendantValue = 0;
let mounts = 0;
const passthrough = ({ children }: { children?: ReactNode }) => children;
mock.module("react-native-gesture-handler", () => ({
	GestureHandlerRootView: passthrough,
}));
mock.module("react-native-safe-area-context", () => ({
	SafeAreaProvider: passthrough,
}));
mock.module("../components/boundary/portal", () => ({
	PortalProvider: passthrough,
}));
mock.module("../components/overlay", () => ({
	Overlay: () => null,
}));
mock.module("../navigators/blank-stack/components/lifecycle/blank-stack", () => ({
	BlankStackLifecycle: () => null,
}));
mock.module("../navigators/blank-stack/state/blank-stack.provider", () => ({
	BlankStackProvider: passthrough,
	useBlankStackStore: (select: (s: any) => unknown) =>
		useSyncExternalStore(
			(callback) => {
				sceneListeners.add(callback);
				return () => {
					sceneListeners.delete(callback);
				};
			},
			() => select({ routeKeys, scenesByKey: { A: scene } }),
		),
}));
mock.module("../providers/builder", () => ({
	BuilderProvider: passthrough,
}));
mock.module("../navigators/blank-stack/hooks/use-navigation-helpers", () => ({
	useNavigationHelpers: () => ({ requestDismiss: dismiss }),
}));
const dismiss = () => {};
mock.module("../providers/motion", () => ({
	MotionProvider: ({ children }: { children: ReactNode }) => {
		motionRenders++;
		return children;
	},
}));
mock.module("../providers/orchestrator", () => ({
	OrchestratorProvider: passthrough,
}));
mock.module("../navigators/blank-stack/components/activity", () => ({
	ActivityScreen: passthrough,
	ActivityContainer: passthrough,
}));
mock.module("../components/screen-layers", () => ({
	ScreenLayers: passthrough,
}));
const { BlankStackView } = await import("../navigators/blank-stack/components/stack-view");
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
	act(() => renderer?.unmount());
	renderer = undefined;
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function Subscriber() {
	useEffect(() => { mounts++; }, []);
	descendantValue = useSyncExternalStore(
		(callback) => {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		},
		() => builderValue,
	);
	return null;
}
it("preserves mounted content and descendant subscriptions when scene descriptors update", () => {
	const children = <Subscriber />;
	const render = (
		child = children,
	) => {
		act(() => {
			scene = { ...scene, descriptor: { ...scene.descriptor, render: () => child } };
			for (const listener of sceneListeners) listener();
			const element = <BlankStackView />;
			if (renderer) renderer.update(element);
			else renderer = create(element);
		});
	};
	render();
	expect(mounts).toBe(1);
	act(() => {
		scene = { ...scene, descriptor: { ...scene.descriptor } };
		for (const listener of sceneListeners) listener();
	});
	expect(mounts).toBe(1);
	act(() => {
		builderValue = 1;
		for (const listener of listeners) listener();
	});
	expect(descendantValue).toBe(1);
	expect(mounts).toBe(1);
	render();
	expect(mounts).toBe(1);
	const next = motionRenders;
	render(<Subscriber />);
	expect(motionRenders).toBeGreaterThan(next);
});
