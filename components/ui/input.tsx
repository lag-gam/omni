import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-14 w-full rounded-full border border-border bg-background px-5 text-[17px] font-normal tracking-tight",
          "placeholder:text-muted-foreground/70",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
