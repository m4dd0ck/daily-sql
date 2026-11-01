type Child = Node | string | null | undefined | false;

/**
 * Create an element with attributes and children. Strings become text nodes, never HTML,
 * so puzzle prose and query results cannot inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

/** The element with this id, or an error naming it (the page skeleton is fixed). */
export function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element;
}

/** byId, also checking the element's type, e.g. byIdAs('run-button', HTMLButtonElement). */
export function byIdAs<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = byId(id);
  if (!(element instanceof type)) throw new Error(`#${id} is not a ${type.name}`);
  return element;
}
