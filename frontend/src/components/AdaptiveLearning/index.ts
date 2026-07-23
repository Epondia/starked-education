// Core Components
export { LearningStyleDetector } from './LearningStyleDetector';
export { DynamicLayoutAdapter } from './DynamicLayoutAdapter';
export { ContentPresentationEngine } from './ContentPresentationEngine';
export { InteractionPatternOptimizer } from './InteractionPatternOptimizer';
export { AccessibilityAutoSwitch } from './AccessibilityAutoSwitch';
export { DifficultyAdjustmentEngine } from './DifficultyAdjustmentEngine';
export { RealTimeAdaptationEngine } from './RealTimeAdaptationEngine';

// Types
export type { LearningStyle } from './LearningStyleDetector';
export type { AccessibilityMode } from './AccessibilityAutoSwitch';
export type { DifficultyLevel } from './DifficultyAdjustmentEngine';

// Re-exports from RealTimeAdaptationEngine (only what is actually exported)
export type {
  AdaptationTrigger,
  AdaptationPriority,
} from './RealTimeAdaptationEngine';
