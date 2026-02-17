export type StrictScriptEvaluationLimits = {
  maxScriptSizeBytes: number;
  maxOps: number;
  maxStackDepth: number;
  maxElementSizeBytes: number;
};

export type StrictModeConfig = {
  strictTxParse: boolean;
  strictOutPointValidation: boolean;
  strictFeeRateValidation: boolean;
  maxFeeRateSatsPerByte: number;
  strictPresetUnlockingScript: boolean;
  strictMultisigKeys: boolean;
  strictScriptReader: boolean;
  strictScriptEvaluation: boolean;
  scriptEvaluationLimits: StrictScriptEvaluationLimits;
};

const defaultStrictModeConfig: StrictModeConfig = {
  strictTxParse: true,
  strictOutPointValidation: false,
  strictFeeRateValidation: false,
  maxFeeRateSatsPerByte: 1000,
  strictPresetUnlockingScript: false,
  strictMultisigKeys: false,
  strictScriptReader: false,
  strictScriptEvaluation: false,
  scriptEvaluationLimits: {
    maxScriptSizeBytes: 100000,
    maxOps: 50000,
    maxStackDepth: 1000,
    maxElementSizeBytes: 1024 * 1024,
  },
};

let strictModeConfig: StrictModeConfig = {
  ...defaultStrictModeConfig,
  scriptEvaluationLimits: { ...defaultStrictModeConfig.scriptEvaluationLimits },
};

export const getStrictModeConfig = (): StrictModeConfig => strictModeConfig;

export const configureStrictMode = (
  patch: Partial<StrictModeConfig>,
): StrictModeConfig => {
  strictModeConfig = {
    ...strictModeConfig,
    ...patch,
    scriptEvaluationLimits: {
      ...strictModeConfig.scriptEvaluationLimits,
      ...(patch.scriptEvaluationLimits ?? {}),
    },
  };

  return strictModeConfig;
};

export const resetStrictMode = (): StrictModeConfig => {
  strictModeConfig = {
    ...defaultStrictModeConfig,
    scriptEvaluationLimits: {
      ...defaultStrictModeConfig.scriptEvaluationLimits,
    },
  };

  return strictModeConfig;
};
