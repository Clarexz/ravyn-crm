import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className="flex items-center justify-center w-full py-20">
      <Loader2 className={cn("w-8 h-8 animate-spin text-muted-foreground", className)} />
    </div>
  );
}
