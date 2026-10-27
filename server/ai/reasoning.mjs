// The provider catalog determines the supported subset for each model.
export const REASONING_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export const validReasoningEffort = value => value === '' || REASONING_EFFORTS.includes(value);
