export function createButton(text: string, onClick?: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = text
  button.onclick = onClick ?? null
  return button
}
