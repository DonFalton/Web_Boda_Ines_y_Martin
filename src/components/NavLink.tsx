import { forwardRef, type AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> {
  to: string;
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName: _pendingClassName, to, ...props }, ref) => {
    const current = window.location.pathname.replace(/\/+$/, "") || "/";
    const target = to.replace(/\/+$/, "") || "/";
    return <a ref={ref} href={to} className={cn(className, current === target && activeClassName)} {...props} />;
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
