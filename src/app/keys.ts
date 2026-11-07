/**
 * Key labels in the player's own keyboard layout. Bindings are positions (KeyboardEvent
 * code: the key where W sits on a US keyboard), so on AZERTY the forward key is labelled
 * Z, not W. Where the browser can say what each position types (Chromium's Keyboard
 * API), `<kbd data-code="KeyW KeyA KeyS KeyD">` elements are relabelled; elsewhere they
 * keep their US labels.
 */
export function labelKeys(root: ParentNode): void {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
  if (!keyboard?.getLayoutMap) return;
  keyboard
    .getLayoutMap()
    .then((map) => {
      for (const el of root.querySelectorAll<HTMLElement>('kbd[data-code]')) {
        const labels = el.dataset.code!.split(' ').map((code) => map.get(code)?.toUpperCase());
        if (labels.every((l) => l)) el.textContent = labels.join(' ');
      }
    })
    .catch(() => undefined);
}
