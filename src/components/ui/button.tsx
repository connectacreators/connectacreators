import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 btn-17",
  {
    variants: {
      variant: {
        default:     "btn-17-primary",
        destructive: "btn-17-destructive",
        outline:     "btn-17-secondary",
        secondary:   "btn-17-secondary",
        ghost:       "hover:bg-accent/20 hover:text-accent-foreground rounded-full",
        link:        "text-primary underline-offset-4 hover:underline",
        hero:        "btn-17-hero font-semibold tracking-wide",
        glass:       "btn-17-secondary",
        cta:         "btn-17-primary font-semibold tracking-wide",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm:      "h-9 px-4 text-xs",
        lg:      "h-11 px-8",
        xl:      "h-14 px-10 text-lg",
        icon:    "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
