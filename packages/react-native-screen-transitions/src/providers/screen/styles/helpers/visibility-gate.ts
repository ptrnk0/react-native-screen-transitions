import { LifecycleTransitionRequestKind } from "../../../../stores/system.store";
import {
	hasOpenTransitionStarted,
	isOpenTransitionBlocked,
} from "./transition-visual-state";

type ScreenVisibilityGateState = {
	isFloatingOverlay?: boolean;
	hasVisibilityGateOpened: boolean;
	pendingLifecycleStartBlockCount: number;
	pendingLifecycleRequestKind: LifecycleTransitionRequestKind;
	animationProgress: number;
	entering: number;
};

type ScreenVisibilityGateDecision = {
	shouldBlock: boolean;
	shouldOpenGate: boolean;
};

type InitialDestinationStyleGateState = {
	shouldPrepareStyles: boolean;
	isVisibilityBlocked: boolean;
	stylesReady: boolean;
};

type InitialDestinationStyleGateDecision = {
	shouldMarkStylesReady: boolean;
	shouldWithholdStyles: boolean;
};

export const resolveInitialDestinationStyleGate = ({
	shouldPrepareStyles,
	isVisibilityBlocked,
	stylesReady,
}: InitialDestinationStyleGateState): InitialDestinationStyleGateDecision => {
	"worklet";

	return {
		shouldMarkStylesReady:
			shouldPrepareStyles && isVisibilityBlocked && !stylesReady,
		shouldWithholdStyles: shouldPrepareStyles && !stylesReady,
	};
};

export const resolveScreenVisibilityGate = ({
	isFloatingOverlay,
	hasVisibilityGateOpened,
	pendingLifecycleStartBlockCount,
	pendingLifecycleRequestKind,
	animationProgress,
	entering,
}: ScreenVisibilityGateState): ScreenVisibilityGateDecision => {
	"worklet";
	if (isFloatingOverlay || hasVisibilityGateOpened) {
		return {
			shouldBlock: false,
			shouldOpenGate: false,
		};
	}

	const isPendingOpen =
		pendingLifecycleRequestKind === LifecycleTransitionRequestKind.Open;
	const isOpening = isPendingOpen || !!entering;
	const shouldBlock = isOpenTransitionBlocked({
		opening: isOpening,
		pendingLifecycleStartBlockCount,
		animationProgress,
	});

	return {
		shouldBlock,
		shouldOpenGate:
			!shouldBlock &&
			hasOpenTransitionStarted({
				pendingLifecycleStartBlockCount,
				animationProgress,
			}),
	};
};

/**
 * A screen that never runs an open transition (the first route of a stack,
 * unless `experimental_animateOnInitialMount` is set) must not start blocked:
 * nothing would ever drive its progress past zero, so its visibility would
 * hinge on a later UI-thread style update alone. If that update is lost, the
 * screen stays parked off-screen.
 */
export const resolveInitialVisibilityBlocked = ({
	isFloatingOverlay,
	isFirstKey,
	animateOnInitialMount,
}: {
	isFloatingOverlay?: boolean;
	isFirstKey: boolean;
	animateOnInitialMount?: boolean;
}): boolean => {
	if (isFloatingOverlay) {
		return false;
	}

	return !(isFirstKey && !animateOnInitialMount);
};
