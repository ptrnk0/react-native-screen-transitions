import { type ComponentType, memo, type ReactNode, useMemo } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalProvider } from "../../../components/boundary/portal";
import { Overlay } from "../../../components/overlay";
import { ScreenLayers } from "../../../components/screen-layers";
import { BuilderProvider } from "../../../providers/builder";
import { MotionProvider } from "../../../providers/motion";
import { OrchestratorProvider } from "../../../providers/orchestrator";
import type { BlankStackProviderProps } from "../../../types/providers/blank-stack-provider.types";
import { useNavigationHelpers } from "../hooks/use-navigation-helpers";
import {
	BlankStackProvider,
	useBlankStackStore,
} from "../state/blank-stack.provider";
import { ActivityContainer, ActivityScreen } from "./activity";
import { BlankStackLifecycle } from "./lifecycle/blank-stack";

const SceneMotion = memo(function SceneMotion({
	children,
	lifecycle: Lifecycle,
}: {
	children: ReactNode;
	lifecycle: ComponentType;
}) {
	const { requestDismiss } = useNavigationHelpers();
	return (
		<MotionProvider onDismissRequest={requestDismiss}>
			<OrchestratorProvider>
				<ScreenLayers onDismissRequest={requestDismiss}>
					{children}
				</ScreenLayers>
			</OrchestratorProvider>
			<Lifecycle />
		</MotionProvider>
	);
});

export const Screen = memo(function Screen({
	routeKey,
	children,
	lifecycle,
}: {
	routeKey: string;
	children: ReactNode;
	lifecycle: ComponentType;
}) {
	const scene = useBlankStackStore((store) => store.scenesByKey[routeKey]);
	const descriptors = useMemo(
		() => ({
			current: scene.descriptor,
			previous: scene.previousDescriptor,
			next: scene.nextDescriptor,
		}),
		[scene.descriptor, scene.previousDescriptor, scene.nextDescriptor],
	);
	return (
		<BuilderProvider routeKey={routeKey} descriptors={descriptors}>
			<SceneMotion lifecycle={lifecycle}>{children}</SceneMotion>
		</BuilderProvider>
	);
});

interface RouteKeyProps {
	routeKey: string;
}

// Keep the render subscription inside the activity boundary so it can be paused.
const BlankSceneContent = memo(function BlankSceneContent({
	routeKey,
}: RouteKeyProps) {
	const render = useBlankStackStore(
		(store) => store?.scenesByKey[routeKey]?.descriptor.render,
	);
	return render?.();
});

const BlankSceneRow = memo(function BlankSceneRow({ routeKey }: RouteKeyProps) {
	return (
		<ActivityScreen routeKey={routeKey}>
			<Screen routeKey={routeKey} lifecycle={BlankStackLifecycle}>
				<BlankSceneContent routeKey={routeKey} />
			</Screen>
		</ActivityScreen>
	);
});

export const BlankStackView = memo(function BlankStackView() {
	const routeKeys = useBlankStackStore((store) => store?.routeKeys);
	return (
		<PortalProvider>
			<Overlay.Float />
			<ActivityContainer>
				{routeKeys.map((routeKey) => (
					<BlankSceneRow key={routeKey} routeKey={routeKey} />
				))}
			</ActivityContainer>
		</PortalProvider>
	);
});

export const BlankStack = memo(function BlankStack({
	state,
	navigation,
	descriptors,
}: BlankStackProviderProps) {
	return (
		<GestureHandlerRootView style={styles.container}>
			<SafeAreaProvider>
				<BlankStackProvider
					state={state}
					navigation={navigation}
					descriptors={descriptors}
				>
					<BlankStackView />
				</BlankStackProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
});

const styles = StyleSheet.create({ container: { flex: 1 } });
