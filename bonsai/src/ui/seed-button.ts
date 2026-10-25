// 保存データがないときの「種をまく」（FR-001）。seed は UI 側で作る（core では乱数の元を作らない）。

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

export interface SeedScreen {
  show(visible: boolean): void;
}

export function createSeedScreen(root: HTMLElement, onPlant: () => void): SeedScreen {
  const box = document.createElement('div');
  box.className = 'seed-screen';
  box.id = 'seed-screen';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'seed-button';
  button.textContent = '種をまく';
  button.addEventListener('click', onPlant);
  box.append(button);
  root.append(box);
  return {
    show(visible) {
      box.hidden = !visible;
    },
  };
}
