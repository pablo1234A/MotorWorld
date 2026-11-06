import { forwardRef, type AnchorHTMLAttributes } from "react";

/** next/link replacement for the single-file edition: in-app paths become hash routes. */
const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }>(function Link({ href, prefetch: _p, ...rest }, ref) {
  const to = href.startsWith("/") && !href.startsWith("/api/") ? `#${href}` : href;
  return <a ref={ref} href={to} {...rest} />;
});
export default Link;
