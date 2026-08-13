import type { UIConfig, ViewHandlerReturnType } from '../typings/app';

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') {
    return '/';
  }
  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

export function entryPointHandler({
  basePath,
  uiConfig,
}: {
  basePath: string;
  uiConfig: UIConfig;
}): ViewHandlerReturnType {
  const serializedUiConfig = JSON.stringify(uiConfig)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return {
    name: 'index',
    params: {
      basePath: normalizeBasePath(basePath),
      uiConfig: serializedUiConfig,
    },
  };
}
