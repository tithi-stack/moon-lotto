import { cn } from "@/lib/utils";
import React from "react";

export function BrutalCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "bg-white border-2 border-black rounded-xl p-6 brutal-shadow",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
