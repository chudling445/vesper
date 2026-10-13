export function canShareLocalContext(provider, hostedSharingEnabled) {
  return provider === 'ollama' || hostedSharingEnabled === true;
}
