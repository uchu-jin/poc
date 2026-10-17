export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// 同じ値なら入れ直さない（フォーカスを保ち、読み上げソフトに同じ文を繰り返させない）
export function setText(node: Node, value: string) {
  if (node.textContent !== value) node.textContent = value;
}
