export type UIConfig = {
  boardTitle?: string;
  pollingInterval?: {
    forceInterval?: number;
  };
};

const DEFAULT_CONFIG: UIConfig = {
  boardTitle: 'bullmq-dash',
};

export function readUiConfig(): UIConfig {
  const element = document.getElementById('__UI_CONFIG__');
  if (!element?.textContent) {
    return DEFAULT_CONFIG;
  }

  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(element.textContent) as UIConfig) };
  } catch {
    return DEFAULT_CONFIG;
  }
}
