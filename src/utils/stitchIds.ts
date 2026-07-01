const PROJECT_PREFIX = "projects/";
const SCREEN_SEPARATOR = "/screens/";
const ASSET_PREFIX = "assets/";

export function toBareProjectId(projectIdOrName: string): string {
  return projectIdOrName.startsWith(PROJECT_PREFIX)
    ? projectIdOrName.slice(PROJECT_PREFIX.length)
    : projectIdOrName;
}

export function toProjectName(projectIdOrName: string): string {
  return projectIdOrName.startsWith(PROJECT_PREFIX)
    ? projectIdOrName
    : `${PROJECT_PREFIX}${projectIdOrName}`;
}

export function toBareAssetId(assetIdOrName: string): string {
  return assetIdOrName.startsWith(ASSET_PREFIX)
    ? assetIdOrName.slice(ASSET_PREFIX.length)
    : assetIdOrName;
}

export function toAssetName(assetIdOrName: string): string {
  return assetIdOrName.startsWith(ASSET_PREFIX)
    ? assetIdOrName
    : `${ASSET_PREFIX}${assetIdOrName}`;
}

export function toBareScreenId(screenIdOrName: string): string {
  const index = screenIdOrName.indexOf(SCREEN_SEPARATOR);
  return index >= 0 ? screenIdOrName.slice(index + SCREEN_SEPARATOR.length) : screenIdOrName;
}

export type StitchScreenIdentifier = {
  name: string;
  projectId: string;
  screenId: string;
};

export function toScreenIdentifier(
  screenIdOrName: string,
  projectIdOrName?: string
): StitchScreenIdentifier | null {
  if (screenIdOrName.includes(SCREEN_SEPARATOR)) {
    const [projectName, screenId] = screenIdOrName.split(SCREEN_SEPARATOR);
    if (!projectName || !screenId) return null;

    return {
      name: screenIdOrName,
      projectId: toBareProjectId(projectName),
      screenId,
    };
  }

  if (!projectIdOrName) return null;

  const projectId = toBareProjectId(projectIdOrName);
  return {
    name: `${toProjectName(projectId)}/screens/${screenIdOrName}`,
    projectId,
    screenId: screenIdOrName,
  };
}
