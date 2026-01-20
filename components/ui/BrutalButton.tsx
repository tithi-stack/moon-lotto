import { cn } from "@/lib/utils";
import React from "react";

interface BrutalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "outline" | "ghost";
}

export function BrutalButton({ className, variant = "primary", ...props }: BrutalButtonProps) {
    const baseStyles = "px-6 py-2.5 text-sm font-bold rounded-lg border-2 border-black transition-all active:translate-y-1 active:shadow-none";

    const variants = {
        primary: "bg-black text-white brutal-shadow brutal-hover",
        secondary: "bg-white text-black brutal-shadow brutal-hover",
        outline: "bg-transparent text-black border-black brutal-shadow-sm hover:translate-x-[2px] hover:translate-y-[2px]",
        ghost: "border-transparent shadow-none hover:bg-black/5"
    };

    return (
        <button className={cn(baseStyles, variants[variant], className)} {...props} />
    );
}
