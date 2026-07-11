export interface RoutingDecision {
  route: 'new-image' | 'edit-video';
  prompt: string;
}

export function routePrompt(input: string, activeAssetId?: string): RoutingDecision {
  const normalized = input.toLowerCase();

  // If there is an active asset and the input contains change keywords, route to edit
  const isEdit = activeAssetId && (
    normalized.includes('change') ||
    normalized.includes('turn') ||
    normalized.includes('animate') ||
    normalized.includes('put on') ||
    normalized.includes('wear') ||
    normalized.includes('replace') ||
    normalized.includes('add') ||
    normalized.includes('remove') ||
    normalized.includes('make') ||
    normalized.includes('pan') ||
    normalized.includes('zoom') ||
    normalized.includes('background') ||
    normalized.includes('wardrobe') ||
    normalized.includes('apparel')
  );

  if (isEdit) {
    return { route: 'edit-video', prompt: input };
  }

  return { route: 'new-image', prompt: input };
}
