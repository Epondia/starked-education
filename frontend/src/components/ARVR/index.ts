// Core AR/VR Components
export { WebXREngine } from './WebXREngine';
export { ModelViewer } from './ModelViewer';
export { VirtualClassroom } from './VirtualClassroom';
export { InteractiveSimulation } from './InteractiveSimulation';
export { GestureControls } from './GestureControls';
export { PerformanceOptimizer } from './PerformanceOptimizer';

// Types - only export what is actually exported from source modules
export type { XRMode, XRSessionState } from './WebXREngine';
export type { ModelFormat, RenderMode, InteractionMode, LoadingState } from './ModelViewer';
export type { ClassroomLayout, AvatarState, UserRole } from './VirtualClassroom';
export type { SimulationType, ExperimentState } from './InteractiveSimulation';
export type { GestureType, HandSide, TrackingMode, ConfidenceLevel } from './GestureControls';
export type { PerformanceMode, OptimizationStrategy, DeviceType } from './PerformanceOptimizer';
