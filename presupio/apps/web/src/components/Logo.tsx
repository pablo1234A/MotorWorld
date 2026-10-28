/** Marca provisional de Presupio (nombre de trabajo; ver PRODUCT.md). */
export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1d4b42" />
      <path d="M8 7h8.5a7 7 0 0 1 0 14H12v4H8z" fill="#e3efd9" />
      <path d="M12 11v6h4.5a3 3 0 0 0 0-6z" fill="#1d4b42" />
      <rect x="18" y="20" width="6" height="5" fill="#f7e6b0" />
    </svg>
  );
}

export function Brand() {
  return (
    <>
      <LogoMark />
      <span>Presupio</span>
    </>
  );
}
