import { cn } from "@repo/utils"
import { LoaderCircle } from "lucide-react"

function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "ref">) {
  return (
    <LoaderCircle data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
